import {
  addWorkingDays,
  workingDayDate,
  type WorkingCalendar,
} from "./calendarEngine";
import type { DependencyType } from "./types";

export interface PropTask {
  code: string;
  durationDays: number;
  plannedStartDate: Date;
  plannedEndDate: Date;
}

export interface PropDependency {
  predecessorCode: string;
  successorCode: string;
  type: DependencyType;
  lagDays: number;
}

export interface DelayResult {
  code: string;
  plannedStartDate: Date;
  plannedEndDate: Date;
}

// Cascades a delay from a single task to all downstream successors.
// Returns only the tasks whose dates changed.
export function propagateDelay(
  tasks: PropTask[],
  deps: PropDependency[],
  delayedCode: string,
  newEndDate: Date,
  calendar: WorkingCalendar
): DelayResult[] {
  const byCode = new Map(tasks.map((t) => [t.code, { ...t }]));
  const successorsOf = new Map<string, PropDependency[]>();
  for (const t of tasks) successorsOf.set(t.code, []);
  for (const d of deps) {
    if (successorsOf.has(d.predecessorCode)) {
      successorsOf.get(d.predecessorCode)!.push(d);
    }
  }

  const root = byCode.get(delayedCode);
  if (!root) return [];

  const changed = new Map<string, DelayResult>();

  // Apply the new end date to the delayed task itself.
  if (newEndDate.getTime() !== root.plannedEndDate.getTime()) {
    root.plannedEndDate = newEndDate;
    changed.set(root.code, {
      code: root.code,
      plannedStartDate: root.plannedStartDate,
      plannedEndDate: root.plannedEndDate,
    });
  }

  const queue: string[] = [delayedCode];
  let guard = 0;
  while (queue.length && guard < 100000) {
    guard++;
    const currentCode = queue.shift()!;
    const current = byCode.get(currentCode)!;

    for (const dep of successorsOf.get(currentCode) ?? []) {
      const succ = byCode.get(dep.successorCode);
      if (!succ) continue;

      const anchor =
        dep.type === "SS" || dep.type === "SF"
          ? current.plannedStartDate
          : current.plannedEndDate;
      const candidateStart = addWorkingDays(anchor, dep.lagDays, calendar);

      if (candidateStart.getTime() > succ.plannedStartDate.getTime()) {
        succ.plannedStartDate = candidateStart;
        succ.plannedEndDate = workingDayDate(
          candidateStart,
          Math.max(succ.durationDays - 1, 0),
          calendar
        );
        changed.set(succ.code, {
          code: succ.code,
          plannedStartDate: succ.plannedStartDate,
          plannedEndDate: succ.plannedEndDate,
        });
        queue.push(succ.code);
      }
    }
  }

  return Array.from(changed.values());
}
