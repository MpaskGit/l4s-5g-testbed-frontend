"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import testbedSetupDiagram from "./testbed-current-setup.png";

type ExperimentMode = "L4S / Classic" | "L4S Only" | "Classic Only";
type ExperimentStatus = "scheduled" | "paused" | "cancelled" | "completed";
type DisplayStatus =
  | "Scheduled"
  | "Running"
  | "Paused"
  | "Finished"
  | "Completed"
  | "Cancelled";

type ConfigurationMode = "Default" | "Custom";
type TrafficSource = "Local File" | "Docker Image";
type LocalTrafficProfile =
  | "bulk_http"
  | "web_api"
  | "volumetric_tiles"
  | "interactive_xr_ws"
  | "abr_video";

type ClientKpi = "E2E latency" | "CE marking" | "Goodput";
type KpiControllerKpi = "E2E latency" | "retransmissions";

interface ExperimentConfiguration {
  name: string;
  mode: ExperimentMode;
  test_duration: number;
  repeat: number;
  waiting_time: number;
}

interface KpiParameterConfiguration {
  network: { interface: string; source_ip: string; port: string };
  influxdb: {
    url: string;
    token: string;
    org: string;
    bucket: string;
    measurement: string;
  };
  experiment: { test_duration: number; repeat: number; waiting_time: number };
  debug: boolean;
}

interface ClientControllerConfiguration {
  pduSession: { sst: string; sd: string; active: boolean };
  mode: ConfigurationMode;
  traffic: {
    source: TrafficSource;
    localProfile: LocalTrafficProfile;
    dockerImage: string;
    port: string;
  };
  selectedKpis: ClientKpi[];
  kpiParameters: KpiParameterConfiguration;
}

interface KpiControllerConfiguration {
  mode: ConfigurationMode;
  selectedKpis: KpiControllerKpi[];
  kpiParameters: KpiParameterConfiguration;
}

interface EricssonControllerConfiguration {
  l4sThresholds: { highThreshold: string; lowThreshold: string };
  metricsCollectionActive: boolean;
}

type Experiment = {
  id: string;
  name: string;
  mode: ExperimentMode;
  startsAt: string;
  durationMinutes: number;
  status: ExperimentStatus;
  configuration?: ExperimentConfiguration;
  clientController?: ClientControllerConfiguration;
  kpiController?: KpiControllerConfiguration;
  ericssonController?: EricssonControllerConfiguration;
};

type SetupComponentDetails = {
  headline: string;
  body: string;
  status: string;
  rows: { label: string; value: string }[];
};

const STORAGE_KEY = "l4s-testbed-experiments";

const GRAFANA_BASE =
  "http://labserver.sense-campus.gr:8087/d-solo/efnmn0xrti4g0a/l4s-demo-monitoring";

const GRAFANA_TIME = "orgId=2&from=now-1h&to=now&timezone=browser&theme=light";

