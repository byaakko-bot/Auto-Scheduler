import { requireProject } from "@/lib/auth/session";
import { db } from "@/lib/prisma";
import { fail, handleError, ok } from "@/lib/api";
import { loadNetwork, persistablePatch } from "@/lib/schedule";
import { applyDelay } from "@/engine/forecast";
import { offsetOfDate } from "@/engine/calendarEngine";

export const dynamic = "force-dynamic";

/**
 * §19/§20 — applies a delay and reports the true network consequences.
 *
 * The whole network is re-solved rather than having days added to each
 * successor, so float absorbs what it can, the critical path is recomputed,
 * and the project impact may be smaller than the delay itself.
 *
 * Accepts either { extraDays } or { newEndDate }.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string; taskId: string } }
) {
  try {
    // A project id in the URL is an identifier, not an authorisation.
    await requireProject(params.id, "SITE_MANAGER");
    const loaded = await loadNetwork(params.id);
    if (!loaded) return fail("Project not found", 404);
    const { project, nodes, calendar, codeToId, tasks } = loaded;

    const delayed = tasks.find((t) => t.id === params.taskId);
    if (!delayed) return fail("Task not found", 404);

    const body = await req.json().catch(() => ({}));

    let extraDays: number;
    if (typeof body.extraDays === "number") {
      extraDays = Math.round(body.extraDays);
    } else if (body.newEndDate) {
      const newEnd = new Date(body.newEndDate);
      const currentEndOffset = offsetOfDate(
        project.startDate,
        delayed.plannedEndDate,
        calendar
      );
      const newEndOffset = offsetOfDate(project.startDate, newEnd, calendar);
      extraDays = newEndOffset - currentEndOffset;
    } else {
      return fail("Provide either extraDays or newEndDate", 422);
    }

    if (extraDays === 0) {
      return ok({ message: "No change requested.", impact: null });
    }

    const deadline =
      offsetOfDate(project.startDate, project.targetEndDate, calendar) + 1;

    const { before, after, impact } = applyDelay(
      {
        nodes,
        projectStart: project.startDate,
        calendar,
        dataDate: body.dataDate ? new Date(body.dataDate) : project.startDate,
        deadline,
        nearCriticalThreshold: project.nearCriticalThresholdDays,
        watchThreshold: project.watchThresholdDays,
      },
      delayed.code,
      extraDays
    );

    const milestoneCodes = new Set(
      tasks.filter((t) => t.isMilestone).map((t) => t.code)
    );

    // Persist the re-solved network.
    await db.$transaction([
      ...after.nodes
        .filter((n) => codeToId.has(n.taskId))
        .map((n) =>
          db.task.update({
            where: { id: codeToId.get(n.taskId)! },
            data: persistablePatch(
              n,
              project.startDate,
              calendar,
              milestoneCodes.has(n.taskId)
            ),
          })
        ),
      db.task.update({
        where: { id: delayed.id },
        data: { status: "DELAYED" },
      }),
      db.auditLog.create({
        data: {
          projectId: params.id,
          action: "UPDATE",
          entity: "Task",
          entityId: delayed.id,
          field: "durationDays",
          oldValue: String(delayed.durationDays),
          newValue: String(delayed.durationDays + extraDays),
          reason:
            body.reason ??
            `Delay of ${extraDays} working day(s); project impact ${impact.projectFinishShiftDays} day(s)`,
        },
      }),
    ]);

    const nameOf = new Map(tasks.map((t) => [t.code, t.name]));

    return ok({
      delayedTask: { code: delayed.code, name: delayed.name, extraDays },
      impact: {
        // The headline: project impact is often less than the delay applied,
        // because float absorbs part of it.
        delayAppliedDays: extraDays,
        projectImpactDays: impact.projectFinishShiftDays,
        absorbedByFloatDays: extraDays - impact.projectFinishShiftDays,
        affectedActivities: impact.affectedCount,
        criticalActivitiesAffected: impact.criticalAffectedCount,
        criticalPathChanged: impact.criticalPathChanged,
        becameCritical: impact.becameCritical.map((c) => ({
          code: c,
          name: nameOf.get(c) ?? c,
        })),
        noLongerCritical: impact.noLongerCritical.map((c) => ({
          code: c,
          name: nameOf.get(c) ?? c,
        })),
        floatConsumed: impact.floatConsumed.length,
      },
      forecast: {
        durationBeforeWorkingDays: before.projectDuration,
        durationAfterWorkingDays: after.projectDuration,
        isFeasible: after.isFeasible,
      },
      changedActivities: impact.deltas.slice(0, 50).map((d) => ({
        ...d,
        name: nameOf.get(d.code) ?? d.code,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
