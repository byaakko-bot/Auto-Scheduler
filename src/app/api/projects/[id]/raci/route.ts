import { db } from "@/lib/prisma";
import { handleError, ok } from "@/lib/api";
import { raciUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const workPackages = await db.workPackage.findMany({
      where: { projectId: params.id },
      orderBy: { sortOrder: "asc" },
    });
    const parties = await db.projectParty.findMany({
      where: { projectId: params.id },
      include: { party: true },
    });
    const tasks = await db.task.findMany({
      where: { projectId: params.id },
      include: { raciAssignments: true },
    });

    return ok({
      workPackages,
      parties: parties.map((pp) => ({
        id: pp.party.id,
        name: pp.party.name,
        type: pp.party.type,
      })),
      tasks: tasks.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        phase: t.phase,
        workPackageId: t.workPackageId,
        raci: t.raciAssignments.map((r) => ({
          partyId: r.partyId,
          raciRole: r.raciRole,
        })),
      })),
    });
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
    const { updates } = raciUpdateSchema.parse(body);

    for (const u of updates) {
      // Clear any existing assignment for this task+party first.
      await db.raciAssignment.deleteMany({
        where: { taskId: u.taskId, partyId: u.partyId },
      });
      if (u.raciRole) {
        await db.raciAssignment.create({
          data: { taskId: u.taskId, partyId: u.partyId, raciRole: u.raciRole },
        });
      }
    }

    return ok({ updated: updates.length });
  } catch (err) {
    return handleError(err);
  }
}
