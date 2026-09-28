import Link from "next/link";

type ExperimentStatus = "Successful" | "Stopped" | "Failed";
type ExperimentMode = "L4S / Classic" | "L4S Only" | "Classic Only";

type HistoricalExperiment = {
  id: string;
  name: string;
  timestamp: string;
  status: ExperimentStatus;
  durationMinutes: number;
  mode: ExperimentMode;
  datasetSize: string;
};

const experiments: HistoricalExperiment[] = [
  {
    id: "exp-001",
    name: "Downlink L4S vs Classic Evaluation",
    timestamp: "30/05/2026 12:40",
    status: "Successful",
    durationMinutes: 20,
    mode: "L4S / Classic",
    datasetSize: "184 MB",
  },
  {
    id: "exp-002",
    name: "XR Video Low-Latency Test",
    timestamp: "30/05/2026 10:15",
    status: "Successful",
    durationMinutes: 15,
    mode: "L4S Only",
    datasetSize: "132 MB",
  },
  {
    id: "exp-003",
    name: "Classic Goodput Baseline",
    timestamp: "29/05/2026 18:05",
    status: "Successful",
    durationMinutes: 25,
    mode: "Classic Only",
    datasetSize: "156 MB",
  },
  {
    id: "exp-004",
    name: "UDP Background Load Stress Test",
    timestamp: "29/05/2026 15:20",
    status: "Stopped",
    durationMinutes: 9,
    mode: "L4S / Classic",
    datasetSize: "74 MB",
  },
];

export default function ExperimentHistory() {
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
        <div className="mb-8">
          <h2 className="soft-title text-3xl font-bold">Experiment History</h2>
          <p className="mt-2 text-slate-700">
            Browse completed testbed runs, inspect stored configurations, open
            Grafana references, and export experiment datasets.
          </p>
        </div>

        <Panel>
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Stored Experiments</h3>
            <span className="text-sm text-slate-700">
              {experiments.length} historical runs
            </span>
          </div>

          <div className="metric-shell overflow-x-auto rounded-xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-200 text-slate-700">
                <tr>
                  <th className="px-4 py-3">Experiment</th>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Dataset</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>

              <tbody>
                {experiments.map((experiment) => (
                  <tr
                    key={experiment.id}
                    className="border-t border-slate-200 hover:bg-cyan-50/70"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {experiment.name}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {experiment.timestamp}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {experiment.mode}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {experiment.durationMinutes} min
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {experiment.datasetSize}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={experiment.status} />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/experiment-history/${experiment.id}`}
                        className="inline-flex items-center rounded-lg border border-cyan-700 bg-cyan-700 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-cyan-800 hover:shadow-md"
                      >
                        Open Experiment
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <InfoPanel
            title="Configuration Archive"
            text="Each historical run stores its UE setup, traffic profile, selected mode, L4S parameters, and metadata selections."
          />
          <InfoPanel
            title="Dataset Export"
            text="Datasets are exported using the experiment time range and selected KPIs such as latency, goodput, CE marking rate, and BLER."
          />
          <InfoPanel
            title="Grafana Reference"
            text="Each run links to a Grafana dashboard view filtered by experiment ID and execution window."
          />
        </div>
      </section>
    </main>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="glass-card rounded-2xl p-6 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      {children}
    </section>
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
      className={`rounded-full border px-3 py-1 text-xs font-semibold shadow-sm ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function InfoPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="glass-card rounded-2xl p-6 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-slate-700">{text}</p>
    </div>
  );
}
