import type {
  ConstraintType,
  CpmOptions,
  CpmResult,
  CriticalityBand,
  ScheduleNode,
} from "./types";

// Raised when the activity network contains a dependency cycle. A cyclic
// network has no valid CPM solution, so the solver refuses to invent one.
export class CircularDependencyError extends Error {
  readonly cycles: string[][];

  constructor(cycles: string[][]) {
    const preview = cycles
      .slice(0, 3)
      .map((c) => c.join(" -> "))
      .join("; ");
    super(
      `Dependency cycle detected in ${cycles.length} chain(s): ${preview}` +
        (cycles.length > 3 ? " …" : "")
    );
    this.name = "CircularDependencyError";
    this.cycles = cycles;
  }
}

interface Graph {
  byId: Map<string, ScheduleNode>;
  successorsOf: Map<string, ScheduleNode[]>;
}

function buildGraph(nodes: ScheduleNode[]): Graph {
  const byId = new Map(nodes.map((n) => [n.taskId, n]));
  const successorsOf = new Map<string, ScheduleNode[]>();
  for (const n of nodes) successorsOf.set(n.taskId, []);
  for (const n of nodes) {
    for (const p of n.predecessors) {
      const bucket = successorsOf.get(p.taskId);
      if (bucket) bucket.push(n);
    }
  }
  return { byId, successorsOf };
}

// Kahn's algorithm. Runs in O(V + E) and reports the nodes left unresolved,
// which are exactly the nodes participating in (or downstream of) a cycle.
function topologicalSort(nodes: ScheduleNode[], graph: Graph): ScheduleNode[] {
  const indegree = new Map<string, number>();
  for (const n of nodes) indegree.set(n.taskId, 0);
  for (const n of nodes) {
    let deg = 0;
    for (const p of n.predecessors) if (graph.byId.has(p.taskId)) deg++;
    indegree.set(n.taskId, deg);
  }

  const queue: ScheduleNode[] = [];
  for (const n of nodes) if (indegree.get(n.taskId) === 0) queue.push(n);

  const sorted: ScheduleNode[] = [];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    sorted.push(current);
    for (const succ of graph.successorsOf.get(current.taskId) ?? []) {
      const next = (indegree.get(succ.taskId) ?? 0) - 1;
      indegree.set(succ.taskId, next);
      if (next === 0) queue.push(succ);
    }
  }

  if (sorted.length !== nodes.length) {
    const unresolved = new Set(
      nodes.filter((n) => (indegree.get(n.taskId) ?? 0) > 0).map((n) => n.taskId)
    );
    throw new CircularDependencyError(extractCycles(unresolved, graph));
  }
  return sorted;
}

// Walks the unresolved subgraph to name concrete cycles for the user, so the
// schedule-health report can point at real activity codes rather than a count.
function extractCycles(unresolved: Set<string>, graph: Graph): string[][] {
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const MAX_CYCLES = 25;

  // Iterative DFS — a cycle can be arbitrarily long, so recursion is unsafe.
  for (const start of unresolved) {
    if (seen.has(start) || cycles.length >= MAX_CYCLES) continue;

    const path: string[] = [start];
    const cursor: number[] = [0];
    const onPath = new Set<string>([start]);
    seen.add(start);

    while (path.length > 0 && cycles.length < MAX_CYCLES) {
      const depth = path.length - 1;
      const succs = (graph.successorsOf.get(path[depth]) ?? []).filter((s) =>
        unresolved.has(s.taskId)
      );

      if (cursor[depth] >= succs.length) {
        onPath.delete(path[depth]);
        path.pop();
        cursor.pop();
        continue;
      }

      const nextId = succs[cursor[depth]].taskId;
      cursor[depth]++;

      if (onPath.has(nextId)) {
        // Closed the loop — record the cycle from its entry point.
        cycles.push([...path.slice(path.indexOf(nextId)), nextId]);
        continue;
      }
      if (seen.has(nextId)) continue;

      seen.add(nextId);
      onPath.add(nextId);
      path.push(nextId);
      cursor.push(0);
    }
  }
  return cycles;
}

// Earliest start implied by one predecessor relationship.
function earliestStartFrom(
  pred: ScheduleNode,
  type: string,
  lag: number,
  duration: number
): number {
  switch (type) {
    case "SS":
      return pred.es + lag;
    case "FF":
      return pred.ef + lag - duration;
    case "SF":
      return pred.es + lag - duration;
    case "FS":
    default:
      return pred.ef + lag;
  }
}

