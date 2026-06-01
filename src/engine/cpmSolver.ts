import type { ScheduleNode } from "./types";

function topologicalSort(nodes: ScheduleNode[]): ScheduleNode[] {
  const byId = new Map(nodes.map((n) => [n.taskId, n]));
  const indegree = new Map<string, number>();
  const successors = new Map<string, string[]>();

  for (const n of nodes) {
    indegree.set(n.taskId, 0);
    successors.set(n.taskId, []);
  }
  for (const n of nodes) {
    for (const p of n.predecessors) {
      if (!byId.has(p.taskId)) continue;
      indegree.set(n.taskId, (indegree.get(n.taskId) ?? 0) + 1);
      successors.get(p.taskId)!.push(n.taskId);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of indegree) if (deg === 0) queue.push(id);

  const sorted: ScheduleNode[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    sorted.push(byId.get(id)!);
    for (const s of successors.get(id) ?? []) {
      indegree.set(s, (indegree.get(s) ?? 0) - 1);
      if (indegree.get(s) === 0) queue.push(s);
    }
  }

  // If a cycle prevented full ordering, append remaining nodes as-is.
  if (sorted.length < nodes.length) {
    for (const n of nodes) if (!sorted.includes(n)) sorted.push(n);
  }
  return sorted;
}

// Computes ES, EF, LS, LF, float and isCritical for each node.
// All values are expressed in working-day offsets from project start.
export function solveCPM(tasks: ScheduleNode[]): ScheduleNode[] {
  const byId = new Map(tasks.map((t) => [t.taskId, t]));
  const sorted = topologicalSort(tasks);

  // Forward pass
  for (const node of sorted) {
    if (node.predecessors.length === 0) {
      node.es = 0;
    } else {
      node.es = Math.max(
        0,
        ...node.predecessors.map((pred) => {
          const p = byId.get(pred.taskId);
          if (!p) return 0;
          switch (pred.type) {
            case "FS":
              return p.ef + pred.lag;
            case "SS":
              return p.es + pred.lag;
            case "FF":
              return p.ef + pred.lag - node.durationDays;
            case "SF":
              return p.es + pred.lag - node.durationDays;
            default:
              return p.ef + pred.lag;
          }
        })
      );
    }
    node.ef = node.es + node.durationDays;
  }

  const projectDuration = Math.max(0, ...tasks.map((t) => t.ef));

  // Map of successors for the backward pass
  const successorsOf = new Map<string, ScheduleNode[]>();
  for (const t of tasks) successorsOf.set(t.taskId, []);
  for (const t of tasks) {
    for (const p of t.predecessors) {
      if (successorsOf.has(p.taskId)) successorsOf.get(p.taskId)!.push(t);
    }
  }

  // Backward pass
  for (const node of [...sorted].reverse()) {
    const succs = successorsOf.get(node.taskId) ?? [];
    if (succs.length === 0) {
      node.lf = projectDuration;
    } else {
      node.lf = Math.min(
        projectDuration,
        ...succs.map((succ) => {
          const dep = succ.predecessors.find((p) => p.taskId === node.taskId)!;
          switch (dep.type) {
            case "FS":
              return succ.ls - dep.lag;
            case "SS":
              return succ.ls - dep.lag + node.durationDays;
            case "FF":
              return succ.lf - dep.lag;
            case "SF":
              return succ.lf - dep.lag + node.durationDays;
            default:
              return succ.ls - dep.lag;
          }
        })
      );
    }
    node.ls = node.lf - node.durationDays;
    node.float = node.ls - node.es;
    node.isCritical = node.float <= 0;
  }

  return tasks;
}

export function projectDurationOf(tasks: ScheduleNode[]): number {
  return Math.max(0, ...tasks.map((t) => t.ef));
}
