import { db } from "@/lib/prisma";
import { fail, handleError, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * §23 — variance of the current schedule against a captured baseline.
 * Every figure is derived from stored dates; nothing is estimated.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string; baselineId: string } }
) {
  try {
    const baseline = await db.baseline.findFirst({
      where: { id: params.baselineId, projectId: params.id },
      include: { tasks: true },
    });
    if (!baseline) return fail("Baseline not found", 404);

    const current = await db.task.findMany({
      where: { projectId: params.id },
      orderBy: { sortOrder: "asc" },
    });
    // Matched by activity code, not row id: a snapshot must survive the live
    // task being regenerated, which replaces every id.
    const currentByCode = new Map(current.map((t) => [t.code, t]));

    const rows = baseline.tasks.map((b) => {
      const now = currentByCode.get(b.code);
      if (!now) {
        return {
          taskId: b.taskId,
          code: b.code,
          name: b.name,
          status: "REMOVED" as const,
          baselineStart: b.startDate,
          baselineEnd: b.endDate,
          currentStart: null,
          currentEnd: null,
          startVarianceDays: null,
          finishVarianceDays: null,
          durationVarianceDays: null,
          isCritical: b.isCritical,
        };
      }
      return {
        taskId: b.taskId,
        code: b.code,
        name: now.name,
        status: "TRACKED" as const,
        baselineStart: b.startDate,
        baselineEnd: b.endDate,
        currentStart: now.plannedStartDate,
        currentEnd: now.plannedEndDate,
        startVarianceDays: daysBetween(b.startDate, now.plannedStartDate),
        finishVarianceDays: daysBetween(b.endDate, now.plannedEndDate),
        durationVarianceDays: now.durationDays - b.durationDays,
        isCritical: now.isCritical,
      };
    });

    const baselineCodes = new Set(baseline.tasks.map((t) => t.code));
    const added = current
      .filter((t) => !baselineCodes.has(t.code))
      .map((t) => ({
        taskId: t.id,
        code: t.code,
        name: t.name,
        status: "ADDED" as const,
        currentStart: t.plannedStartDate,
        currentEnd: t.plannedEndDate,
      }));

    const tracked = rows.filter((r) => r.status === "TRACKED");
    const slipped = tracked.filter((r) => (r.finishVarianceDays ?? 0) > 0);
    const ahead = tracked.filter((r) => (r.finishVarianceDays ?? 0) < 0);

    const baselineFinish = baseline.tasks.reduce<Date | null>(
      (max, t) => (!max || t.endDate > max ? t.endDate : max),
      null
    );
    const currentFinish = current.reduce<Date | null>(
      (max, t) => (!max || t.plannedEndDate > max ? t.plannedEndDate : max),
      null
    );

    return ok({
      baseline: {
        id: baseline.id,
        name: baseline.name,
        status: baseline.status,
        capturedAt: baseline.createdAt,
      },
      summary: {
        baselineFinish,
        currentFinish,
        projectFinishVarianceDays:
          baselineFinish && currentFinish
            ? daysBetween(baselineFinish, currentFinish)
            : null,
        trackedCount: tracked.length,
        slippedCount: slipped.length,
        aheadCount: ahead.length,
        addedCount: added.length,
        removedCount: rows.filter((r) => r.status === "REMOVED").length,
        worstSlipDays: slipped.reduce(
          (worst, r) => Math.max(worst, r.finishVarianceDays ?? 0),
          0
        ),
      },
      tasks: rows,
      added,
    });
  } catch (err) {
    return handleError(err);
  }
}
