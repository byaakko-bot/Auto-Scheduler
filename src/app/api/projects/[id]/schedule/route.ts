import { requireProject } from "@/lib/auth/session";
import { db } from "@/lib/prisma";
import { handleError, ok } from "@/lib/api";
import { serializeGantt } from "@/engine/ganttSerializer";
import { phaseColor } from "@/engine/constants";
import type { DependencyType } from "@/engine/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // A project id in the URL is an identifier, not an authorisation.
    await requireProject(params.id, "VIEWER");
    const tasks = await db.task.findMany({
      where: { projectId: params.id },
      orderBy: { sortOrder: "asc" },
    });
    const deps = await db.dependency.findMany({
      where: { predecessor: { projectId: params.id } },
      include: {
        predecessor: { select: { code: true } },
        successor: { select: { code: true } },
      },
    });

    const payload = serializeGantt(
      tasks.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        phase: t.phase,
        plannedStartDate: t.plannedStartDate,
        plannedEndDate: t.plannedEndDate,
        durationDays: t.durationDays,
        progressPct: t.progressPct,
        isCritical: t.isCritical,
        isMilestone: t.isMilestone,
        floatDays: t.floatDays,
        color: phaseColor(t.phase),
        status: t.status,
      })),
      deps.map((d) => ({
        id: d.id,
        predecessorCode: d.predecessor.code,
        successorCode: d.successor.code,
        type: d.type as DependencyType,
        lagDays: d.lagDays,
      }))
    );

    return ok(payload);
  } catch (err) {
    return handleError(err);
  }
}
