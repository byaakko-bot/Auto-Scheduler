import { db } from "@/lib/prisma";
import { fail, handleError, ok } from "@/lib/api";
import { loadNetwork } from "@/lib/schedule";
import { offsetOfDate, workingDayDate } from "@/engine/calendarEngine";
import { solve } from "@/engine/cpmSolver";
import { analyseRootCause, type BaselineRecord } from "@/engine/rootCause";
import {
  buildProcurementReport,
  type ConsumingActivity,
  type ProcurementPackage,
} from "@/engine/procurement";

export const dynamic = "force-dynamic";

/**
 * §40 — "Why are we late?"
 *
 * Decomposes the delay along the current critical path against the approved
 * baseline. Every cause cites the stored records that produced it, and any
 * residual is reported as unexplained rather than spread across the causes.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const loaded = await loadNetwork(params.id);
    if (!loaded) return fail("Project not found", 404);
    const { project, nodes, calendar, tasks } = loaded;

    if (tasks.length === 0) {
      return fail("Generate a schedule first", 422);
    }

    const baseline = await db.baseline.findFirst({
      where: { projectId: params.id, status: "APPROVED" },
      include: { tasks: true },
      orderBy: { approvedAt: "desc" },
    });

    const deadline =
      offsetOfDate(project.startDate, project.targetEndDate, calendar) + 1;

    const current = solve(nodes, {
      deadline,
      nearCriticalThreshold: project.nearCriticalThresholdDays,
      watchThreshold: project.watchThresholdDays,
    });

    const baselineRecords = new Map<string, BaselineRecord>();
    let baselineDuration: number | undefined;

    if (baseline) {
      for (const bt of baseline.tasks) {
        baselineRecords.set(bt.code, {
          code: bt.code,
          durationDays: bt.durationDays,
        });
      }
      // Baseline duration in working days, from the snapshot's own span.
      const finishes = baseline.tasks.map((t) =>
        offsetOfDate(project.startDate, t.endDate, calendar)
      );
      baselineDuration = finishes.length ? Math.max(...finishes) + 1 : undefined;
    }

    // Procurement impact, scored by the procurement engine.
    const packages = await db.procurementPackage.findMany({
      where: { projectId: params.id },
      include: { legs: { orderBy: { sequence: "asc" } }, consumingTask: true },
    });
    const consumers = new Map<string, ConsumingActivity>();
    for (const p of packages) {
      if (!p.consumingTask) continue;
      consumers.set(p.consumingTask.code, {
        code: p.consumingTask.code,
        startDate: p.consumingTask.plannedStartDate,
        totalFloatDays: p.consumingTask.floatDays,
        freeFloatDays: p.consumingTask.freeFloatDays,
      });
    }
    const enginePackages: ProcurementPackage[] = packages
      .filter((p) => p.consumingTask)
      .map((p) => ({
        code: p.code,
        material: p.material,
        consumingActivityCode: p.consumingTask!.code,
        bufferDays: p.bufferDays,
        currentEtaDate: p.currentEtaDate ?? undefined,
        legs: p.legs.map((l) => ({
          kind: l.kind as never,
          name: l.name,
          days: l.days,
        })),
      }));
    const procReport = buildProcurementReport(enginePackages, consumers);
    const procurementImpact = new Map<
      string,
      { material: string; impactDays: number }
    >();
    for (const p of procReport.packages) {
      if (p.projectImpactDays > 0) {
        procurementImpact.set(p.consumingActivityCode, {
          material: p.material,
          impactDays: p.projectImpactDays,
        });
      }
    }

    const nameOf = new Map(tasks.map((t) => [t.code, t.name]));

    const analysis = analyseRootCause({
      current,
      baseline: baselineRecords,
      baselineDurationDays: baselineDuration,
      procurementImpact,
      taskNames: nameOf,
    });

    return ok({
      hasBaseline: analysis.hasBaseline,
      baselineName: baseline?.name ?? null,
      summary: analysis.summary,
      forecast: {
        forecastDurationWorkingDays: current.projectDuration,
        baselineDurationWorkingDays: baselineDuration ?? null,
        forecastFinishDate: workingDayDate(
          project.startDate,
          Math.max(current.projectDuration - 1, 0),
          calendar
        ),
        contractFinishDate: project.targetEndDate,
        // Distinct from baseline variance: this is against the contract date.
        daysOverContract: Math.max(0, current.projectDuration - deadline),
      },
      attribution: {
        forecastDelayDays: analysis.forecastDelayDays,
        explainedDays: analysis.explainedDays,
        unexplainedDays: analysis.unexplainedDays,
      },
      causes: analysis.causes.map((c) => ({
        ...c,
        taskName: c.taskName ?? nameOf.get(c.taskCode) ?? null,
      })),
      criticalPath: analysis.criticalPath.map((c) => ({
        code: c,
        name: nameOf.get(c) ?? c,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