// Latest finish implied by one successor relationship.
function latestFinishFrom(
  succ: ScheduleNode,
  type: string,
  lag: number,
  duration: number
): number {
  switch (type) {
    case "SS":
      return succ.ls - lag + duration;
    case "FF":
      return succ.lf - lag;
    case "SF":
      return succ.lf - lag + duration;
    case "FS":
    default:
      return succ.ls - lag;
  }
}

// Applies a date constraint during the forward pass.
function applyEarlyConstraint(node: ScheduleNode, es: number): number {
  const c = node.constraint;
  if (!c) return es;
  switch (c.type) {
    case "SNET":
      return Math.max(es, c.offset);
    case "MSO":
      return c.offset;
    case "MFO":
      return c.offset - node.durationDays;
    default:
      return es;
  }
}

// Applies a date constraint during the backward pass.
function applyLateConstraint(node: ScheduleNode, lf: number): number {
  const c = node.constraint;
  if (!c) return lf;
  switch (c.type) {
    case "FNLT":
      return Math.min(lf, c.offset);
    case "MSO":
      return c.offset + node.durationDays;
    case "MFO":
      return c.offset;
    default:
      return lf;
  }
}

function bandFor(
  float: number,
  nearThreshold: number,
  watchThreshold: number
): CriticalityBand {
  if (float <= 0) return "CRITICAL";
  if (float <= nearThreshold) return "NEAR_CRITICAL";
  if (float <= watchThreshold) return "WATCH";
  return "NORMAL";
}

/**
 * Solves the network for ES/EF/LS/LF, total float, free float and criticality.
 *
 * All values are working-day offsets from project start — the caller maps them
 * onto real dates through a calendar. Unlike the previous implementation this
 * throws on cyclic input rather than emitting plausible-looking nonsense, and
 * it supports a project deadline so total float can legitimately go negative.
 */
export function solveCPM(
  tasks: ScheduleNode[],
  options: CpmOptions = {}
): ScheduleNode[] {
  solve(tasks, options);
  return tasks;
}

export function solve(
  tasks: ScheduleNode[],
  options: CpmOptions = {}
): CpmResult {
  const nearThreshold = options.nearCriticalThreshold ?? 5;
  const watchThreshold = options.watchThreshold ?? 10;

  const graph = buildGraph(tasks);
  const sorted = topologicalSort(tasks, graph);

  // ── Forward pass ────────────────────────────────────────────────
  for (const node of sorted) {
    let es = 0;
    for (const pred of node.predecessors) {
      const p = graph.byId.get(pred.taskId);
      if (!p) continue;
      const candidate = earliestStartFrom(
        p,
        pred.type,
        pred.lag,
        node.durationDays
      );
      if (candidate > es) es = candidate;
    }
    node.es = Math.max(0, applyEarlyConstraint(node, es));
    node.ef = node.es + node.durationDays;
  }

  const earliestFinish = tasks.length
    ? Math.max(...tasks.map((t) => t.ef))
    : 0;

  // A deadline earlier than the computed finish drives total float negative,
  // which is what makes §35 feasibility checking possible at all.
  const projectFinish = options.deadline ?? earliestFinish;

  // ── Backward pass ───────────────────────────────────────────────
  for (let i = sorted.length - 1; i >= 0; i--) {
    const node = sorted[i];
    const succs = graph.successorsOf.get(node.taskId) ?? [];

    let lf: number;
    if (succs.length === 0) {
      lf = projectFinish;
    } else {
      lf = Infinity;
      for (const succ of succs) {
        const dep = succ.predecessors.find((p) => p.taskId === node.taskId);
        if (!dep) continue;
        const candidate = latestFinishFrom(
          succ,
          dep.type,
          dep.lag,
          node.durationDays
        );
        if (candidate < lf) lf = candidate;
      }
      if (lf === Infinity) lf = projectFinish;
    }

    node.lf = applyLateConstraint(node, lf);
    node.ls = node.lf - node.durationDays;
    node.float = node.ls - node.es;
  }

  // Criticality is measured against the LEAST float in the network, not
  // against zero. A schedule that comfortably beats its deadline still has a
  // longest path, and that path is what governs the finish date — reporting
  // "no critical activities" because everything has slack against a generous
  // deadline hides the very chain a planner needs to protect.
  //
  // When the deadline binds, least float is zero or negative and the threshold
  // collapses to the conventional "float <= 0".
  const leastFloat = tasks.length
    ? Math.min(...tasks.map((t) => t.float))
    : 0;
  const criticalThreshold = Math.max(0, leastFloat);

  for (const node of tasks) {
    node.isCritical = node.float <= criticalThreshold;
    // Bands are relative to the critical threshold, so "near critical" means
    // near the governing chain rather than near an arbitrary zero.
    node.band = bandFor(
      node.float - criticalThreshold,
      nearThreshold,
      watchThreshold
    );
  }

  // ── Free float ──────────────────────────────────────────────────
  // How far an activity can slip without delaying ANY successor — distinct
  // from total float, which measures slip against project completion.
  for (const node of tasks) {
    const succs = graph.successorsOf.get(node.taskId) ?? [];
    if (succs.length === 0) {
      node.freeFloat = Math.max(0, projectFinish - node.ef);
      continue;
    }
    let free = Infinity;
    for (const succ of succs) {
      const dep = succ.predecessors.find((p) => p.taskId === node.taskId);
      if (!dep) continue;
      const required = earliestStartFrom(
        node,
        dep.type,
        dep.lag,
        succ.durationDays
      );
      free = Math.min(free, succ.es - required);
    }
    node.freeFloat = free === Infinity ? 0 : Math.max(0, free);
  }

  return {
    nodes: tasks,
    projectDuration: earliestFinish,
    deadline: options.deadline,
    isFeasible: options.deadline === undefined || earliestFinish <= options.deadline,
    criticalPaths: enumerateCriticalPaths(tasks, graph, nearThreshold),
  };
}

