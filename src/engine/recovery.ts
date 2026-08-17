// Recovery planning (§22, §41).
//
// Every option here is measured, not estimated: the lever is applied to a copy
// of the real network, CPM is re-solved, and the recovery reported is the
// actual movement of the project finish. That matters because shortening a
// critical activity usually does not buy its full duration — the critical path
// moves to the next-longest chain and the remaining saving evaporates.
//
// Options are only generated where the underlying data supports them (§41):
// crews are only added where a productivity rate exists, lag is only removed
// where a lag actually sits on the critical path, and cost is only reported
// where a rate is configured — never invented (§42).

import { solve } from "./cpmSolver";
import type { CpmResult, ScheduleNode } from "./types";

export type RecoveryStrategy =
  | "ADD_CREW"
  | "OVERTIME"
  | "FAST_TRACK"
  | "REDUCE_LAG";

export type RecoveryRisk = "LOW" | "MEDIUM" | "HIGH";

export interface ScalableActivity {
  /** Crews currently assigned. */
  crews: number;
  quantity: number;
  /** Output of one crew per working day. */
  outputPerCrewDay: number;
  /** Rate code, for traceability. */
  rateCode: string;
  /**
   * Irreducible duration for cycle-governed work (e.g. a floor-by-floor
   * frame whose curing no crew count compresses). Recovery must respect it,
   * or it would promise savings the generator refuses to deliver.
   */
  minDays?: number;
}

export interface RecoveryInput {
  nodes: ScheduleNode[];
  /** Activities whose duration is quantity-driven and can absorb more crews. */
  scalable: Map<string, ScalableActivity>;
  deadline?: number;
  nearCriticalThreshold?: number;
  watchThreshold?: number;
  /** Cost per crew per working day. Omit to report costs as unknown. */
  crewCostPerDay?: number;
  currency?: string;
  /** Maximum crews that may be assigned to any one activity. */
  maxCrewsPerActivity?: number;
  /** Overtime output uplift, e.g. 1.25 for 10-hour days. */
  overtimeFactor?: number;
  /** Overtime cost premium as a multiple of normal crew cost. */
  overtimePremium?: number;
}

export interface RecoveryOption {
  id: string;
  strategy: RecoveryStrategy;
  title: string;
  description: string;
  targetActivities: string[];
  /** Working days recovered, measured by re-solving. */
  recoveryDays: number;
  /** Null when no cost rate is configured — never a fabricated figure. */
  additionalCost: number | null;
  currency?: string;
  costBasis: string | null;
  risk: RecoveryRisk;
  riskNote: string;
}

export interface RecoveryPlan {
  baselineDurationDays: number;
  targetRecoveryDays: number | null;
  options: RecoveryOption[];
  /** Best single option, if any recovers time. */
  bestOption: RecoveryOption | null;
  /** True when no single lever closes the gap. */
  requiresCombination: boolean;
  notes: string[];
}

function clone(nodes: ScheduleNode[]): ScheduleNode[] {
  return nodes.map((n) => ({
    ...n,
    predecessors: n.predecessors.map((p) => ({ ...p })),
    constraint: n.constraint ? { ...n.constraint } : undefined,
  }));
}

function durationFor(a: ScalableActivity, crews: number): number {
  const output = a.outputPerCrewDay * Math.max(crews, 1);
  const fromCapacity = output > 0 ? Math.ceil(a.quantity / output) : 1;
  return Math.max(1, fromCapacity, a.minDays ?? 0);
}

