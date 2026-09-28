import Link from "next/link";

type ExperimentMode = "L4S / Classic" | "L4S Only" | "Classic Only";
type ExperimentStatus = "Successful" | "Stopped" | "Failed";

type Experiment = {
  id: string;
  name: string;
  status: ExperimentStatus;
  mode: ExperimentMode;
  timestamp: string;
  durationMinutes: number;
  datasetSize: string;
  ueConfig: {
    l4sUes: number;
    classicUes: number;
    androidUes: number;
  };
  traffic: string[];
  metadata: string[];
  networkParams?: {
    schedulerWeight: string;
    lowThreshold: string;
    highThreshold: string;
    fiveQi: string;
  };
  grafana: {
    networkDashboard: string;
    clientServerDashboard: string;
  };
};

const experiments: Experiment[] = [
  {
    id: "exp-001",
    name: "Downlink L4S vs Classic Evaluation",
    status: "Successful",
    mode: "L4S / Classic",
    timestamp: "30/05/2026 12:40",
    durationMinutes: 20,
    datasetSize: "184 MB",
    ueConfig: {
      l4sUes: 2,
      classicUes: 2,
      androidUes: 3,
    },
    traffic: ["Gaming", "XR / Video", "UDP Background Traffic"],
    metadata: [
      "Latency",
      "Goodput",
      "CE Marking Rate",
      "BLER",
      "UE Information",
      "Network Parameters",
    ],
    networkParams: {
      schedulerWeight: "70%",
      lowThreshold: "5 ms",
      highThreshold: "25 ms",
      fiveQi: "82",
    },
    grafana: {
      networkDashboard: "Network Metrics Dashboard",
      clientServerDashboard: "Client / Server Metrics Dashboard",
    },
  },
  {
    id: "exp-002",
    name: "XR Video Low-Latency Test",
    status: "Successful",
    mode: "L4S Only",
    timestamp: "30/05/2026 10:15",
    durationMinutes: 15,
    datasetSize: "132 MB",
    ueConfig: {
      l4sUes: 3,
      classicUes: 0,
      androidUes: 2,
    },
    traffic: ["XR / Video", "UDP Background Traffic"],
    metadata: ["Latency", "CE Marking Rate", "BLER", "UE Information"],
    networkParams: {
      schedulerWeight: "80%",
      lowThreshold: "4 ms",
      highThreshold: "20 ms",
      fiveQi: "82",
    },
    grafana: {
      networkDashboard: "Network Metrics Dashboard",
      clientServerDashboard: "Client / Server Metrics Dashboard",
    },
  },
  {
    id: "exp-003",
    name: "Classic Goodput Baseline",
    status: "Successful",
    mode: "Classic Only",
    timestamp: "29/05/2026 18:05",
    durationMinutes: 25,
    datasetSize: "156 MB",
    ueConfig: {
      l4sUes: 0,
      classicUes: 4,
      androidUes: 2,
    },
    traffic: ["File Download", "UDP Background Traffic"],
    metadata: ["Goodput", "BLER", "UE Information"],
    grafana: {
      networkDashboard: "Network Metrics Dashboard",
      clientServerDashboard: "Client / Server Metrics Dashboard",
    },
  },
  {
    id: "exp-004",
    name: "UDP Background Load Stress Test",
    status: "Stopped",
    mode: "L4S / Classic",
    timestamp: "29/05/2026 15:20",
    durationMinutes: 9,
    datasetSize: "74 MB",
    ueConfig: {
      l4sUes: 2,
      classicUes: 2,
      androidUes: 5,
    },
    traffic: ["UDP Background Traffic"],
    metadata: ["Latency", "Goodput", "CE Marking Rate", "BLER"],
    networkParams: {
      schedulerWeight: "65%",
      lowThreshold: "6 ms",
      highThreshold: "30 ms",
      fiveQi: "82",
    },
    grafana: {
      networkDashboard: "Network Metrics Dashboard",
      clientServerDashboard: "Client / Server Metrics Dashboard",
    },
  },
];