// Enumerates distinct critical and near-critical chains. A real project has
// several — structure, long-lead procurement, utility connections — and §8
// requires surfacing all of them rather than one flat list of activities.
function enumerateCriticalPaths(
  tasks: ScheduleNode[],
  graph: Graph,
  nearThreshold: number
): string[][] {
  // Same threshold basis as isCritical: least float, not zero.
  const leastFloat = tasks.length ? Math.min(...tasks.map((t) => t.float)) : 0;
  const criticalThreshold = Math.max(0, leastFloat);
  const eligible = new Set(
    tasks
      .filter((t) => t.float - criticalThreshold <= nearThreshold)
      .map((t) => t.taskId)
  );
  if (eligible.size === 0) return [];

  // Path starts: eligible nodes with no eligible predecessor.
  const starts = tasks.filter(
    (t) =>
      eligible.has(t.taskId) &&
      !t.predecessors.some((p) => eligible.has(p.taskId))
  );

  const paths: string[][] = [];
  const MAX_PATHS = 25;

  // Iterative depth-first backtracking. Recursion would overflow the stack on
  // long chains — a 10,000-activity critical path is one legitimate path, not
  // a pathological case.
  const eligibleSuccessors = (id: string): ScheduleNode[] =>
    (graph.successorsOf.get(id) ?? []).filter((s) => eligible.has(s.taskId));

  for (const start of starts) {
    if (paths.length >= MAX_PATHS) break;

    const path: string[] = [start.taskId];
    const cursor: number[] = [0];
    const onPath = new Set<string>([start.taskId]);

    while (path.length > 0 && paths.length < MAX_PATHS) {
      const depth = path.length - 1;
      const succs = eligibleSuccessors(path[depth]);

      if (succs.length === 0 || cursor[depth] >= succs.length) {
        if (succs.length === 0) paths.push([...path]);
        onPath.delete(path[depth]);
        path.pop();
        cursor.pop();
        continue;
      }

      const next = succs[cursor[depth]];
      cursor[depth]++;
      // Guard against re-entering a node already on this path. The network is
      // acyclic by this point, but diamond shapes can revisit shared nodes.
      if (!onPath.has(next.taskId)) {
        path.push(next.taskId);
        cursor.push(0);
        onPath.add(next.taskId);
      }
    }
  }

  // Longest (most constrained) chains first.
  return paths.sort((a, b) => b.length - a.length);
}

export function projectDurationOf(tasks: ScheduleNode[]): number {
  return tasks.length ? Math.max(0, ...tasks.map((t) => t.ef)) : 0;
}

export type { ConstraintType };