export function generateRecoveryPlan(
  input: RecoveryInput,
  targetRecoveryDays?: number
): RecoveryPlan {
  const solveOpts = {
    deadline: input.deadline,
    nearCriticalThreshold: input.nearCriticalThreshold,
    watchThreshold: input.watchThreshold,
  };

  const baseline: CpmResult = solve(clone(input.nodes), solveOpts);
  const baselineDuration = baseline.projectDuration;
  const criticalCodes = new Set(
    baseline.nodes.filter((n) => n.isCritical).map((n) => n.taskId)
  );

  const options: RecoveryOption[] = [];
  const notes: string[] = [];
  const maxCrews = input.maxCrewsPerActivity ?? 6;

  // ── Add crews to critical, quantity-driven activities ──────────
  for (const [code, activity] of input.scalable) {
    if (!criticalCodes.has(code)) continue;

    for (const extra of [1, 2]) {
      const crews = activity.crews + extra;
      if (crews > maxCrews) continue;

      const newDuration = durationFor(activity, crews);
      const saved = durationFor(activity, activity.crews) - newDuration;
      if (saved <= 0) {
        if (activity.minDays && newDuration <= activity.minDays) {
          notes.push(
            `Adding crews to ${code} recovers nothing: it is already at its ` +
              `${activity.minDays}-day cycle floor, which curing and floor-by-floor ` +
              `sequencing prevent any crew count from breaching.`
          );
        }
        continue;
      }

      const trial = clone(input.nodes);
      const node = trial.find((n) => n.taskId === code);
      if (!node) continue;
      node.durationDays = newDuration;

      const result = solve(trial, solveOpts);
      const recoveryDays = baselineDuration - result.projectDuration;
      if (recoveryDays <= 0) {
        notes.push(
          `Adding ${extra} crew(s) to ${code} shortens it by ${saved} day(s) but ` +
            `recovers no project time — another chain becomes critical first.`
        );
        continue;
      }

      const cost =
        input.crewCostPerDay !== undefined
          ? Math.round(input.crewCostPerDay * extra * newDuration)
          : null;

      options.push({
        id: `ADD_CREW:${code}:${extra}`,
        strategy: "ADD_CREW",
        title: `Add ${extra} crew${extra > 1 ? "s" : ""} to ${code}`,
        description:
          `${code} runs ${activity.quantity} units at ${activity.outputPerCrewDay}/crew-day. ` +
          `Going from ${activity.crews} to ${crews} crews shortens it from ` +
          `${durationFor(activity, activity.crews)} to ${newDuration} working days.`,
        targetActivities: [code],
        recoveryDays,
        additionalCost: cost,
        currency: input.currency,
        costBasis:
          cost !== null
            ? `${extra} extra crew(s) × ${newDuration} days × ${input.crewCostPerDay}/crew-day`
            : "No crew cost rate configured",
        risk: extra === 1 ? "LOW" : "MEDIUM",
        riskNote:
          extra === 1
            ? "Single additional crew; limited congestion risk."
            : "Multiple crews in the same area risk workface congestion and lower output than assumed.",
      });
    }
  }

  // ── Overtime on critical quantity-driven activities ────────────
  const overtimeFactor = input.overtimeFactor ?? 1.25;
  const overtimeTargets = [...input.scalable.entries()].filter(([code]) =>
    criticalCodes.has(code)
  );

  if (overtimeTargets.length > 0 && overtimeFactor > 1) {
    const trial = clone(input.nodes);
    let totalCrewDays = 0;
    const touched: string[] = [];

    for (const [code, activity] of overtimeTargets) {
      const node = trial.find((n) => n.taskId === code);
      if (!node) continue;
      // Longer shifts raise output but cannot breach a cycle floor either:
      // concrete cures at the same rate at 10pm as at 3pm.
      const uplifted = Math.max(
        1,
        Math.ceil(
          activity.quantity /
            (activity.outputPerCrewDay * activity.crews * overtimeFactor)
        ),
        activity.minDays ?? 0
      );
      if (uplifted < node.durationDays) {
        totalCrewDays += uplifted * activity.crews;
        node.durationDays = uplifted;
        touched.push(code);
      }
    }

    if (touched.length > 0) {
      const result = solve(trial, solveOpts);
      const recoveryDays = baselineDuration - result.projectDuration;
      if (recoveryDays > 0) {
        const premium = input.overtimePremium ?? 0.5;
        const cost =
          input.crewCostPerDay !== undefined
            ? Math.round(input.crewCostPerDay * premium * totalCrewDays)
            : null;

        options.push({
          id: "OVERTIME",
          strategy: "OVERTIME",
          title: `Extended hours on ${touched.length} critical activities`,
          description:
            `Raising daily output by ${Math.round((overtimeFactor - 1) * 100)}% ` +
            `through extended shifts on ${touched.join(", ")}.`,
          targetActivities: touched,
          recoveryDays,
          additionalCost: cost,
          currency: input.currency,
          costBasis:
            cost !== null
              ? `${totalCrewDays} crew-days at a ${Math.round(premium * 100)}% premium`
              : "No crew cost rate configured",
          risk: "MEDIUM",
          riskNote:
            "Sustained overtime reduces productivity and raises defect rates; output uplift is optimistic beyond a few weeks.",
        });
      }
    }
  }

  // ── Remove lag from critical links ─────────────────────────────
  for (const node of input.nodes) {
    if (!criticalCodes.has(node.taskId)) continue;
    for (const pred of node.predecessors) {
      if (pred.lag <= 0 || !criticalCodes.has(pred.taskId)) continue;

      const trial = clone(input.nodes);
      const t = trial.find((n) => n.taskId === node.taskId)!;
      const link = t.predecessors.find((p) => p.taskId === pred.taskId)!;
      link.lag = 0;

      const result = solve(trial, solveOpts);
      const recoveryDays = baselineDuration - result.projectDuration;
      if (recoveryDays <= 0) continue;

      options.push({
        id: `REDUCE_LAG:${pred.taskId}->${node.taskId}`,
        strategy: "REDUCE_LAG",
        title: `Remove ${pred.lag}-day lag between ${pred.taskId} and ${node.taskId}`,
        description:
          `The ${pred.type} link carries a ${pred.lag}-day lag on the critical path. ` +
          `Compressing it recovers time at no direct cost.`,
        targetActivities: [pred.taskId, node.taskId],
        recoveryDays,
        additionalCost: 0,
        currency: input.currency,
        costBasis: "No direct cost — sequencing change only",
        risk: "MEDIUM",
        riskNote:
          "Lags usually represent curing, drying or inspection time. Confirm the technical reason before compressing.",
      });
    }
  }

  // ── Fast-track: overlap critical finish-to-start links ─────────
  for (const node of input.nodes) {
    if (!criticalCodes.has(node.taskId)) continue;
    for (const pred of node.predecessors) {
      if (pred.type !== "FS" || pred.lag !== 0) continue;
      if (!criticalCodes.has(pred.taskId)) continue;

      const predNode = input.nodes.find((n) => n.taskId === pred.taskId);
      if (!predNode || predNode.durationDays < 4) continue;

      // Start the successor when the predecessor is half done.
      const overlap = Math.floor(predNode.durationDays / 2);

      const trial = clone(input.nodes);
      const t = trial.find((n) => n.taskId === node.taskId)!;
      const link = t.predecessors.find((p) => p.taskId === pred.taskId)!;
      link.type = "SS";
      link.lag = overlap;

      const result = solve(trial, solveOpts);
      const recoveryDays = baselineDuration - result.projectDuration;
      if (recoveryDays <= 0) continue;

      options.push({
        id: `FAST_TRACK:${pred.taskId}->${node.taskId}`,
        strategy: "FAST_TRACK",
        title: `Overlap ${node.taskId} with ${pred.taskId}`,
        description:
          `Convert the finish-to-start link into a start-to-start with a ` +
          `${overlap}-day lag, so ${node.taskId} begins once ${pred.taskId} is ` +
          `about half complete.`,
        targetActivities: [pred.taskId, node.taskId],
        recoveryDays,
        additionalCost: 0,
        currency: input.currency,
        costBasis: "No direct cost — sequencing change only",
        risk: "HIGH",
        riskNote:
          "Overlapping trades in the same area raises rework risk and can reduce output for both. Verify the workface genuinely supports it.",
      });
    }
  }

  options.sort((a, b) => {
    if (b.recoveryDays !== a.recoveryDays) return b.recoveryDays - a.recoveryDays;
    const ac = a.additionalCost ?? Number.MAX_SAFE_INTEGER;
    const bc = b.additionalCost ?? Number.MAX_SAFE_INTEGER;
    return ac - bc;
  });

  if (input.crewCostPerDay === undefined && options.length > 0) {
    notes.push(
      "Crew cost rate not configured — cost columns are reported as unknown rather than estimated."
    );
  }

  const best = options[0] ?? null;
  const target = targetRecoveryDays ?? null;

  return {
    baselineDurationDays: baselineDuration,
    targetRecoveryDays: target,
    options,
    bestOption: best,
    requiresCombination:
      target !== null && (best?.recoveryDays ?? 0) < target,
    notes,
  };
}