export default async function ExperimentDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const experiment =
    experiments.find((item) => item.id === id) ?? experiments[0];

  return (
    <main className="l4s-pretty-page min-h-screen bg-white text-slate-900">
      <style>{`
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
          transition: transform 180ms ease, background-color 180ms ease, box-shadow 180ms ease;
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
          background: linear-gradient(135deg, rgba(255,255,255,0.98), rgba(248,250,252,0.96));
          box-shadow: 0 18px 45px rgba(15, 23, 42, 0.08);
        }

        .l4s-pretty-page .glass-card::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at 20% 0%, rgba(8, 145, 178, 0.11), transparent 34%),
            radial-gradient(circle at 100% 20%, rgba(109, 40, 217, 0.07), transparent 28%);
          opacity: 0;
          transition: opacity 220ms ease;
        }

        .l4s-pretty-page .glass-card:hover::before {
          opacity: 1;
        }

        .l4s-pretty-page .soft-title {
          letter-spacing: -0.035em;
          background: linear-gradient(90deg, rgb(15 23 42), rgb(8 145 178), rgb(15 23 42));
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .l4s-pretty-page .metric-shell {
          border: 1px solid rgb(226 232 240);
          background: linear-gradient(135deg, rgb(255 255 255), rgb(248 250 252));
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.9), 0 12px 30px rgba(15,23,42,0.06);
        }

        @keyframes l4s-rise-in {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes l4s-pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(8, 145, 178, 0.22); }
          50% { box-shadow: 0 0 0 8px rgba(8, 145, 178, 0); }
        }

      `}</style>
      <section className="mx-auto max-w-7xl px-8 py-8">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Link
              href="/experiment-history"
              className="text-sm font-medium text-cyan-800 hover:text-cyan-900"
            >
              Back to Experiment History
            </Link>

            <h2 className="soft-title mt-4 text-3xl font-bold">{experiment.name}</h2>
            <p className="mt-2 text-slate-700">
              Historical experiment inspection, stored configuration, dataset
              export, and Grafana references.
            </p>
          </div>

          <StatusBadge status={experiment.status} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Experiment Summary">
            <Detail label="Experiment ID" value={experiment.id} />
            <Detail label="Mode" value={experiment.mode} />
            <Detail label="Timestamp" value={experiment.timestamp} />
            <Detail
              label="Duration"
              value={`${experiment.durationMinutes} min`}
            />
            <Detail label="Dataset Size" value={experiment.datasetSize} />
          </Card>

          <Card title="Dataset Export">
            <div className="space-y-3">
              <button className="w-full rounded-lg border border-cyan-700 bg-cyan-700 px-4 py-2 text-white transition hover:bg-cyan-800">
                Export CSV
              </button>

              <button className="w-full rounded-lg border border-emerald-700 bg-emerald-700 px-4 py-2 text-white transition hover:bg-emerald-800">
                Export JSON
              </button>

              <button className="w-full rounded-lg border border-violet-700 bg-violet-700 px-4 py-2 text-white transition hover:bg-violet-800">
                Export Experiment Manifest
              </button>
            </div>
          </Card>

          <Card title="Grafana References">
            <DashboardLink title={experiment.grafana.networkDashboard} />
            <DashboardLink title={experiment.grafana.clientServerDashboard} />
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card title="UE Configuration">
            <Detail
              label="L4S UEs"
              value={String(experiment.ueConfig.l4sUes)}
            />
            <Detail
              label="Classic UEs"
              value={String(experiment.ueConfig.classicUes)}
            />
            <Detail
              label="Android Background UEs"
              value={String(experiment.ueConfig.androidUes)}
            />
          </Card>

          <Card title="Traffic Configuration">
            <TagList items={experiment.traffic} />
          </Card>

          <Card title="Network Parameters">
            {experiment.networkParams ? (
              <>
                <Detail
                  label="Scheduler Weight"
                  value={experiment.networkParams.schedulerWeight}
                />
                <Detail
                  label="Low Threshold"
                  value={experiment.networkParams.lowThreshold}
                />
                <Detail
                  label="High Threshold"
                  value={experiment.networkParams.highThreshold}
                />
                <Detail label="5QI" value={experiment.networkParams.fiveQi} />
              </>
            ) : (
              <p className="text-sm text-slate-700">
                Not applicable for Classic-only experiments.
              </p>
            )}
          </Card>

          <Card title="Selected Metadata">
            <TagList items={experiment.metadata} />
          </Card>
        </div>

        <div className="mt-6">
          <Card title="Grafana Dashboard Preview">
            <div className="flex h-72 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700">
              Placeholder preview for experiment-filtered Grafana dashboard
            </div>
          </Card>
        </div>
      </section>
    </main>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-card rounded-2xl p-6 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <h3 className="mb-5 text-lg font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-300 py-2 text-sm last:border-b-0">
      <span className="text-slate-700">{label}</span>
      <span className="text-right text-slate-800">{value}</span>
    </div>
  );
}

function TagList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-cyan-400/30 bg-cyan-700 px-3 py-1 text-xs font-medium text-white"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function DashboardLink({ title }: { title: string }) {
  return (
    <a
      href="#"
      className="mb-3 block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:border-cyan-600 hover:bg-cyan-50 hover:shadow-md"
    >
      <p className="font-medium text-slate-900">{title}</p>
      <p className="mt-2 text-sm text-cyan-800">Open Grafana</p>
    </a>
  );
}

function StatusBadge({ status }: { status: ExperimentStatus }) {
  const styles = {
    Successful: "border-emerald-700 bg-emerald-700 text-white",
    Stopped: "border-amber-700 bg-amber-600 text-white",
    Failed: "border-red-700 bg-red-700 text-white",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-4 py-2 text-sm font-semibold shadow-sm ${styles[status]}`}
    >
      {status}
    </span>
  );
}
