import { requireProject } from "@/lib/auth/session";
import { db } from "@/lib/prisma";
import { fail, handleError, ok } from "@/lib/api";
import { loadNetwork } from "@/lib/schedule";
import { offsetOfDate } from "@/engine/calendarEngine";
import { analyseScheduleHealth } from "@/engine/scheduleHealth";
import { findOutOfSequence } from "@/engine/rootCause";
import {
  buildProcurementReport,
  type ConsumingActivity,
  type ProcurementPackage,
} from "@/engine/procurement";

export const dynamic = "force-dynamic";

/**
 * §29/§30 — schedule quality check and score.
 *
 * Deterministic throughout: every finding names the activities responsible and
 * every deducted point is attributable to a listed finding.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // A project id in the URL is an identifier, not an authorisation.
    await requireProject(params.id, "VIEWER");
    const loaded = await loadNetwork(params.id);
    if (!loaded) return fail("Project not found", 404);
    const { project, nodes, calendar, tasks } = loaded;

    if (tasks.length === 0) {
      return fail("Generate a schedule before running a health check", 422);
    }

    const [raci, baselines, packages] = await Promise.all([
      db.raciAssignment.findMany({
        where: { task: { projectId: params.id } },
        select: { task: { select: { code: true } } },
      }),
      db.baseline.findMany({
        where: { projectId: params.id, status: "APPROVED" },
        select: { id: true },
      }),
      db.procurementPackage.findMany({
        where: { projectId: params.id },
        include: {
          legs: { orderBy: { sequence: "asc" } },
          consumingTask: true,
        },
      }),
    ]);

    // Late procurement, scored by the procurement engine rather than guessed.
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
    const lateProcurement = new Map<string, number>();
    for (const p of procReport.packages) {
      if (p.projectImpactDays > 0) {
        lateProcurement.set(p.consumingActivityCode, p.projectImpactDays);
      }
    }

    // Out-of-sequence progress, from recorded actuals.
    const actualStarts = new Map<string, number>();
    const actualFinishes = new Map<string, number>();
    for (const t of tasks) {
      if (t.actualStartDate) {
        actualStarts.set(
          t.code,
          offsetOfDate(project.startDate, t.actualStartDate, calendar)
        );
      }
      if (t.actualEndDate) {
        actualFinishes.set(
          t.code,
          offsetOfDate(project.startDate, t.actualEndDate, calendar)
        );
      }
    }

    const report = analyseScheduleHealth({
      nodes,
      withResponsibility: new Set(raci.map((r) => r.task.code)),
      lateProcurement,
      hasApprovedBaseline: baselines.length > 0,
      outOfSequence: findOutOfSequence(nodes, actualStarts, actualFinishes),
    });

    const nameOf = new Map(tasks.map((t) => [t.code, t.name]));

    return ok({
      score: report.score,
      grade: report.grade,
      summary: {
        critical: report.criticalCount,
        warnings: report.warningCount,
        info: report.infoCount,
        activitiesValidated: report.activitiesValidated,
        activitiesTotal: report.activitiesTotal,
        validatedPct: Number(report.validatedPct.toFixed(1)),
      },
      categories: report.categories.map((c) => ({
        category: c.category,
        score: c.score,
        maxScore: c.maxScore,
        pointsLost: c.maxScore - c.score,
        findings: c.findings.map((f) => f.check),
      })),
      findings: report.findings.map((f) => ({
        ...f,
        taskNames: f.taskCodes
          .slice(0, 10)
          .map((c) => nameOf.get(c) ?? c),
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
