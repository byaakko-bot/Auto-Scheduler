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

    const task = await db.task.update({
      where: { id: params.taskId },
      data,
    });
    return ok(task);
  } catch (err) {
    return handleError(err);
  }
}