export default function Home() {
  const [now, setNow] = useState(new Date());
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [message, setMessage] = useState("Experiment control is ready.");
  const [showSetupDiagram, setShowSetupDiagram] = useState(false);
  const [activeSetupDetails, setActiveSetupDetails] =
    useState<SetupComponentDetails | null>(null);
  const setupImageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadExperiments();

    const timer = setInterval(() => {
      setNow(new Date());
      loadExperiments();
    }, 1000);

    window.addEventListener("storage", loadExperiments);

    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", loadExperiments);
    };
  }, []);

  useEffect(() => {
    if (!showSetupDiagram) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowSetupDiagram(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    window.requestAnimationFrame(() => {
      setupImageRef.current?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "smooth",
      });
    });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showSetupDiagram]);

  function closeSetupDiagram() {
    setShowSetupDiagram(false);
  }

  function loadExperiments() {
    const stored = localStorage.getItem(STORAGE_KEY);
    setExperiments(stored ? JSON.parse(stored) : []);
  }

  function saveExperiments(nextExperiments: Experiment[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextExperiments));
    setExperiments(nextExperiments);
  }

  const currentExperiment =
    experiments.find((experiment) => {
      if (
        experiment.status === "cancelled" ||
        experiment.status === "completed"
      ) {
        return false;
      }

      const start = new Date(experiment.startsAt);
      const end = new Date(
        start.getTime() + experiment.durationMinutes * 60 * 1000,
      );

      return now >= start && now < end;
    }) ?? null;

  const currentDisplayStatus = currentExperiment
    ? getDisplayStatus(currentExperiment, now)
    : null;

  const runningExperiment =
    currentExperiment && currentDisplayStatus === "Running"
      ? currentExperiment
      : null;

  const pausedExperiment =
    currentExperiment && currentDisplayStatus === "Paused"
      ? currentExperiment
      : null;

  const upcomingExperiments = experiments
    .filter(
      (experiment) =>
        experiment.status === "scheduled" &&
        new Date(experiment.startsAt).getTime() > now.getTime(),
    )
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );

  const nextExperiment = upcomingExperiments[0];

  const setupDetails = getSetupComponentDetails(
    currentExperiment,
    currentDisplayStatus,
    nextExperiment,
    now,
  );

  const displayedSetupDetails = activeSetupDetails ?? setupDetails.trafficServer;

  function updateExperimentStatus(id: string, status: ExperimentStatus) {
    const nextExperiments = experiments.map((experiment) =>
      experiment.id === id
        ? {
            ...experiment,
            status,
          }
        : experiment,
    );

    saveExperiments(nextExperiments);
  }

  function pauseExperiment() {
    if (!runningExperiment) return;

    updateExperimentStatus(runningExperiment.id, "paused");
    setMessage(`Paused "${runningExperiment.name}".`);
  }

  function resumeExperiment() {
    if (!pausedExperiment) return;

    updateExperimentStatus(pausedExperiment.id, "scheduled");
    setMessage(`Resumed "${pausedExperiment.name}".`);
  }

  function stopExperiment() {
    if (!currentExperiment) return;

    updateExperimentStatus(currentExperiment.id, "completed");
    setMessage(`Stopped "${currentExperiment.name}".`);
  }

  function openSetupDiagram() {
    setShowSetupDiagram(true);
    setMessage("Opening current testbed setup diagram.");
  }

  return (
    <main className="l4s-pretty-page min-h-screen bg-white text-slate-900">
      <style jsx global>{`
        .l4s-pretty-page {
          --l4s-cyan: 8 145 178;
          --l4s-emerald: 5 150 105;
          --l4s-violet: 109 40 217;
          --l4s-amber: 217 119 6;
        }

        .l4s-pretty-page section,
        .l4s-pretty-page .pretty-card,
        .l4s-pretty-page .pretty-rise {
          animation: l4s-rise-in 520ms ease both;
        }

        .l4s-pretty-page table tbody tr {
          transition:
            transform 180ms ease,
            background-color 180ms ease,
            box-shadow 180ms ease;
        }

        .l4s-pretty-page table tbody tr:hover {
          transform: translateX(4px);
          box-shadow: inset 3px 0 0 rgb(var(--l4s-cyan));
        }

        .l4s-pretty-page button:not(:disabled),
        .l4s-pretty-page a,
        .l4s-pretty-page [role="button"] {
          transform-origin: center;
          will-change: transform, box-shadow, border-color, background-color;
        }

        .l4s-pretty-page button:not(:disabled):hover,
        .l4s-pretty-page a:hover,
        .l4s-pretty-page [role="button"]:hover {
          transform: translateY(-2px);
        }

        .l4s-pretty-page button:not(:disabled):active,
        .l4s-pretty-page a:active,
        .l4s-pretty-page [role="button"]:active {
          transform: translateY(0) scale(0.97);
        }

        .l4s-pretty-page .glass-card {
          position: relative;
          overflow: hidden;
          border: 1px solid rgb(226 232 240);
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.98),
            rgba(248, 250, 252, 0.96)
          );
          box-shadow: 0 18px 45px rgba(15, 23, 42, 0.08);
        }

        .l4s-pretty-page .glass-card::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(
              circle at 20% 0%,
              rgba(8, 145, 178, 0.11),
              transparent 34%
            ),
            radial-gradient(
              circle at 100% 20%,
              rgba(109, 40, 217, 0.07),
              transparent 28%
            );
          opacity: 0;
          transition: opacity 220ms ease;
        }

        .l4s-pretty-page .glass-card:hover::before {
          opacity: 1;
        }

        .l4s-pretty-page .setup-panel-card,
        .l4s-pretty-page .setup-diagram-frame {
          overflow: visible;
        }

        .l4s-pretty-page .setup-panel-card {
          z-index: 10;
        }

        .l4s-pretty-page .soft-title {
          letter-spacing: -0.035em;
          background: linear-gradient(
            90deg,
            rgb(15 23 42),
            rgb(8 145 178),
            rgb(15 23 42)
          );
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .l4s-pretty-page .metric-shell {
          border: 1px solid rgb(226 232 240);
          background: linear-gradient(
            135deg,
            rgb(255 255 255),
            rgb(248 250 252)
          );
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.9),
            0 12px 30px rgba(15, 23, 42, 0.06);
        }

        @keyframes l4s-rise-in {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes l4s-pulse-glow {
          0%,
          100% {
            box-shadow: 0 0 0 0 rgba(8, 145, 178, 0.22);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(8, 145, 178, 0);
          }
        }
      `}</style>
      <section className="mx-auto max-w-7xl px-8 py-8">
        <div className="mb-8">
          <h2 className="soft-title text-3xl font-bold">
            Home / Testbed Overview
          </h2>
          <p className="mt-2 text-slate-600">
            Operational overview of the L4S-enabled 5G testbed orchestration
            platform.
          </p>
        </div>

        <div className="mb-6 glass-card rounded-2xl p-5 shadow-sm">
          <p className="text-sm text-slate-600">System Message</p>
          <p className="mt-1 font-medium text-cyan-700">{message}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Current Experiment</h3>

              {currentExperiment ? (
                <StatusBadge status={currentDisplayStatus ?? "Scheduled"} />
              ) : (
                <Badge color="slate" label="Idle" />
              )}
            </div>

            {currentExperiment ? (
              <div className="grid gap-4 md:grid-cols-3">
                <Info label="Experiment Name" value={currentExperiment.name} />
                <Info label="Mode" value={currentExperiment.mode} />
                <Info
                  label="Remaining Time"
                  value={formatRemainingTime(
                    now,
                    new Date(currentExperiment.startsAt),
                    currentExperiment.durationMinutes,
                  )}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-lg font-semibold">
                  No experiment is currently running.
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  The testbed is available until the next scheduled experiment.
                </p>

                {nextExperiment && (
                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <Info label="Next Experiment" value={nextExperiment.name} />
                    <Info
                      label="Starts At"
                      value={formatDateTime(new Date(nextExperiment.startsAt))}
                    />
                    <Info
                      label="Available Window"
                      value={formatUntil(
                        now,
                        new Date(nextExperiment.startsAt),
                      )}
                    />
                  </div>
                )}
              </div>
            )}
          </Panel>

          <Panel>
            <h3 className="text-lg font-semibold">Experiment Control</h3>
            <p className="mt-2 text-sm text-slate-600">
              Pause, resume, or stop the current running experiment.
            </p>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Testbed State</p>
              <p className="mt-1 text-xl font-semibold text-cyan-700">
                {currentExperiment && currentDisplayStatus
                  ? `Experiment ${currentDisplayStatus}`
                  : "Idle"}
              </p>
            </div>

            <div className="mt-5 grid gap-3">
              <button
                onClick={pauseExperiment}
                disabled={!runningExperiment}
                className="rounded-xl border border-amber-500 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-amber-100 hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:active:scale-100"
              >
                Pause
              </button>

              <button
                onClick={resumeExperiment}
                disabled={!pausedExperiment}
                className="rounded-xl border border-cyan-700 bg-cyan-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-cyan-800 hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:active:scale-100"
              >
                Resume
              </button>

              <button
                onClick={stopExperiment}
                disabled={!currentExperiment}
                className="rounded-xl border border-red-600 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-red-100 hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:active:scale-100"
              >
                Stop
              </button>
            </div>
          </Panel>
        </div>

        <Panel className="mt-6 setup-panel-card">
          <h3 className="text-lg font-semibold">Current Testbed Setup</h3>
          <p className="mt-2 text-sm text-slate-600">
            Traffic flow: Traffic Server → Ericsson gNB → UE groups.
          </p>

          <div
            data-setup-diagram-frame
            className="setup-diagram-frame relative mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-8"
            onMouseLeave={() => setActiveSetupDetails(null)}
          >
            <button
              type="button"
              onClick={showSetupDiagram ? closeSetupDiagram : openSetupDiagram}
              className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-cyan-700 bg-cyan-700 text-xs font-bold text-white shadow-md transition-all duration-200 hover:scale-110 hover:bg-cyan-800 hover:shadow-lg active:scale-90"
              aria-label={
                showSetupDiagram
                  ? "Close current testbed setup diagram preview"
                  : "Open current testbed setup diagram preview"
              }
              title={
                showSetupDiagram
                  ? "Close current testbed setup diagram preview"
                  : "Open current testbed setup diagram preview"
              }
            >
              {showSetupDiagram ? "Hide" : "View"}
            </button>

            <div className="grid items-center gap-6 lg:grid-cols-[1.2fr_0.4fr_1.2fr_0.4fr_1.5fr]">
              <TopologyNode
                icon="🖥️"
                title="Traffic Server"
                subtitle="Downlink source"
                accent="cyan"
                details={setupDetails.trafficServer}
                onActivate={() => setActiveSetupDetails(setupDetails.trafficServer)}
              />

              <TrafficArrow label="Traffic" />

              <TopologyNode
                icon="📡"
                title="Ericsson gNB"
                subtitle="5G RAN infrastructure"
                accent="violet"
                details={setupDetails.gnb}
                onActivate={() => setActiveSetupDetails(setupDetails.gnb)}
              />

              <TrafficArrow label="5G radio" />

              <div className="grid gap-4">
                <TopologyNode
                  icon="📱"
                  title="L4S UE Group"
                  subtitle="Low-latency capable UEs"
                  accent="emerald"
                  details={setupDetails.l4sUeGroup}
                onActivate={() => setActiveSetupDetails(setupDetails.l4sUeGroup)}
                />

                <TopologyNode
                  icon="📱"
                  title="Classic UE Group"
                  subtitle="Conventional traffic UEs"
                  accent="blue"
                  details={setupDetails.classicUeGroup}
                onActivate={() => setActiveSetupDetails(setupDetails.classicUeGroup)}
                />

                <TopologyNode
                  icon="📲"
                  title="Android Background UEs"
                  subtitle="Background load generators"
                  accent="amber"
                  details={setupDetails.backgroundUes}
                onActivate={() => setActiveSetupDetails(setupDetails.backgroundUes)}
                />
              </div>
            </div>

            <SetupDetailsPanel details={displayedSetupDetails} />
          </div>

          {showSetupDiagram && (
            <div
              ref={setupImageRef}
              className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
              role="region"
              aria-label="Current testbed setup diagram preview"
            >
              <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
                <div>
                  <h4 className="text-base font-semibold text-slate-900">
                    Current Testbed Setup Diagram
                  </h4>
                  <p className="mt-1 text-xs text-slate-500">
                    This preview stays inside the page. Press Esc or Close to
                    hide it.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeSetupDiagram}
                  className="inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-500 hover:bg-cyan-50 hover:text-cyan-800 hover:shadow-md active:scale-95"
                  aria-label="Close current testbed setup diagram preview"
                  title="Close preview"
                >
                  Close ×
                </button>
              </div>

              <div className="max-h-[70vh] overflow-auto p-4">
                <Image
                  src={testbedSetupDiagram}
                  alt="Current testbed setup diagram"
                  className="h-auto w-full rounded-xl border border-slate-300"
                  priority
                />
              </div>
            </div>
          )}
        </Panel>

        <Panel className="mt-6">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              Scheduled Experiment Queue
            </h3>
            <span className="text-sm text-slate-600">
              {upcomingExperiments.length} upcoming
            </span>
          </div>

          <div className="metric-shell overflow-x-auto rounded-xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Experiment</th>
                  <th className="px-4 py-3">Start</th>
                  <th className="px-4 py-3">End</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>

              <tbody>
                {experiments
                  .filter((experiment) => experiment.status !== "cancelled")
                  .map((experiment) => {
                    const start = new Date(experiment.startsAt);
                    const end = new Date(
                      start.getTime() + experiment.durationMinutes * 60 * 1000,
                    );
                    const displayStatus = getDisplayStatus(experiment, now);

                    return (
                      <tr
                        key={experiment.id}
                        className="border-t border-slate-200 transition hover:bg-cyan-50/70"
                      >
                        <td className="px-4 py-3 font-medium">
                          {experiment.name}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {formatDateTime(start)}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {formatTime(end)}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {experiment.durationMinutes} min
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {experiment.mode}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={displayStatus} />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="mt-6">
          <h3 className="text-lg font-semibold">Grafana Metrics Preview</h3>
          <p className="mt-2 text-sm text-slate-600">
            Live preview of one L4S testbed KPI panel from Grafana.
          </p>

          <div className="mt-6">
            <GrafanaPanel title="Latency" panelId={1} />
          </div>
        </Panel>

        <Panel className="mt-6">
          <h3 className="text-lg font-semibold">Grafana Dashboards</h3>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <DashboardLink title="Network Metrics Dashboard" />
            <DashboardLink title="Client / Server Metrics Dashboard" />
          </div>
        </Panel>
      </section>
    </main>
  );
}

function getSetupComponentDetails(
  currentExperiment: Experiment | null,
  currentStatus: DisplayStatus | null,
  nextExperiment: Experiment | undefined,
  now: Date,
) {
  const experiment = currentExperiment ?? nextExperiment ?? null;
  const client = experiment?.clientController;
  const kpi = experiment?.kpiController;
  const ericsson = experiment?.ericssonController;
  const config = experiment?.configuration;

  const state =
    currentExperiment && currentStatus
      ? `${currentExperiment.name} · ${currentStatus} · ${currentExperiment.mode}`
      : nextExperiment
        ? `Idle · next: ${nextExperiment.name} in ${formatUntil(now, new Date(nextExperiment.startsAt))}`
        : "Idle · no upcoming experiment scheduled";

  const mode = config?.mode ?? experiment?.mode ?? "No mode selected";
  const testDurationSeconds =
    config?.test_duration ?? (experiment ? experiment.durationMinutes * 60 : 0);
  const durationLabel = testDurationSeconds
    ? `${testDurationSeconds}s (${Math.ceil(testDurationSeconds / 60)} min)`
    : "-";
  const repeatLabel = config?.repeat ? `${config.repeat} run(s)` : "-";
  const waitingTimeLabel = config?.waiting_time
    ? `${config.waiting_time}s`
    : "-";
  const trafficProfile =
    client?.traffic.source === "Docker Image"
      ? client.traffic.dockerImage || "Docker image not set"
      : (client?.traffic.localProfile ?? "-");
  const trafficSource = client?.traffic.source ?? "-";
  const trafficPort =
    client?.traffic.port ?? client?.kpiParameters.network.port ?? "-";
  const pduSlice = client
    ? `SST ${client.pduSession.sst} / SD ${client.pduSession.sd}`
    : "-";
  const pduState = client?.pduSession.active ? "active" : "inactive";
  const clientKpis = client?.selectedKpis?.join(", ") || "-";
  const kpiControllerKpis = kpi?.selectedKpis?.join(", ") || "-";
  const clientNetwork = client
    ? `${client.kpiParameters.network.interface} · ${client.kpiParameters.network.source_ip}`
    : "-";
  const kpiNetwork = kpi
    ? `${kpi.kpiParameters.network.interface} · ${kpi.kpiParameters.network.source_ip}`
    : "-";
  const influxBucket =
    client?.kpiParameters.influxdb.bucket ||
    kpi?.kpiParameters.influxdb.bucket ||
    "-";
  const l4sThresholds = ericsson
    ? `${ericsson.l4sThresholds.lowThreshold}ms low / ${ericsson.l4sThresholds.highThreshold}ms high`
    : "-";
  const metricsState = ericsson?.metricsCollectionActive
    ? "collecting"
    : "stopped";
  const activeMode = experiment?.mode ?? null;
  const l4sEnabled =
    activeMode === "L4S / Classic" || activeMode === "L4S Only";
  const classicEnabled =
    activeMode === "L4S / Classic" || activeMode === "Classic Only";

  return {
    trafficServer: {
      headline: "Traffic Server configuration",
      body: experiment
        ? `Generates the selected ${trafficSource.toLowerCase()} traffic profile for the current run and feeds it into the downlink path.`
        : "No experiment is active or queued, so the traffic generator is standing by.",
      status: state,
      rows: [
        { label: "Traffic", value: trafficProfile },
        { label: "Source", value: trafficSource },
        { label: "Port", value: trafficPort },
        { label: "Duration", value: durationLabel },
        { label: "Repeat", value: repeatLabel },
      ],
    },
    gnb: {
      headline: "Ericsson gNB configuration",
      body: experiment
        ? "Applies the configured L4S thresholds and carries the experiment traffic through the 5G RAN segment."
        : "The gNB is ready, but no experiment configuration is currently selected.",
      status: state,
      rows: [
        { label: "Mode", value: mode },
        { label: "L4S thresholds", value: l4sThresholds },
        { label: "Metrics script", value: metricsState },
        { label: "Waiting time", value: waitingTimeLabel },
      ],
    },
    l4sUeGroup: {
      headline: l4sEnabled ? "L4S UE configuration" : "L4S UE not selected",
      body: l4sEnabled
        ? "Low-latency capable UEs are part of this experiment mode and use the configured client-controller network/KPI setup."
        : "This topology group is available, but the selected experiment mode is not using the L4S UE path.",
      status: state,
      rows: [
        { label: "PDU session", value: `${pduState} · ${pduSlice}` },
        { label: "Client mode", value: client?.mode ?? "-" },
        { label: "Client KPIs", value: clientKpis },
        { label: "Client network", value: clientNetwork },
      ],
    },
    classicUeGroup: {
      headline: classicEnabled
        ? "Classic UE configuration"
        : "Classic UE not selected",
      body: classicEnabled
        ? "Conventional UEs are included in the selected mode for comparison against the L4S path."
        : "This topology group remains visible, but the selected experiment mode is not using the Classic UE path.",
      status: state,
      rows: [
        { label: "Experiment mode", value: mode },
        { label: "KPI controller", value: kpi?.mode ?? "-" },
        { label: "KPI KPIs", value: kpiControllerKpis },
        { label: "KPI network", value: kpiNetwork },
      ],
    },
    backgroundUes: {
      headline: "Android background UE context",
      body: experiment
        ? "Represents background devices around the main run so the measured KPIs can be interpreted against realistic load context."
        : "Background devices are shown for topology context and will follow the next scheduled run.",
      status: state,
      rows: [
        { label: "Influx bucket", value: influxBucket },
        {
          label: "Client debug",
          value: client?.kpiParameters.debug ? "ON" : "OFF",
        },
        { label: "KPI debug", value: kpi?.kpiParameters.debug ? "ON" : "OFF" },
        { label: "Status", value: currentStatus ?? "Idle" },
      ],
    },
  };
}

function getDisplayStatus(experiment: Experiment, now: Date): DisplayStatus {
  if (experiment.status === "cancelled") return "Cancelled";
  if (experiment.status === "completed") return "Completed";

  const start = new Date(experiment.startsAt).getTime();
  const end = start + experiment.durationMinutes * 60 * 1000;
  const current = now.getTime();

  if (current < start - 1000) return "Scheduled";

  if (current >= start - 1000 && current < end) {
    return experiment.status === "paused" ? "Paused" : "Running";
  }

  return "Finished";
}

function StatusBadge({ status }: { status: DisplayStatus }) {
  if (status === "Running") return <Badge color="emerald" label="Running" />;
  if (status === "Paused") return <Badge color="amber" label="Paused" />;
  if (status === "Scheduled") return <Badge color="cyan" label="Scheduled" />;
  if (status === "Cancelled") return <Badge color="slate" label="Cancelled" />;
  if (status === "Completed") return <Badge color="slate" label="Completed" />;

  return <Badge color="slate" label="Finished" />;
}

function GrafanaPanel({ title, panelId }: { title: string; panelId: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white transition duration-200 hover:-translate-y-1 hover:border-cyan-400/60">
      <iframe
        title={title}
        src={`${GRAFANA_BASE}?${GRAFANA_TIME}&panelId=${panelId}`}
        loading="lazy"
        className="pointer-events-none h-[360px] w-full bg-white"
      />
    </div>
  );
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(date: Date) {
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatUntil(now: Date, target: Date) {
  const diff = Math.max(0, target.getTime() - now.getTime());
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  return `${minutes}m ${seconds}s`;
}

function formatRemainingTime(now: Date, start: Date, durationMinutes: number) {
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return formatUntil(now, end);
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`glass-card rounded-2xl p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${className}`}
    >
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-slate-900">{value}</p>
    </div>
  );
}

function Badge({
  color,
  label,
}: {
  color: "emerald" | "cyan" | "slate" | "amber";
  label: string;
}) {
  const colors = {
    emerald: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
    cyan: "border-cyan-400/40 bg-cyan-400/10 text-cyan-700",
    slate: "border-slate-300 bg-slate-100 text-slate-700",
    amber: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  };

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold shadow-sm ${colors[color]}`}
    >
      {label}
    </span>
  );
}

function SetupDetailsPanel({ details }: { details: SetupComponentDetails }) {
  return (
    <div className="mt-6 rounded-2xl border-2 border-slate-300 bg-white p-5 text-left shadow-xl shadow-slate-900/10">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
            Hover details
          </p>
          <h4 className="mt-1 text-base font-bold text-slate-900">
            {details.headline}
          </h4>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {details.body}
          </p>
        </div>

        <div className="shrink-0 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800">
          {details.status}
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 lg:grid-cols-4">
        {details.rows.map((row) => (
          <div key={`${row.label}-${row.value}`}>
            <p className="text-xs font-semibold text-slate-500">{row.label}</p>
            <p className="mt-1 break-words text-sm font-medium text-slate-900">
              {row.value || "-"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopologyNode({
  icon,
  title,
  subtitle,
  accent,
  details,
  onActivate,
}: {
  icon: string;
  title: string;
  subtitle: string;
  accent: "cyan" | "violet" | "emerald" | "blue" | "amber";
  details: SetupComponentDetails;
  onActivate: () => void;
}) {
  const accents = {
    cyan: {
      shell: "border-cyan-400/40 bg-cyan-400/10 hover:border-cyan-300",
      glow: "group-hover:shadow-cyan-500/20",
    },
    violet: {
      shell: "border-violet-400/40 bg-violet-400/10 hover:border-violet-300",
      glow: "group-hover:shadow-violet-500/20",
    },
    emerald: {
      shell: "border-emerald-400/40 bg-emerald-400/10 hover:border-emerald-300",
      glow: "group-hover:shadow-emerald-500/20",
    },
    blue: {
      shell: "border-blue-400/40 bg-blue-400/10 hover:border-blue-300",
      glow: "group-hover:shadow-blue-500/20",
    },
    amber: {
      shell: "border-amber-400/40 bg-amber-400/10 hover:border-amber-300",
      glow: "group-hover:shadow-amber-500/20",
    },
  };

  return (
    <div
      className={`group relative z-20 cursor-pointer rounded-2xl border p-5 text-center shadow-sm transition duration-300 ease-out hover:-translate-y-2 hover:scale-[1.03] hover:shadow-2xl focus:-translate-y-2 focus:scale-[1.03] focus:shadow-2xl active:scale-95 ${accents[accent].shell} ${accents[accent].glow}`}
      tabIndex={0}
      aria-label={`${title}: ${details.headline}. ${details.body}`}
      onMouseEnter={onActivate}
      onFocus={onActivate}
    >
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-white/0 transition duration-300 group-hover:bg-white/20 group-focus:bg-white/20" />
      <div className="relative mb-3 text-3xl transition duration-300 group-hover:scale-110 group-focus:scale-110">
        {icon}
      </div>
      <p className="relative font-semibold text-slate-900">{title}</p>
      <p className="relative mt-1 text-sm text-slate-600">{subtitle}</p>
    </div>
  );
}

function TrafficArrow({ label }: { label: string }) {
  return (
    <div className="hidden flex-col items-center justify-center text-cyan-700 lg:flex">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-4xl">&rarr;</div>
    </div>
  );
}

function DashboardLink({ title }: { title: string }) {
  return (
    <a
      href="http://labserver.sense-campus.gr:8087/public-dashboards/38173bd323c94c53af15aae543e0c915"
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl border border-slate-300 bg-slate-50 p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-cyan-500 hover:bg-cyan-50 hover:shadow-md active:scale-[0.98]"
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-3 text-sm text-cyan-700">Open Grafana →</p>
    </a>
  );
}
