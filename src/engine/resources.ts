// Resource loading and crew capacity (§14, §15).
//
// Demand is evaluated over working-day offsets with a sweep line, so a
// conflict is reported as the interval where it actually exists rather than
// as a vague "these two tasks overlap". Capacity is per resource: two concrete
// gangs can run two pours at once, one cannot.

export interface ResourceAssignment {
  taskCode: string;
  taskName?: string;
  resourceId: string;
  resourceName: string;
  /** Crews (or units of the resource) this activity consumes. */
  crews: number;
  /** Working-day offsets from project start. */
  es: number;
  ef: number;
}

export interface ResourceCapacity {
  resourceId: string;
  resourceName: string;
  /** Units available concurrently. */
  capacity: number;
}

export interface ResourceConflict {
  resourceId: string;
  resourceName: string;
  capacity: number;
  /** Interval, in working-day offsets, over which demand exceeds capacity. */
  fromOffset: number;
  toOffset: number;
  peakDemand: number;
  excess: number;
  taskCodes: string[];
  explanation: string;
}

export interface HistogramBucket {
  offset: number;
  demand: number;
  overCapacity: boolean;
}

interface Event {
  offset: number;
  delta: number;
  taskCode: string;
}

/**
 * Finds intervals where concurrent demand for a resource exceeds its capacity.
 * Adjacent intervals with the same demand are merged so one long overload is
 * reported once, not once per day.
 */
export function detectResourceConflicts(
  assignments: ResourceAssignment[],
  capacities: ResourceCapacity[]
): ResourceConflict[] {
  const capacityById = new Map(capacities.map((c) => [c.resourceId, c]));
  const byResource = new Map<string, ResourceAssignment[]>();
  for (const a of assignments) {
    if (!byResource.has(a.resourceId)) byResource.set(a.resourceId, []);
    byResource.get(a.resourceId)!.push(a);
  }

  const conflicts: ResourceConflict[] = [];

  for (const [resourceId, items] of byResource) {
    const cap = capacityById.get(resourceId);
    // Without a declared capacity there is nothing to breach. §42: do not
    // assume a capacity of one and invent conflicts.
    if (!cap) continue;

    const events: Event[] = [];
    for (const a of items) {
      if (a.ef <= a.es) continue;
      events.push({ offset: a.es, delta: a.crews, taskCode: a.taskCode });
      events.push({ offset: a.ef, delta: -a.crews, taskCode: a.taskCode });
    }
    if (events.length === 0) continue;
    events.sort((x, y) => x.offset - y.offset || x.delta - y.delta);

    let demand = 0;
    const active = new Set<string>();
    let open: ResourceConflict | null = null;

    for (let i = 0; i < events.length; i++) {
      const e = events[i];

      // Close any open conflict at this boundary before applying the event.
      if (open && open.toOffset < e.offset) open.toOffset = e.offset;

      demand += e.delta;
      if (e.delta > 0) active.add(e.taskCode);
      else active.delete(e.taskCode);

      // Collapse simultaneous events before evaluating.
      if (i + 1 < events.length && events[i + 1].offset === e.offset) continue;

      const nextOffset = events[i + 1]?.offset ?? e.offset;

      if (demand > cap.capacity) {
        if (!open) {
          open = {
            resourceId,
            resourceName: cap.resourceName,
            capacity: cap.capacity,
            fromOffset: e.offset,
            toOffset: nextOffset,
            peakDemand: demand,
            excess: demand - cap.capacity,
            taskCodes: [...active],
            explanation: "",
          };
        } else {
          open.toOffset = nextOffset;
          open.peakDemand = Math.max(open.peakDemand, demand);
          open.excess = Math.max(open.excess, demand - cap.capacity);
          for (const t of active) {
            if (!open.taskCodes.includes(t)) open.taskCodes.push(t);
          }
        }
      } else if (open) {
        open.toOffset = e.offset;
        conflicts.push(finalise(open));
        open = null;
      }
    }

    if (open) conflicts.push(finalise(open));
  }

  return conflicts.sort((a, b) => b.excess - a.excess || a.fromOffset - b.fromOffset);
}

function finalise(c: ResourceConflict): ResourceConflict {
  return {
    ...c,
    explanation:
      `${c.resourceName}: ${c.peakDemand} crew(s) required against a capacity of ` +
      `${c.capacity} between day ${c.fromOffset} and day ${c.toOffset} ` +
      `(${c.taskCodes.length} overlapping activities, ${c.excess} over).`,
  };
}

/** Daily demand profile for one resource, for a histogram. */
export function resourceHistogram(
  assignments: ResourceAssignment[],
  resourceId: string,
  capacity: number,
  horizon: number
): HistogramBucket[] {
  const buckets: HistogramBucket[] = [];
  const items = assignments.filter((a) => a.resourceId === resourceId);

  for (let offset = 0; offset < horizon; offset++) {
    let demand = 0;
    for (const a of items) {
      if (offset >= a.es && offset < a.ef) demand += a.crews;
    }
    buckets.push({ offset, demand, overCapacity: demand > capacity });
  }
  return buckets;
}

export interface ResolutionOption {
  kind: "DELAY_TASK" | "ADD_CAPACITY" | "REASSIGN" | "SPLIT";
  description: string;
  taskCode?: string;
}

/**
 * Concrete ways to clear a conflict. Deliberately descriptive rather than
 * automatic: which activity gives way is a planner's call, not the engine's.
 */
export function resolutionsFor(
  conflict: ResourceConflict,
  floatByTask: Map<string, number>
): ResolutionOption[] {
  const options: ResolutionOption[] = [];

  // Prefer moving whichever overlapping activity has the most float.
  const movable = conflict.taskCodes
    .map((code) => ({ code, float: floatByTask.get(code) ?? 0 }))
    .filter((t) => t.float > 0)
    .sort((a, b) => b.float - a.float);

  for (const m of movable.slice(0, 2)) {
    options.push({
      kind: "DELAY_TASK",
      taskCode: m.code,
      description:
        `Delay ${m.code} — it holds ${m.float} day(s) of float, so moving it ` +
        `clears the overlap without affecting the project finish.`,
    });
  }

  options.push({
    kind: "ADD_CAPACITY",
    description:
      `Add ${conflict.excess} more ${conflict.resourceName} crew(s) for the ` +
      `overlap window (day ${conflict.fromOffset}–${conflict.toOffset}).`,
  });

  if (movable.length === 0) {
    options.push({
      kind: "REASSIGN",
      description:
        `Every overlapping activity is critical. Either subcontract part of the ` +
        `work or resequence — delaying any of them delays the project.`,
    });
  }

  return options;
}
