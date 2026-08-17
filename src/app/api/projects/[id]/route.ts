import { db } from "@/lib/prisma";
import { fail, handleError, ok } from "@/lib/api";
import { updateProjectSchema } from "@/lib/validation";

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

/** Fields that change what the engine produces, so editing them stales the schedule. */
const SCHEDULE_DRIVING = new Set([
  "buildingType",
  "constructionMethod",
  "totalAreaSqm",
  "numberOfFloors",
  "numberOfUnits",
  "numberOfBasements",
  "startDate",
  "targetEndDate",
  "workingDaysPerWeek",
  "workingHoursPerDay",
]);

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const before = await db.project.findUnique({ where: { id: params.id } });
    if (!before) return fail("Project not found", 404);

    const input = updateProjectSchema.parse(await req.json());

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      if (key === "startDate" && typeof value === "string") {
        data.startDate = new Date(value);
      } else if (key === "targetEndDate") {
        data.targetEndDate = value ? new Date(value as string) : null;
      } else {
        data[key] = value;
      }
    }

    if (Object.keys(data).length === 0) {
      return fail("No editable fields supplied", 422);
    }

    if (
      data.startDate &&
      data.targetEndDate &&
      (data.targetEndDate as Date) <= (data.startDate as Date)
    ) {
      return fail("Target end date must be after the start date", 422);
    }

    const project = await db.project.update({
      where: { id: params.id },
      data,
    });

    // §45 — record what changed, from what, to what.
    const changed = Object.keys(data);
    await db.auditLog.create({
      data: {
        projectId: params.id,
        action: "UPDATE",
        entity: "Project",
        entityId: params.id,
        field: changed.join(","),
        oldValue: JSON.stringify(
          Object.fromEntries(
            changed.map((k) => [k, (before as Record<string, unknown>)[k]])
          )
        ),
        newValue: JSON.stringify(data),
        reason: "Project edited",
      },
    });

    // Editing an input the engine reads leaves the stored schedule describing
    // a project that no longer exists. Say so rather than silently diverging.
    const touchedDrivers = changed.filter((k) => SCHEDULE_DRIVING.has(k));
    const taskCount = await db.task.count({ where: { projectId: params.id } });

    return ok({
      project,
      scheduleStale: touchedDrivers.length > 0 && taskCount > 0,
      staleBecause: touchedDrivers,
      message:
        touchedDrivers.length > 0 && taskCount > 0
          ? `Changed ${touchedDrivers.join(", ")}. The existing schedule was built ` +
            `from the previous values — regenerate it to reflect this change.`
          : undefined,
    });
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
