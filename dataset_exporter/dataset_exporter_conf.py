"""5G/L4S exporter driven by an accepted experiment record.

Reads raw InfluxDB samples for device_0 (non-L4S) and device_1 (L4S).
Writes a 100 ms UTC, last-observation-carried-forward CSV and a separate
whole-range summary JSON. Grafana's v.windowPeriod is display dependent: the
CSV retains raw KPI samples instead of reproducing its changing means.
E2E packet matching uses unique raw sequence numbers per device, before LOCF.
No experiment metadata or controller state is inferred from the database.

Install: pip install influxdb-client python-dotenv
Configure INFLUXDB_TOKEN in a local .env; never commit the token.
Run: python dataset_exporter_configured.py --accepted-experiment accepted.json
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import statistics
from bisect import bisect_right
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv
from influxdb_client import InfluxDBClient

DEVICES = {"device_0_metrics": "non_l4s", "device_1_metrics": "l4s"}
# Exact metric and field mappings confirmed by the supplied panel queries.
FIELDS = {
    ("ce_marks", "ce_packets"): "ce_packets",
    ("ce_marks", "ce_percent"): "ce_percent",
    ("ce_marks", "total_packets"): "total_packets",
    ("goodput", "goodput_mbps"): "goodput_mbps",
    ("retransmissions", "retransmissions_per_sec"): "retransmissions_per_sec",
    ("retransmissions", "percent_retransmitted"): "percent_retransmitted",
    ("retransmissions", "retransmitted_bytes"): "retransmitted_bytes",
    ("retransmissions", "total_bytes_sent"): "total_bytes_sent",
}
LATENCY_SIDES = ("e2e_latency_client", "e2e_latency_server")
DEFAULT_START = "2026-07-23T08:00:00Z"
DEFAULT_STOP = "2026-07-23T09:00:00Z"
STEP_NS = 100_000_000
EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def parse_time(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError("Specify an explicit time zone (for example Z for UTC).")
    return dt.astimezone(timezone.utc)


def iso_ns(ns: int) -> str:
    dt = EPOCH + timedelta(microseconds=ns // 1000)
    return dt.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def flux_quote(value: str) -> str:
    return json.dumps(value, ensure_ascii=True)


def read_influx(query_api, org: str, bucket: str, start: datetime, stop: datetime, selections):
    # Build predicates only from the validated device/KPI catalog.
    predicates = []
    for measurement, device in DEVICES.items():
        for kpi in selections.get(device, []):
            if kpi == "latency":
                predicate = '((r.metric == "e2e_latency_client" or r.metric == "e2e_latency_server") and r._field == "sequence")'
            else:
                fields = [field for (metric, field), output in FIELDS.items()
                          if output in KPI_FIELDS[kpi]]
                metric = {"CE": "ce_marks", "goodput": "goodput",
                          "retransmissions": "retransmissions"}[kpi]
                predicate = f'(r.metric == {flux_quote(metric)} and (' + ' or '.join(
                    f'r._field == {flux_quote(field)}' for field in fields) + '))'
            predicates.append(f'(r._measurement == {flux_quote(measurement)} and {predicate})')
    filter_expression = " or\n      ".join(predicates)
    # Extract uint(_time) inside Flux: Python datetime would discard nanoseconds.
    query = f'''
from(bucket: {flux_quote(bucket)})
  |> range(start: time(v: {flux_quote(start.isoformat())}),
            stop: time(v: {flux_quote(stop.isoformat())}))
  |> filter(fn: (r) =>
      {filter_expression})
  |> map(fn: (r) => ({{ r with observation_epoch_ns: string(v: uint(v: r._time)) }}))
  |> keep(columns: ["_measurement", "metric", "_field", "_value", "observation_epoch_ns"])
'''
    records = []
    for table in query_api.query(org=org, query=query):
        for record in table.records:
            v = record.values
            measurement = v.get("_measurement")
            if measurement not in DEVICES:
                continue
            records.append({
                "device": DEVICES[measurement], "metric": v.get("metric"),
                "field": record.get_field(), "value": record.get_value(),
                "ns": int(v["observation_epoch_ns"]),
            })
    records.sort(key=lambda r: r["ns"])
    return records


def sequence_key(value) -> str:
    """Use the source sequence token as Grafana's string(v: _value) does.

    The source can contain a TCP byte range such as '572522493:572523709'.
    It is an opaque match key, not a numeric latency or an integer to parse.
    """
    if value is None:
        raise ValueError("Missing TCP sequence token")
    key = str(value)
    if not key:
        raise ValueError("Empty TCP sequence token")
    return key


def collect(records):
    direct = defaultdict(list)
    observations = defaultdict(lambda: defaultdict(list))
    for r in records:
        device, metric, field = r["device"], r["metric"], r["field"]
        if (metric, field) in FIELDS:
            direct[(device, FIELDS[(metric, field)])].append(r)
        elif metric in LATENCY_SIDES and field == "sequence":
            observations[(device, metric)][sequence_key(r["value"])].append(r)

    for points in direct.values():
        points.sort(key=lambda point: point["ns"])

    latency, pairing = {}, {}
    for device in DEVICES.values():
        clients = observations[(device, LATENCY_SIDES[0])]
        servers = observations[(device, LATENCY_SIDES[1])]
        counts = Counter()
        pairs = []
        for sequence in clients.keys() | servers.keys():
            c, s = clients.get(sequence, []), servers.get(sequence, [])
            if not c or not s:
                counts["unmatched_sequences"] += 1
            elif len(c) != 1 or len(s) != 1:
                counts["ambiguous_sequences"] += 1
            else:
                delta = c[0]["ns"] - s[0]["ns"]
                if delta < 0:
                    counts["negative_latency_pairs"] += 1
                else:
                    pairs.append({"ns": c[0]["ns"], "server_ns": s[0]["ns"],
                                  "sequence": sequence,
                                  "value": Decimal(delta) / Decimal(1_000_000)})
        pairs.sort(key=lambda p: p["ns"])
        counts["paired_packets"] = len(pairs)
        counts.setdefault("unmatched_sequences", 0)
        counts.setdefault("ambiguous_sequences", 0)
        counts.setdefault("negative_latency_pairs", 0)
        latency[device] = pairs
        pairing[device] = dict(counts)
        print(f"{device}: {pairing[device]}")
    return direct, latency, pairing


KPI_FIELDS = {
    "CE": ("ce_packets", "ce_percent", "total_packets"),
    "goodput": ("goodput_mbps",),
    "latency": ("e2e_latency_ms",),
    "retransmissions": ("retransmissions_per_sec", "percent_retransmitted",
                        "retransmitted_bytes", "total_bytes_sent", "retransmitted_kB"),
}


def load_experiment(path):
    """Read a normalized, server-confirmed record; no browser state or ID guesses."""
    config = json.loads(path.read_text(encoding="utf-8"))
    required = ("experiment_id", "start_utc", "stop_utc", "devices")
    for name in required:
        if name not in config:
            raise ValueError(f"Accepted experiment record missing {name}")
    start, stop = parse_time(config["start_utc"]), parse_time(config["stop_utc"])
    if start >= stop or not isinstance(config["experiment_id"], str) or not config["experiment_id"]:
        raise ValueError("Invalid accepted experiment ID or time boundaries")
    devices = config["devices"]
    if not isinstance(devices, dict) or not devices:
        raise ValueError("Provide at least one device with its selected KPIs")
    selections = {}
    for measurement, chosen in devices.items():
        if measurement not in DEVICES:
            raise ValueError(f"Unknown Influx device measurement: {measurement}")
        if not isinstance(chosen, list) or not chosen or len(chosen) != len(set(chosen)):
            raise ValueError(f"Invalid KPI list for {measurement}")
        unknown = set(chosen) - KPI_FIELDS.keys()
        if unknown:
            raise ValueError(f"Unknown KPIs for {measurement}: {sorted(unknown)}")
        selections[DEVICES[measurement]] = chosen
    return config, start, stop, selections


def selected_groups(direct, latency, selections):
    groups = {}
    for device, kpis in selections.items():
        for kpi in kpis:
            for field in KPI_FIELDS[kpi]:
                if field == "retransmitted_kB":
                    continue  # Derived from retransmitted_bytes when writing CSV.
                points = latency[device] if field == "e2e_latency_ms" else direct.get((device, field), [])
                if not points:
                    raise RuntimeError(f"Selected KPI source missing: {device}/{kpi}/{field}")
                groups[(device, field)] = points
    return groups


def native_interval_seconds(points):
    times = sorted(set(p["ns"] for p in points))
    return (statistics.median(b - a for a, b in zip(times, times[1:])) / 1e9
            if len(times) > 1 else None)


def csv_value(value):
    if isinstance(value, Decimal):
        return format(value, "f").replace(".", ",")
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("Nonfinite KPI value cannot be exported")
        return format(Decimal(str(value)), "f").replace(".", ",")
    if isinstance(value, bool):
        return str(value).lower()
    return str(value)


def make_rows(groups, experiment_id, selections):
    start = max(points[0]["ns"] for points in groups.values())
    stop = min(points[-1]["ns"] for points in groups.values())
    first_grid = ((start + STEP_NS - 1) // STEP_NS) * STEP_NS
    if first_grid > stop:
        raise RuntimeError("Required streams have no common 100 ms interval")
    timeline = range(first_grid, stop + 1, STEP_NS)
    columns = [f"{device}_{field}" for device in DEVICES.values()
               for field in [field for kpi in selections.get(device, [])
                             for field in KPI_FIELDS[kpi]]] 
    rows = [{"timestamp": iso_ns(ns), "experiment_id": experiment_id} for ns in timeline]
    for (device, field), points in groups.items():
        column = f"{device}_{field}"
        times = [p["ns"] for p in points]
        index = 0
        for row, grid_ns in zip(rows, timeline):
            while index < len(points) and points[index]["ns"] <= grid_ns:
                index += 1
            selected = points[index - 1]
            # Independent binary-search check for every exported cell.
            expected_index = bisect_right(times, grid_ns) - 1
            if expected_index != index - 1 or selected["ns"] > grid_ns:
                raise RuntimeError(f"Source alignment failed for {column}")
            if field == "e2e_latency_ms":
                expected_ms = Decimal(selected["ns"] - selected["server_ns"]) / Decimal(1_000_000)
                if selected["value"] != expected_ms:
                    raise RuntimeError(f"Latency derivation failed for {column}")
            row[column] = csv_value(selected["value"])
            if field == "retransmitted_bytes":
                kb = Decimal(str(selected["value"])) / Decimal(1024)
                if kb * Decimal(1024) != Decimal(str(selected["value"])):
                    raise RuntimeError("Retransmitted KiB conversion failed")
                row[f"{device}_retransmitted_kB"] = csv_value(kb)
    if any(set(row) != {"timestamp", "experiment_id", *columns} for row in rows):
        raise RuntimeError("Incomplete CSV row")
    return rows, ["timestamp", "experiment_id", *columns], first_grid, stop


def exact_selector(values, q):
    """Nearest-rank selection for a single ungrouped set; no interpolation."""
    ordered = sorted(values)
    if not ordered:
        return None
    return ordered[max(0, math.ceil(q * len(ordered)) - 1)]


def numeric_sum(points):
    return sum((Decimal(str(p["value"])) for p in points), Decimal(0))


def summary_for_device(device, chosen, direct, latency, pairing):
    """Whole-range statistics only for selected KPI families."""
    result = {"selected_kpis": chosen}
    get = lambda field: direct[(device, field)]
    if "latency" in chosen:
        result["pairing"] = pairing[device]
        values = [p["value"] for p in latency[device]]
        result["e2e_latency_ms_percentiles_raw_pairs"] = {
            "p95": exact_selector(values, Decimal("0.95")),
            "p99": exact_selector(values, Decimal("0.99")),
        }
    if "CE" in chosen:
        ce, total = numeric_sum(get("ce_packets")), numeric_sum(get("total_packets"))
        result["overall_ce"] = {
            "total_packets_sum_of_samples": total,
            "total_ce_packets_sum_of_samples": ce,
            "total_ce_percent_ratio_of_sums": ce / total * 100 if total > 0 else Decimal(0),
        }
    if "retransmissions" in chosen:
        retrans, sent = numeric_sum(get("retransmitted_bytes")), numeric_sum(get("total_bytes_sent"))
        values = [Decimal(str(p["value"])) for p in get("retransmissions_per_sec")]
        result["overall_retransmissions"] = {
            "total_bytes_sent_sum_of_samples": sent,
            "total_retransmitted_bytes_sum_of_samples": retrans,
            "total_retransmissions_per_sec_sum_of_samples": numeric_sum(get("retransmissions_per_sec")),
            "retransmitted_bytes_percent_ratio_of_sums": retrans / sent * 100 if sent > 0 else Decimal(0),
        }
        result["retransmissions_per_sec_percentiles_raw_samples"] = {
            "p95": exact_selector(values, Decimal("0.95")),
            "p99": exact_selector(values, Decimal("0.99")),
        }
    result["native_sampling_interval_seconds"] = {
        field: native_interval_seconds(latency[device] if field == "e2e_latency_ms" else get(field))
        for kpi in chosen for field in KPI_FIELDS[kpi] if field != "retransmitted_kB"
    }
    return result


def write_outputs(rows, columns, summary, csv_path):
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path = csv_path.with_name(csv_path.stem + "_summary.json")
    # Write temporary files first; do not replace the previous output if validation fails.
    csv_temp = csv_path.with_name(csv_path.name + ".tmp")
    summary_temp = summary_path.with_name(summary_path.name + ".tmp")
    try:
        with csv_temp.open("w", newline="", encoding="utf-8-sig") as handle:
            writer = csv.DictWriter(handle, fieldnames=columns, delimiter=";")
            writer.writeheader()
            writer.writerows(rows)
        with summary_temp.open("w", encoding="utf-8") as handle:
            json.dump(summary, handle, indent=2, ensure_ascii=False,
                      default=lambda v: float(v) if isinstance(v, Decimal) else str(v))
            handle.write("\n")
        os.replace(csv_temp, csv_path)
        os.replace(summary_temp, summary_path)
    finally:
        csv_temp.unlink(missing_ok=True)
        summary_temp.unlink(missing_ok=True)
    return summary_path


def export_configured(records, config, start, stop, selections, output, bucket):
    if not records:
        raise RuntimeError("No matching InfluxDB records for accepted experiment")
    expected_devices = set(selections)
    # Collect only chosen streams. An unselected latency stream must not impose
    # packet parsing or completeness requirements on this experiment.
    allowed = {(device, field) for device, kpis in selections.items()
               for kpi in kpis for field in KPI_FIELDS[kpi]}
    filtered = [r for r in records if r["device"] in expected_devices and (
        (r["metric"], r["field"]) in FIELDS and
        (r["device"], FIELDS[(r["metric"], r["field"])]) in allowed or
        "latency" in selections[r["device"]] and
        r["metric"] in LATENCY_SIDES and r["field"] == "sequence")]
    direct, latency, pairing = collect(filtered)
    groups = selected_groups(direct, latency, selections)
    rows, columns, grid_start, grid_stop = make_rows(groups, config["experiment_id"], selections)
    summary = {
        "experiment_id": config["experiment_id"], "bucket": bucket,
        "query_start_utc": start.isoformat(), "query_stop_utc_exclusive": stop.isoformat(),
        "dataset_start_utc": iso_ns(grid_start), "dataset_end_utc": iso_ns(grid_stop),
        "alignment": "100 ms LOCF within accepted experiment range; no future samples",
        "selected_devices": list(selections), "selected_kpis": selections,
        "csv_delimiter": ";", "csv_decimal_separator": ",",
        "latency_method": "unique raw sequence pairs per selected device; client-server ns / 1000000; no Grafana dynamic window",
        "statistics_note": "Statistics use raw selected source samples; Grafana dynamic-window results may differ.",
        "devices": {device: summary_for_device(device, kpis, direct, latency, pairing)
                    for device, kpis in selections.items()},
    }
    summary_path = write_outputs(rows, columns, summary, output)
    print(f"PASS: {len(rows)} rows, {len(columns)-2} selected KPI columns")
    print(f"CSV: {output}\nSummary: {summary_path}")
    return rows, summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--accepted-experiment", required=True, type=Path,
                        help="JSON record issued or persisted after orchestrator accepts the experiment")
    parser.add_argument("--output", type=Path, default=Path("output/dataset.csv"))
    args = parser.parse_args()
    config, start, stop, selections = load_experiment(args.accepted_experiment)
    load_dotenv()
    token = os.getenv("INFLUXDB_TOKEN")
    if not token:
        raise RuntimeError("Missing INFLUXDB_TOKEN in local .env")
    org = os.getenv("INFLUXDB_ORG", "students")
    bucket = os.getenv("INFLUXDB_BUCKET", "l4s_tests")
    with InfluxDBClient(url=os.getenv("INFLUXDB_URL", "http://labserver.sense-campus.gr:8086"),
                        token=token, org=org, timeout=120_000) as client:
        records = read_influx(client.query_api(), org, bucket, start, stop, selections)
    export_configured(records, config, start, stop, selections, args.output.resolve(), bucket)


if __name__ == "__main__":
    main()
