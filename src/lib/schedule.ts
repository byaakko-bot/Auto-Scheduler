import { db } from "./prisma";
import { buildCalendar, workingDayDate, type WorkingCalendar } from "@/engine/calendarEngine";
import type { DependencyType, ScheduleNode } from "@/engine/types";

export interface LoadedNetwork {
  project: NonNullable<Awaited<ReturnType<typeof db.project.findUnique>>>;
  nodes: ScheduleNode[];
  calendar: WorkingCalendar;
  /** Activity code -> task id, for writing results back. */
  codeToId: Map<string, string>;
  tasks: Awaited<ReturnType<typeof db.task.findMany>>;
}

/**
 * Rebuilds the CPM network from stored tasks and dependencies so the engine
 * can be re-run against live data. Durations and logic come from the database,
 * never from a regenerated template — regenerating would discard any manual
 * edits a planner has made.
 */
export async function loadNetwork(
  projectId: string
): Promise<LoadedNetwork | null> {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return null;

  const [tasks, deps, holidays] = await Promise.all([
    db.task.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" } }),
    db.dependency.findMany({
      where: { predecessor: { projectId } },
      include: {
        predecessor: { select: { code: true } },
        successor: { select: { code: true } },
      },
    }),
    db.publicHoliday.findMany({ where: { projectId } }),
  ]);

  const predecessorsOf = new Map<
    string,
    { taskId: string; type: DependencyType; lag: number }[]
  >();
  for (const t of tasks) predecessorsOf.set(t.code, []);
  for (const d of deps) {
    predecessorsOf.get(d.successor.code)?.push({
      taskId: d.predecessor.code,
      type: d.type as DependencyType,
      lag: d.lagDays,
    });
  }

  const nodes: ScheduleNode[] = tasks.map((t) => ({
    taskId: t.code,
    durationDays: t.durationDays,
    predecessors: predecessorsOf.get(t.code) ?? [],
    constraint:
      t.constraintType && t.constraintDate
        ? {
            type: t.constraintType as never,
            offset: 0, // resolved by the caller against the project calendar
          }
        : undefined,
    es: 0,
    ef: 0,
    ls: 0,
    lf: 0,
    float: 0,
    freeFloat: 0,
    isCritical: false,
    band: "NORMAL",
  }));

  return {
    project,
    nodes,
    calendar: buildCalendar(
      project.workingDaysPerWeek,
      holidays.map((h) => h.date),
      { hoursPerDay: project.workingHoursPerDay }
    ),
    codeToId: new Map(tasks.map((t) => [t.code, t.id])),
    tasks,
  };
}

/** Converts solved CPM offsets back into stored dates and float. */
export function persistablePatch(
  node: ScheduleNode,
  projectStart: Date,
  calendar: WorkingCalendar,
  isMilestone: boolean
) {
  const plannedStartDate = workingDayDate(projectStart, node.es, calendar);
  const endOffset = isMilestone ? node.es : Math.max(node.ef - 1, node.es);
  return {
    plannedStartDate,
    plannedEndDate: workingDayDate(projectStart, endOffset, calendar),
    durationDays: node.durationDays,
    floatDays: node.float,
    freeFloatDays: node.freeFloat,
    isCritical: node.isCritical,
    criticalityBand: node.band as never,
    earlyStartOffset: node.es,
    earlyFinishOffset: node.ef,
    lateStartOffset: node.ls,
    lateFinishOffset: node.lf,
  };
}
