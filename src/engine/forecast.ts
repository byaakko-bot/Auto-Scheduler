// Progress, forecasting and delay propagation (§19, §20, §25, §26).
//
// The central design decision: a delay is NOT propagated by walking the
// network and adding days to successors. Progress is folded into the activity
// network as constraints and revised durations, and then the CPM solver is run
// again. Float, the critical path and the forecast finish therefore fall out
// of the same deterministic pass that produced the baseline — they are never
// patched up afterwards, and a slip that float can absorb moves nothing.

import { offsetOfDate, type WorkingCalendar } from "./calendarEngine";
import { solve } from "./cpmSolver";
import type { CpmResult, CriticalityBand, ScheduleNode } from "./types";

export type TaskState = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";

export interface ProgressUpdate {
  taskCode: string;
  actualStartDate?: Date;
  actualFinishDate?: Date;
  /** 0–100. Used only when remainingDurationDays is absent. */
  percentComplete?: number;
  /**
   * Working days still required. Takes precedence over percentComplete,
   * because 50% complete does not imply 50% of the duration remains (§25).
   */
  remainingDurationDays?: number;
  /** Quantity installed to date, for physical progress (§26). */
  actualQuantity?: number;
}

export interface ForecastInput {
  nodes: ScheduleNode[];
  projectStart: Date;
  calendar: WorkingCalendar;
  /** "As of" date. Unstarted work cannot be scheduled before this. */
  dataDate: Date;
  updates?: ProgressUpdate[];
  deadline?: number;
  nearCriticalThreshold?: number;
  watchThreshold?: number;
}

export interface ForecastResult {
  cpm: CpmResult;
  dataDateOffset: number;
  states: Map<string, TaskState>;
  /** Why each updated activity got the duration it did. */
  notes: Map<string, string>;
}

function cloneNodes(nodes: ScheduleNode[]): ScheduleNode[] {
  return nodes.map((n) => ({
    ...n,
    predecessors: n.predecessors.map((p) => ({ ...p })),
    constraint: n.constraint ? { ...n.constraint } : undefined,
  }));
}

/**
 * Folds progress into the network, then re-solves.
 *
 * Completed work is pinned to the dates it actually happened on. In-progress
 * work is pinned to its actual start and given its remaining duration.
 * Unstarted work is prevented from being scheduled in the past — an activity
 * that has not begun cannot start before the data date, which is the single
 * most common way a forecast silently lies about being on time.
 */
export function reforecast(input: ForecastInput): ForecastResult {
  const nodes = cloneNodes(input.nodes);
  const byCode = new Map(nodes.map((n) => [n.taskId, n]));
  const states = new Map<string, TaskState>();
  const notes = new Map<string, string>();

  const dataDateOffset = offsetOfDate(
    input.projectStart,
    input.dataDate,
    input.calendar
  );
  const offsetOf = (d: Date) =>
    offsetOfDate(input.projectStart, d, input.calendar);

  const updateByCode = new Map(
    (input.updates ?? []).map((u) => [u.taskCode, u])
  );

  for (const node of nodes) {
    const u = updateByCode.get(node.taskId);

    if (u?.actualFinishDate) {
      // Complete: the activity happened, so its dates are facts.
      const startOffset = u.actualStartDate
        ? offsetOf(u.actualStartDate)
        : Math.max(offsetOf(u.actualFinishDate) - node.durationDays, 0);
      const finishOffset = offsetOf(u.actualFinishDate);

      node.durationDays = Math.max(finishOffset - startOffset, 0);
      node.constraint = { type: "MSO", offset: startOffset };
      states.set(node.taskId, "COMPLETE");
      notes.set(
        node.taskId,
        `Complete: actual ${u.actualStartDate ? "start and " : ""}finish recorded; ` +
          `duration ${node.durationDays} working days.`
      );
      continue;
    }

    if (u?.actualStartDate) {
      // In progress: pin the start, then run to the remaining duration.
      const startOffset = offsetOf(u.actualStartDate);
      const elapsed = Math.max(dataDateOffset - startOffset, 0);

      let remaining: number;
      let basis: string;
      if (u.remainingDurationDays !== undefined) {
        remaining = Math.max(u.remainingDurationDays, 0);
        basis = `remaining duration ${remaining}d as reported`;
      } else if (u.percentComplete !== undefined) {
        remaining = Math.max(
          Math.ceil(node.durationDays * (1 - u.percentComplete / 100)),
          0
        );
        basis = `${u.percentComplete}% complete of ${node.durationDays}d`;
      } else {
        remaining = Math.max(node.durationDays - elapsed, 0);
        basis = "no progress reported; assumed on plan";
      }

      node.durationDays = elapsed + remaining;
      node.constraint = { type: "MSO", offset: startOffset };
      states.set(node.taskId, "IN_PROGRESS");
      notes.set(
        node.taskId,
        `In progress: started at offset ${startOffset}, ${elapsed}d elapsed, ` +
          `${remaining}d remaining (${basis}).`
      );
      continue;
    }

    // Not started. It cannot begin before the data date.
    states.set(node.taskId, "NOT_STARTED");
    if (dataDateOffset > 0) {
      const existing = node.constraint;
      if (!existing || existing.type === "SNET") {
        node.constraint = {
          type: "SNET",
          offset: Math.max(dataDateOffset, existing?.offset ?? 0),
        };
      }
    }
  }

  // Predecessors that are already complete must not hold successors back
  // beyond their actual finish — handled naturally, since their durations and
  // constraints now describe reality and the solver reads them like any other.
  void byCode;

  const cpm = solve(nodes, {
    deadline: input.deadline,
    nearCriticalThreshold: input.nearCriticalThreshold,
    watchThreshold: input.watchThreshold,
  });

  return { cpm, dataDateOffset, states, notes };
}

