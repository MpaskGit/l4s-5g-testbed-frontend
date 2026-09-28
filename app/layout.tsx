import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "L4S 5G Testbed Orchestrator",
  description: "Experiment orchestration and monitoring platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100">
        <nav className="border-b border-slate-800 bg-slate-950/90">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-5">
            <div>
              <h1 className="text-lg font-semibold">
                L4S 5G Testbed Orchestrator
              </h1>
              <p className="text-sm text-slate-400">
                Experiment control and monitoring platform
              </p>
            </div>

            <div className="flex gap-5 text-sm">
              <Link className="text-slate-400 hover:text-cyan-400" href="/">
                Overview
              </Link>

              <Link
                className="text-slate-400 hover:text-cyan-400"
                href="/experiment-setup"
              >
                Experiment Setup
              </Link>

              <Link
                className="text-slate-400 hover:text-cyan-400"
                href="/experiment-history"
              >
                Experiment History
              </Link>
            </div>

            <div className="hidden rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-sm text-emerald-300 md:block">
              ● Running
            </div>
          </div>
        </nav>

        {children}
      </body>
    </html>
  );
}