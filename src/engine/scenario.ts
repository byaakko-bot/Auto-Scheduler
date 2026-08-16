// What-if scenarios (§21) and construction-method comparison (§36).
//
// A scenario never touches the baseline. Changes are applied to a copy of the
// network, re-solved, and reported as a diff — so "what happens if Level 3
// slips ten days" is answerable without corrupting the approved plan.

import { solve } from "./cpmSolver";
import { compareSchedules, type ScheduleImpact } from "./forecast";
import type { CpmResult, DependencyType, ScheduleNode } from "./types";

export type ScenarioChangeKind =
  | "DURATION_DELTA"
  | "DURATION_SET"
  | "LAG_SET"
  | "DEPENDENCY_TYPE"
  | "CONSTRAINT";

export interface ScenarioChange {
  kind: ScenarioChangeKind;
  taskCode: string;
  /** Predecessor code, for link changes. */
  predecessorCode?: string;
  value: number;
  dependencyType?: DependencyType;
  constraintType?: "SNET" | "FNLT" | "MSO" | "MFO";
  note?: string;
}

export interface ScenarioInput {
  nodes: ScheduleNode[];
  changes: ScenarioChange[];
  deadline?: number;
  nearCriticalThreshold?: number;
  watchThreshold?: number;
}

export interface ScenarioResult {
  baseline: CpmResult;
  scenario: CpmResult;
  impact: ScheduleImpact;
  applied: string[];
  rejected: string[];
  /** Days the scenario adds (positive) or saves (negative). */
  finishShiftDays: number;
  isFeasible: boolean;
}

function clone(nodes: ScheduleNode[]): ScheduleNode[] {
  return nodes.map((n) => ({
    ...n,
    predecessors: n.predecessors.map((p) => ({ ...p })),
    constraint: n.constraint ? { ...n.constraint } : undefined,
  }));
}

export function evaluateScenario(input: ScenarioInput): ScenarioResult {
  const opts = {
    deadline: input.deadline,
    nearCriticalThreshold: input.nearCriticalThreshold,
    watchThreshold: input.watchThreshold,
  };

  const baseline = solve(clone(input.nodes), opts);
  const trial = clone(input.nodes);
  const byCode = new Map(trial.map((n) => [n.taskId, n]));

  const applied: string[] = [];
  const rejected: string[] = [];

  for (const change of input.changes) {
    const node = byCode.get(change.taskCode);
    if (!node) {
      rejected.push(`${change.taskCode}: activity not found`);
      continue;
    }

    switch (change.kind) {
      case "DURATION_DELTA":
        node.durationDays = Math.max(0, node.durationDays + change.value);
        applied.push(
          `${change.taskCode}: duration ${change.value >= 0 ? "+" : ""}${change.value}d → ${node.durationDays}d`
        );
        break;

      case "DURATION_SET":
        node.durationDays = Math.max(0, change.value);
        applied.push(`${change.taskCode}: duration set to ${node.durationDays}d`);
        break;

      case "LAG_SET": {
        const link = node.predecessors.find(
          (p) => p.taskId === change.predecessorCode
        );
        if (!link) {
          rejected.push(
            `${change.predecessorCode} → ${change.taskCode}: link not found`
          );
          break;
        }
        link.lag = change.value;
        applied.push(
          `${change.predecessorCode} → ${change.taskCode}: lag set to ${change.value}d`
        );
        break;
      }

      case "DEPENDENCY_TYPE": {
        const link = node.predecessors.find(
          (p) => p.taskId === change.predecessorCode
        );
        if (!link || !change.dependencyType) {
          rejected.push(
            `${change.predecessorCode} → ${change.taskCode}: link or type missing`
          );
          break;
        }
        link.type = change.dependencyType;
        link.lag = change.value;
        applied.push(
          `${change.predecessorCode} → ${change.taskCode}: ${change.dependencyType}+${change.value}`
        );
        break;
      }

      case "CONSTRAINT":
        if (!change.constraintType) {
          rejected.push(`${change.taskCode}: constraint type missing`);
          break;
        }
        node.constraint = { type: change.constraintType, offset: change.value };
        applied.push(
          `${change.taskCode}: ${change.constraintType} at day ${change.value}`
        );
        break;
    }
  }

  const scenario = solve(trial, opts);

  return {
    baseline,
    scenario,
    impact: compareSchedules(baseline, scenario),
    applied,
    rejected,
    finishShiftDays: scenario.projectDuration - baseline.projectDuration,
    isFeasible: scenario.isFeasible,
  };
}

// ─── Method comparison (§36) ──────────────────────────────────────

export interface MethodComparisonRow {
  method: string;
  durationWorkingDays: number;
  finishDate?: Date;
  criticalActivityCount: number;
  isFeasible: boolean;
  /** Null when no cost model is configured (§42). */
  estimatedCost: number | null;
  deltaVsFastestDays: number;
}

export interface MethodComparison {
  rows: MethodComparisonRow[];
  fastest: string;
  slowest: string;
  spreadDays: number;
}

/**
 * Compares construction methods on the same project. Each entry must be a
 * fully generated schedule for that method — the caller runs the engine per
 * method rather than applying a fudge factor, so the comparison reflects the
 * real activity networks and productivity rates.
 */
export function compareMethods(
  entries: {
    method: string;
    result: CpmResult;
    finishDate?: Date;
    estimatedCost?: number;
  }[]
): MethodComparison {
  if (entries.length === 0) {
    return { rows: [], fastest: "", slowest: "", spreadDays: 0 };
  }

  const durations = entries.map((e) => e.result.projectDuration);
  const fastestDuration = Math.min(...durations);
  const slowestDuration = Math.max(...durations);

  const rows: MethodComparisonRow[] = entries
    .map((e) => ({
      method: e.method,
      durationWorkingDays: e.result.projectDuration,
      finishDate: e.finishDate,
      criticalActivityCount: e.result.nodes.filter((n) => n.isCritical).length,
      isFeasible: e.result.isFeasible,
      estimatedCost: e.estimatedCost ?? null,
      deltaVsFastestDays: e.result.projectDuration - fastestDuration,
    }))
    .sort((a, b) => a.durationWorkingDays - b.durationWorkingDays);

  return {
    rows,
    fastest: rows[0].method,
    slowest: rows[rows.length - 1].method,
    spreadDays: slowestDuration - fastestDuration,
  };
}
