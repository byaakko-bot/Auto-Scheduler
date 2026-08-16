import { db } from "@/lib/prisma";
import { handleError, ok } from "@/lib/api";
import { updateTaskSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; taskId: string } }
) {
  try {
    const body = await req.json();
    const input = updateTaskSchema.parse(body);

    const data: Record<string, unknown> = {};
    if (input.progressPct !== undefined) {
      data.progressPct = input.progressPct;
      if (input.progressPct >= 100) data.status = "COMPLETED";
      else if (input.progressPct > 0) data.status = "IN_PROGRESS";
    }
    if (input.status !== undefined) data.status = input.status;
    if (input.plannedStartDate) data.plannedStartDate = new Date(input.plannedStartDate);
    if (input.plannedEndDate) data.plannedEndDate = new Date(input.plannedEndDate);
    if (input.actualStartDate) data.actualStartDate = new Date(input.actualStartDate);
    if (input.actualEndDate) data.actualEndDate = new Date(input.actualEndDate);
    if (input.remainingDurationDays !== undefined) {
      data.remainingDurationDays = input.remainingDurationDays;
    }
    if (input.actualQuantity !== undefined) {
      data.actualQuantity = input.actualQuantity;
    }

    const before = await db.task.findUnique({ where: { id: params.taskId } });

    const task = await db.task.update({
      where: { id: params.taskId },
      data,
    });

    // Progress edits are exactly the changes a planner needs to trace later.
    if (before) {
      await db.auditLog.create({
        data: {
          projectId: params.id,
          action: "UPDATE",
          entity: "Task",
          entityId: params.taskId,
          field: Object.keys(data).join(","),
          oldValue: JSON.stringify({
            progressPct: before.progressPct,
            actualStartDate: before.actualStartDate,
            actualEndDate: before.actualEndDate,
            remainingDurationDays: before.remainingDurationDays,
            actualQuantity: before.actualQuantity,
          }),
          newValue: JSON.stringify(data),
          reason: "Progress update",
        },
      });
    }

    return ok(task);
  } catch (err) {
    return handleError(err);
  }
}
