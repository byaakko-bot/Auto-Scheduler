import { requireProject } from "@/lib/auth/session";
import { db } from "@/lib/prisma";
import { fail, handleError, ok } from "@/lib/api";
import { loadNetwork } from "@/lib/schedule";
import { offsetOfDate, workingDayDate } from "@/engine/calendarEngine";
import { evaluateScenario, type ScenarioChange } from "@/engine/scenario";

export const dynamic = "force-dynamic";

/**
 * §21 — evaluates a scenario against a copy of the network and returns the
 * diff. The live schedule is never written to, so a scenario can be run,
 * compared and discarded without risk to the baseline.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string; scenarioId: string } }
) {
  try {
    // A project id in the URL is an identifier, not an authorisation.
    await requireProject(params.id, "VIEWER");
    const scenario = await db.scenario.findFirst({
      where: { id: params.scenarioId, projectId: params.id },
      include: { changes: true },
    });
    if (!scenario) return fail("Scenario not found", 404);

    const loaded = await loadNetwork(params.id);
    if (!loaded) return fail("Project not found", 404);
    const { project, nodes, calendar, tasks } = loaded;

    const deadline =
      offsetOfDate(project.startDate, project.targetEndDate, calendar) + 1;

    const changes: ScenarioChange[] = scenario.changes.map((c) => ({
      kind: c.kind as ScenarioChange["kind"],
      taskCode: c.taskCode,
      predecessorCode: c.predecessorCode ?? undefined,
      value: c.value,
      dependencyType: (c.dependencyType as never) ?? undefined,
      constraintType: (c.constraintType as never) ?? undefined,
      note: c.note ?? undefined,
    }));

    const result = evaluateScenario({
      nodes,
      changes,
      deadline,
      nearCriticalThreshold: project.nearCriticalThresholdDays,
      watchThreshold: project.watchThresholdDays,
    });

    // Cache the headline so the list view can show it without re-solving.
    await db.scenario.update({
      where: { id: scenario.id },
      data: {
        finishShiftDays: result.finishShiftDays,
        isFeasible: result.isFeasible,
        evaluatedAt: new Date(),
      },
    });

    const nameOf = new Map(tasks.map((t) => [t.code, t.name]));
    const finishOffset = (d: number) => Math.max(d - 1, 0);

    return ok({
      scenario: {
        id: scenario.id,
        name: scenario.name,
        description: scenario.description,
      },
      applied: result.applied,
      rejected: result.rejected,
      comparison: {
        baselineDurationWorkingDays: result.baseline.projectDuration,
        scenarioDurationWorkingDays: result.scenario.projectDuration,
        finishShiftDays: result.finishShiftDays,
        baselineFinishDate: workingDayDate(
          project.startDate,
          finishOffset(result.baseline.projectDuration),
          calendar
        ),
        scenarioFinishDate: workingDayDate(
          project.startDate,
          finishOffset(result.scenario.projectDuration),
          calendar
        ),
        contractFinishDate: project.targetEndDate,
        isFeasible: result.isFeasible,
      },
      impact: {
        affectedActivities: result.impact.affectedCount,
        criticalActivitiesAffected: result.impact.criticalAffectedCount,
        criticalPathChanged: result.impact.criticalPathChanged,
        becameCritical: result.impact.becameCritical.map((c) => ({
          code: c,
          name: nameOf.get(c) ?? c,
        })),
        noLongerCritical: result.impact.noLongerCritical.map((c) => ({
          code: c,
          name: nameOf.get(c) ?? c,
        })),
        floatConsumed: result.impact.floatConsumed.length,
      },
      changedActivities: result.impact.deltas.slice(0, 50).map((d) => ({
        ...d,
        name: nameOf.get(d.code) ?? d.code,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

/** Discards a scenario (§21). The baseline was never touched. */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; scenarioId: string } }
) {
  try {
    // A project id in the URL is an identifier, not an authorisation.
    await requireProject(params.id, "PROJECT_MANAGER");
    const scenario = await db.scenario.findFirst({
      where: { id: params.scenarioId, projectId: params.id },
    });
    if (!scenario) return fail("Scenario not found", 404);

    await db.scenario.delete({ where: { id: scenario.id } });
    return ok({ deleted: scenario.name });
  } catch (err) {
    return handleError(err);
  }
}
