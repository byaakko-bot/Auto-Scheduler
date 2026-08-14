import Link from "next/link";
import {
  ArrowRight,
  CalendarRange,
  GitBranch,
  Network,
  ShieldCheck,
  TrendingUp,
  Truck,
} from "lucide-react";

const features = [
  {
    icon: CalendarRange,
    title: "60-second schedules",
    body: "Enter your project parameters and get a full WBS + Gantt with calendar-accurate dates instantly.",
  },
  {
    icon: GitBranch,
    title: "Critical path engine",
    body: "Forward & backward pass CPM computes float and highlights the critical path on every change.",
  },
  {
    icon: TrendingUp,
    title: "Live delay propagation",
    body: "Mark a task late and downstream activities cascade automatically across the working calendar.",
  },
  {
    icon: Network,
    title: "RACI built in",
    body: "Every phase ships with sensible default responsibility assignments — no ambiguity on site.",
  },
  {
    icon: Truck,
    title: "Logistics & budget ready",
    body: "Materials, suppliers, shipments and cost tracking all linked to the same live schedule.",
  },
  {
    icon: ShieldCheck,
    title: "Construction logic",
    body: "Crew productivity, procurement lead times and method-specific durations baked into the rules.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
            <CalendarRange className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Buildora</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Sign in
          </Link>
          <Link
            href="/app/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Open app <ArrowRight className="h-4 w-4" />
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-6 pb-12 pt-16 text-center">
        <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
          MVP · Rules-based scheduling engine
        </span>
        <h1 className="mt-6 text-balance text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl">
          Construction schedules that build themselves.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
          Buildora replaces manual scheduling in Excel and MS Project with a
          dependency-aware engine that understands sequencing, crew productivity,
          procurement lead times, and the critical path.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/app/projects/new"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Generate a schedule <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/app/dashboard"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            View dashboard
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8">
        <p className="text-center text-sm text-slate-400">
          Buildora · Construction Schedule Platform · MVP
        </p>
      </footer>
    </main>
  );
}
