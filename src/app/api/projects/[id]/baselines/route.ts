import { db } from "@/lib/prisma";
import { fail, handleError, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

// Lists baselines with their variance against the current schedule.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const baselines = await db.baseline.findMany({
      where: { projectId: params.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { tasks: true } } },
    });

    return ok(
      baselines.map((b) => ({
        id: b.id,
        name: b.name,
        status: b.status,
        approvedAt: b.approvedAt,
        approvedBy: b.approvedBy,
        notes: b.notes,
        createdAt: b.createdAt,
        taskCount: b._count.tasks,
      }))
    );
  } catch (err) {
    return handleError(err);
  }
}

// Captures the current schedule as an immutable baseline snapshot.
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const project = await db.project.findUnique({ where: { id: params.id } });
    if (!project) return fail("Project not found", 404);

    const body = await req.json().catch(() => ({}));
    const name: string = (body.name ?? "").trim();
    if (!name) return fail("A baseline name is required", 422);

    const tasks = await db.task.findMany({
      where: { projectId: params.id },
      orderBy: { sortOrder: "asc" },
    });
    if (tasks.length === 0) {
      return fail("Generate a schedule before capturing a baseline", 422);
    }

    const existing = await db.baseline.findFirst({
      where: { projectId: params.id, name },
    });
    if (existing) {
      return fail(`A baseline named "${name}" already exists`, 409);
    }

    const baseline = await db.$transaction(async (tx) => {
      const created = await tx.baseline.create({
        data: {
          projectId: params.id,
          name,
          notes: body.notes ?? null,
          status: body.approve === true ? "APPROVED" : "DRAFT",
          approvedAt: body.approve === true ? new Date() : null,
          approvedBy: body.approve === true ? (body.approvedBy ?? null) : null,
        },
      });

      await tx.baselineTask.createMany({
        data: tasks.map((t) => ({
          baselineId: created.id,
          taskId: t.id,
          code: t.code,
          name: t.name,
          startDate: t.plannedStartDate,
          endDate: t.plannedEndDate,
          durationDays: t.durationDays,
          floatDays: t.floatDays,
          isCritical: t.isCritical,
        })),
      });

      await tx.auditLog.create({
        data: {
          projectId: params.id,
          action: "CREATE",
          entity: "Baseline",
          entityId: created.id,
          field: "status",
          newValue: created.status,
          reason: body.reason ?? "Baseline captured",
        },
      });

      return created;
    });

    return ok(
      {
        id: baseline.id,
        name: baseline.name,
        status: baseline.status,
        taskCount: tasks.length,
      },
      201
    );
  } catch (err) {
    return handleError(err);
  }
}
