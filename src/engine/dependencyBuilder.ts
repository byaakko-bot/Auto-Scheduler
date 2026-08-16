import type { ScheduleNode, TaskWithDuration } from "./types";

// Converts duration-resolved tasks into CPM schedule nodes, dropping any
// predecessor references whose target task does not exist in the set.
export function buildScheduleNodes(tasks: TaskWithDuration[]): ScheduleNode[] {
  const codes = new Set(tasks.map((t) => t.code));
  return tasks.map((t) => ({
    taskId: t.code,
    durationDays: t.durationDays,
    predecessors: t.predecessors
      .filter((p) => codes.has(p.code))
      .map((p) => ({ taskId: p.code, type: p.type, lag: p.lag })),
    es: 0,
    ef: 0,
    ls: 0,
    lf: 0,
    float: 0,
    freeFloat: 0,
    isCritical: false,
    band: "NORMAL",
  }));
}