// ─── Impact analysis (§20) ────────────────────────────────────────

export interface TaskDelta {
  code: string;
  startShiftDays: number;
  finishShiftDays: number;
  floatBefore: number;
  floatAfter: number;
  bandBefore: CriticalityBand;
  bandAfter: CriticalityBand;
}

export interface ScheduleImpact {
  /** Activities whose dates or float changed. */
  deltas: TaskDelta[];
  affectedCount: number;
  criticalAffectedCount: number;
  /**
   * Change in project finish. This is frequently SMALLER than the delay
   * applied, because float absorbs part or all of it.
   */
  projectFinishShiftDays: number;
  becameCritical: string[];
  noLongerCritical: string[];
  criticalPathChanged: boolean;
  /** Activities that lost float without becoming critical. */
  floatConsumed: string[];
}

export function compareSchedules(
  before: CpmResult,
  after: CpmResult
): ScheduleImpact {
  const beforeById = new Map(before.nodes.map((n) => [n.taskId, n]));
  const deltas: TaskDelta[] = [];
  const becameCritical: string[] = [];
  const noLongerCritical: string[] = [];
  const floatConsumed: string[] = [];

  for (const a of after.nodes) {
    const b = beforeById.get(a.taskId);
    if (!b) continue;

    const startShift = a.es - b.es;
    const finishShift = a.ef - b.ef;
    const floatChanged = a.float !== b.float;

    if (startShift !== 0 || finishShift !== 0 || floatChanged) {
      deltas.push({
        code: a.taskId,
        startShiftDays: startShift,
        finishShiftDays: finishShift,
        floatBefore: b.float,
        floatAfter: a.float,
        bandBefore: b.band,
        bandAfter: a.band,
      });
    }

    if (!b.isCritical && a.isCritical) becameCritical.push(a.taskId);
    if (b.isCritical && !a.isCritical) noLongerCritical.push(a.taskId);
    if (!a.isCritical && a.float < b.float) floatConsumed.push(a.taskId);
  }

  deltas.sort((x, y) => y.finishShiftDays - x.finishShiftDays);

  return {
    deltas,
    affectedCount: deltas.length,
    criticalAffectedCount: deltas.filter(
      (d) => d.bandAfter === "CRITICAL"
    ).length,
    projectFinishShiftDays: after.projectDuration - before.projectDuration,
    becameCritical,
    noLongerCritical,
    criticalPathChanged:
      becameCritical.length > 0 || noLongerCritical.length > 0,
    floatConsumed,
  };
}

/**
 * Applies a delay to one activity and reports the true network consequences.
 * Replaces the previous approach of walking successors and adding days, which
 * could neither absorb a delay into float nor recompute the critical path.
 */
export function applyDelay(
  input: ForecastInput,
  taskCode: string,
  extraDays: number
): { before: CpmResult; after: CpmResult; impact: ScheduleImpact } {
  const before = solve(cloneNodes(input.nodes), {
    deadline: input.deadline,
    nearCriticalThreshold: input.nearCriticalThreshold,
    watchThreshold: input.watchThreshold,
  });

  const delayed = cloneNodes(input.nodes);
  const target = delayed.find((n) => n.taskId === taskCode);
  if (target) target.durationDays += extraDays;

  const after = reforecast({ ...input, nodes: delayed }).cpm;

  return { before, after, impact: compareSchedules(before, after) };
}

// ─── Physical progress (§26) ──────────────────────────────────────

export interface PhysicalProgress {
  quantity: number;
  actualQuantity: number;
  physicalPct: number;
  plannedPct: number;
  variancePct: number;
}

/**
 * Quantity-based progress, independent of elapsed duration. A task can be
 * 72% through its planned duration while only 62.5% of the work is installed.
 */
export function physicalProgress(
  quantity: number,
  actualQuantity: number,
  plannedPct: number
): PhysicalProgress {
  const physicalPct =
    quantity > 0 ? Math.min((actualQuantity / quantity) * 100, 100) : 0;
  return {
    quantity,
    actualQuantity,
    physicalPct,
    plannedPct,
    variancePct: physicalPct - plannedPct,
  };
}

/** Proportion of an activity's planned duration elapsed at the data date. */
export function plannedPercentAt(
  node: Pick<ScheduleNode, "es" | "ef" | "durationDays">,
  dataDateOffset: number
): number {
  if (node.durationDays <= 0) return dataDateOffset >= node.ef ? 100 : 0;
  if (dataDateOffset <= node.es) return 0;
  if (dataDateOffset >= node.ef) return 100;
  return ((dataDateOffset - node.es) / node.durationDays) * 100;
}
