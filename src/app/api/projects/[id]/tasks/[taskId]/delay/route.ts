import { db } from "@/lib/prisma";
import { fail, handleError, ok } from "@/lib/api";
import { delayTaskSchema } from "@/lib/validation";
import { buildCalendar } from "@/engine/calendarEngine";
import { propagateDelay, type PropDependency } from "@/engine/delayPropagator";
import type { DependencyType } from "@/engine/types";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string; taskId: string } }
) {
  try {
    const body = await req.json();
    const { newEndDate } = delayTaskSchema.parse(body);

    const project = await db.project.findUnique({ where: { id: params.id } });
    if (!project) return fail("Project not found", 404);

    const tasks = await db.task.findMany({ where: { projectId: params.id } });
    const delayed = tasks.find((t) => t.id === params.taskId);
    if (!delayed) return fail("Task not found", 404);

    const deps = await db.dependency.findMany({
      where: { predecessor: { projectId: params.id } },
      include: {
        predecessor: { select: { code: true } },
        successor: { select: { code: true } },
      },
    });

    const holidays = await db.publicHoliday.findMany({
      where: { projectId: params.id },
    });
    const calendar = buildCalendar(
      project.workingDaysPerWeek,
      holidays.map((h) => h.date)
    );

    const propDeps: PropDependency[] = deps.map((d) => ({
      predecessorCode: d.predecessor.code,
      successorCode: d.successor.code,
      type: d.type as DependencyType,
      lagDays: d.lagDays,
    }));

    const changed = propagateDelay(
      tasks.map((t) => ({
        code: t.code,
        durationDays: t.durationDays,
        plannedStartDate: t.plannedStartDate,
        plannedEndDate: t.plannedEndDate,
      })),
      propDeps,
      delayed.code,
      new Date(newEndDate),
      calendar
    );

    const codeToId = new Map(tasks.map((t) => [t.code, t.id]));

    await db.$transaction([
      db.task.update({
        where: { id: delayed.id },
        data: {
          actualEndDate: new Date(newEndDate),
          plannedEndDate: new Date(newEndDate),
          status: "DELAYED",
        },
      }),
      ...changed
        .filter((c) => c.code !== delayed.code)
        .map((c) =>
          db.task.update({
            where: { id: codeToId.get(c.code)! },
            data: {
              plannedStartDate: c.plannedStartDate,
              plannedEndDate: c.plannedEndDate,
            },
          })
        ),
    ]);

    return ok({ affected: changed.length, changed });
  } catch (err) {
    return handleError(err);
  }
}
