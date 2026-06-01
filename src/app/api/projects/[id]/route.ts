import { db } from "@/lib/prisma";
import { fail, handleError, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const project = await db.project.findUnique({
      where: { id: params.id },
      include: {
        company: true,
        _count: {
          select: { tasks: true, milestones: true, risks: true, workPackages: true },
        },
      },
    });
    if (!project) return fail("Project not found", 404);
    return ok(project);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const allowed: Record<string, unknown> = {};
    for (const key of [
      "name",
      "clientName",
      "description",
      "status",
      "workingDaysPerWeek",
      "workingHoursPerDay",
      "currency",
    ]) {
      if (key in body) allowed[key] = body[key];
    }
    const project = await db.project.update({
      where: { id: params.id },
      data: allowed,
    });
    return ok(project);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await db.project.delete({ where: { id: params.id } });
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
