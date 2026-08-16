import { db } from "@/lib/prisma";
import { fail, handleError, ok } from "@/lib/api";
import { loadNetwork } from "@/lib/schedule";
import { offsetOfDate, workingDayDate } from "@/engine/calendarEngine";
import { solve } from "@/engine/cpmSolver";
import {
  physicalProgress,
  plannedPercentAt,
  reforecast,
  compareSchedules,
  type ProgressUpdate,
} from "@/engine/forecast";
import { buildSCurve, progressVarianceAt } from "@/engine/sCurve";

export const dynamic = "force-dynamic";

/**
 * §26/§27 — forecast completion, schedule variance and progress curves,
 * derived from reported progress rather than from elapsed time.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const loaded = await loadNetwork(params.id);
    if (!loaded) return fail("Project not found", 404);
    const { project, nodes, calendar, tasks } = loaded;

    if (tasks.length === 0) {
      return fail("Generate a schedule before requesting a forecast", 422);
    }

    const url = new URL(req.url);
    const dataDate = url.searchParams.get("dataDate")
      ? new Date(url.searchParams.get("dataDate")!)
      : new Date();

    const updates: ProgressUpdate[] = tasks
      .filter(
        (t) => t.actualStartDate || t.actualEndDate || t.progressPct > 0
      )
      .map((t) => ({
        taskCode: t.code,
        actualStartDate: t.actualStartDate ?? undefined,
        actualFinishDate: t.actualEndDate ?? undefined,
        percentComplete: t.progressPct > 0 ? t.progressPct : undefined,
        remainingDurationDays: t.remainingDurationDays ?? undefined,
        actualQuantity: t.actualQuantity ?? undefined,
      }));

    const deadline =
      offsetOfDate(project.startDate, project.targetEndDate, calendar) + 1;

    const baseline = solve(
      nodes.map((n) => ({ ...n, predecessors: n.predecessors.map((p) => ({ ...p })) })),
      {
        deadline,
        nearCriticalThreshold: project.nearCriticalThresholdDays,
        watchThreshold: project.watchThresholdDays,
      }
    );

    const forecast = reforecast({
      nodes,
      projectStart: project.startDate,
      calendar,
      dataDate,
      updates,
      deadline,
      nearCriticalThreshold: project.nearCriticalThresholdDays,
      watchThreshold: project.watchThresholdDays,
    });

    const impact = compareSchedules(baseline, forecast.cpm);
    const dataDateOffset = forecast.dataDateOffset;

    // Reported progress, weighted for the curve.
    const actualProgress = new Map<string, number>();
    for (const t of tasks) {
      if (t.progressPct > 0 || t.actualEndDate) {
        actualProgress.set(t.code, t.actualEndDate ? 100 : t.progressPct);
      }
    }

    const curve = buildSCurve({
      planned: baseline.nodes,
      forecast: forecast.cpm.nodes,
      actualProgress,
      projectStart: project.startDate,
      calendar,
      dataDateOffset,
      intervals: 24,
    });

    const actualPctNow =
      curve
        .filter((p) => p.actualPct !== null)
        .at(-1)?.actualPct ?? 0;

    const variance = progressVarianceAt(
      baseline.nodes,
      actualPctNow,
      dataDateOffset,
      project.startDate,
      calendar
    );

    // Physical (quantity) progress, independent of duration (§26).
    const byCode = new Map(forecast.cpm.nodes.map((n) => [n.taskId, n]));
    const physical = tasks
      .filter((t) => t.quantity && t.actualQuantity !== null)
      .map((t) => {
        const n = byCode.get(t.code);
        const planned = n ? plannedPercentAt(n, dataDateOffset) : 0;
        const p = physicalProgress(t.quantity!, t.actualQuantity ?? 0, planned);
        return {
          code: t.code,
          name: t.name,
          unit: t.quantityUnit,
          ...p,
        };
      });

    const forecastEnd = forecast.cpm.nodes.reduce(
      (m, n) => Math.max(m, n.ef),
      0
    );

    return ok({
      dataDate,
      dataDateOffset,
      forecast: {
        forecastFinishDate: workingDayDate(
          project.startDate,
          Math.max(forecastEnd - 1, 0),
          calendar
        ),
        contractFinishDate: project.targetEndDate,
        forecastDurationWorkingDays: forecast.cpm.projectDuration,
        baselineDurationWorkingDays: baseline.projectDuration,
        varianceWorkingDays: impact.projectFinishShiftDays,
        isFeasible: forecast.cpm.isFeasible,
      },
      progress: {
        plannedPct: Number(variance.plannedPct.toFixed(1)),
        actualPct: Number(variance.actualPct.toFixed(1)),
        variancePct: Number(variance.variancePct.toFixed(1)),
        scheduleVarianceDays: variance.scheduleVarianceDays,
      },
      states: {
        complete: [...forecast.states.values()].filter((s) => s === "COMPLETE").length,
        inProgress: [...forecast.states.values()].filter((s) => s === "IN_PROGRESS").length,
        notStarted: [...forecast.states.values()].filter((s) => s === "NOT_STARTED").length,
      },
      criticalPathChanged: impact.criticalPathChanged,
      physicalProgress: physical,
      sCurve: curve,
    });
  } catch (err) {
    return handleError(err);
  }
}
