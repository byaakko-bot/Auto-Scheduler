import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  Flag,
  GitBranch,
  TrendingUp,
} from "lucide-react";
import { getDashboardData } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { SCurveChart, type SCurvePoint } from "@/components/charts/SCurveChart";
import { RISK_COLORS } from "@/lib/constants";
import { daysBetween, formatDate, titleCase } from "@/lib/utils";
import { buildCalendar, daysBetweenWorking } from "@/engine/calendarEngine";

export const dynamic = "force-dynamic";

function buildSCurve(
  tasks: { plannedEndDate: Date; progressPct: number; actualEndDate: Date | null }[]
): SCurvePoint[] {
  if (tasks.length === 0) return [];
  const sorted = [...tasks].sort(
    (a, b) => a.plannedEndDate.getTime() - b.plannedEndDate.getTime()
  );
  const start = sorted[0].plannedEndDate;
  const end = sorted[sorted.length - 1].plannedEndDate;
  const total = tasks.length;
  const months: SCurvePoint[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const now = new Date();

  while (cursor <= end) {
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const plannedDone = sorted.filter((t) => t.plannedEndDate <= monthEnd).length;
    const actualDone = sorted.filter(
      (t) => t.progressPct >= 100 && (t.actualEndDate ?? t.plannedEndDate) <= monthEnd
    ).length;
    months.push({
      label: cursor.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
      planned: Math.round((plannedDone / total) * 100),
      actual: monthEnd <= now ? Math.round((actualDone / total) * 100) : 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

export default async function ProjectOverviewPage({
  params,
}: {
  params: { id: string };
}) {
  const { project, tasks, milestones, risks } = await getDashboardData(params.id);

  if (!project) {
    return (
      <div className="px-8 py-10">
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            Project not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="px-8 py-10">
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            No schedule generated for this project yet. Open the{" "}
            <Link href={`/app/projects/${params.id}/schedule`} className="font-medium text-blue-600">
              Schedule tab
            </Link>{" "}
            or regenerate it. If you expected data, ensure your database is
            connected and seeded.
          </CardContent>
        </Card>
      </div>
    );
  }

  const overallProgress = Math.round(
    tasks.reduce((s, t) => s + t.progressPct, 0) / tasks.length
  );
  const delayed = tasks.filter((t) => t.status === "DELAYED");
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86400000);
  const dueThisWeek = tasks.filter(
    (t) => t.plannedEndDate >= now && t.plannedEndDate <= weekAhead
  );
  const criticalTasks = tasks.filter((t) => t.isCritical);
  const nextMilestone = milestones.find((m) => !m.achieved && m.plannedDate >= now) ?? milestones[0];
  const openRisks = risks.filter((r) => r.status === "OPEN");
  const sCurve = buildSCurve(tasks);

  const kpis = [
    {
      label: "Overall progress",
      icon: TrendingUp,
      tone: "text-blue-600 bg-blue-50",
      content: (
        <div className="w-full">
          <p className="text-2xl font-bold text-slate-900">{overallProgress}%</p>
          <Progress value={overallProgress} className="mt-2" />
        </div>
      ),
    },
    {
      label: "Critical tasks",
      icon: GitBranch,
      tone: "text-red-600 bg-red-50",
      content: <p className="text-2xl font-bold text-slate-900">{criticalTasks.length}</p>,
    },
    {
      label: "Due this week",
      icon: CalendarClock,
      tone: "text-violet-600 bg-violet-50",
      content: <p className="text-2xl font-bold text-slate-900">{dueThisWeek.length}</p>,
    },
    {
      label: "Open risks",
      icon: AlertTriangle,
      tone: "text-amber-600 bg-amber-50",
      content: <p className="text-2xl font-bold text-slate-900">{openRisks.length}</p>,
    },
    {
      label: "Next milestone",
      icon: Flag,
      tone: "text-emerald-600 bg-emerald-50",
      content: nextMilestone ? (
        <div>
          <p className="truncate text-sm font-semibold text-slate-900">{nextMilestone.name}</p>
          <p className="text-xs text-slate-500">
            {formatDate(nextMilestone.plannedDate)} ·{" "}
            {Math.max(0, daysBetween(now, nextMilestone.plannedDate))}d away
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-400">—</p>
      ),
    },
  ];

  // Forecast finish is the latest planned finish across the schedule; the
  // contract date is what the project committed to. Showing only one of them
  // hides the variance that matters most.
  const forecastFinish = tasks.reduce<Date | null>(
    (max, t) => (!max || t.plannedEndDate > max ? t.plannedEndDate : max),
    null
  );
  const contractFinish = project.targetEndDate ?? null;

  // Reported in WORKING days, matching the engine and the API. A calendar-day
  // figure disagrees with every other number in the product on any project
  // that does not work a 7-day week.
  const calendar = buildCalendar(project.workingDaysPerWeek);
  const finishVarianceDays =
    forecastFinish && contractFinish
      ? forecastFinish > contractFinish
        ? daysBetweenWorking(contractFinish, forecastFinish, calendar)
        : -daysBetweenWorking(forecastFinish, contractFinish, calendar)
      : null;

  return (
    <div className="px-8 py-6">
      <Card className="mb-4">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-slate-500">Project start</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {formatDate(project.startDate)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Contract finish</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {formatDate(contractFinish)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Forecast finish</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {formatDate(forecastFinish)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Variance</p>
            {finishVarianceDays === null ? (
              <p className="mt-1 text-lg font-semibold text-slate-400">—</p>
            ) : (
              <p
                className={`mt-1 text-lg font-semibold ${
                  finishVarianceDays > 0
                    ? "text-red-600"
                    : finishVarianceDays < 0
                    ? "text-emerald-600"
                    : "text-slate-900"
                }`}
              >
                {finishVarianceDays > 0 ? "+" : ""}
                {finishVarianceDays} working days
                {finishVarianceDays > 0
                  ? " late"
                  : finishVarianceDays < 0
                  ? " early"
                  : ""}
              </p>
            )}
            <p className="mt-0.5 text-xs text-slate-400">
              {project.workingDaysPerWeek}-day working week
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${k.tone}`}>
                  <k.icon className="h-4 w-4" />
                </div>
                <span className="text-xs font-medium text-slate-500">{k.label}</span>
              </div>
              {k.content}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Planned vs Actual (S-curve)</CardTitle>
            </CardHeader>
            <CardContent>
              <SCurveChart data={sCurve} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Delayed tasks</CardTitle>
            </CardHeader>
            <CardContent>
              {delayed.length === 0 ? (
                <p className="text-sm text-slate-400">No delayed tasks. On track.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {delayed.slice(0, 8).map((t) => (
                    <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="font-medium text-slate-800">{t.name}</span>
                      <Badge className="bg-red-100 text-red-700">
                        {formatDate(t.plannedEndDate)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Top critical-path tasks</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {criticalTasks.slice(0, 6).map((t) => (
                  <li key={t.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate font-medium text-slate-800">{t.name}</span>
                      <span className="text-xs text-slate-400">{t.progressPct}%</span>
                    </div>
                    <Progress value={t.progressPct} className="mt-1" barClassName="bg-red-500" />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Milestones</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {milestones.map((m) => (
                  <li key={m.id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Flag className="h-3.5 w-3.5 text-emerald-500" />
                      {m.name}
                    </span>
                    <span className="text-xs text-slate-500">{formatDate(m.plannedDate)}</span>
                  </li>
                ))}
                {milestones.length === 0 && (
                  <p className="text-sm text-slate-400">No milestones.</p>
                )}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Open risks</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {openRisks.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex items-center justify-between text-sm">
                    <span className="truncate text-slate-800">{r.title}</span>
                    <Badge className={RISK_COLORS[r.level]}>{titleCase(r.level)}</Badge>
                  </li>
                ))}
                {openRisks.length === 0 && (
                  <p className="text-sm text-slate-400">No open risks.</p>
                )}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
