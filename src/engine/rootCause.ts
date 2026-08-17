// Root-cause analysis — "Why are we late?" (§40).
//
// The delay is decomposed along the CURRENT critical path, because that chain
// is what determines the finish date. Each cause cites the activity and the
// baseline-versus-current figures that produced it, so nothing here is a
// narrative: every line can be checked against a stored record.
//
// Anything the decomposition cannot account for is reported as unexplained
// rather than distributed across the causes to make the arithmetic look tidy.

import type { CpmResult, ScheduleNode } from "./types";

export type DelayCauseKind =
  | "DURATION_GROWTH"
  | "LAG_INCREASE"
  | "SCOPE_ADDED"
  | "LATE_START"
  | "PROCUREMENT"
  | "PATH_REROUTED";

export interface BaselineRecord {
  code: string;
  durationDays: number;
  /** Baseline lag keyed by predecessor code. */
  lags?: Map<string, number>;
}

export interface DelayCause {
  kind: DelayCauseKind;
  taskCode: string;
  taskName?: string;
  contributionDays: number;
  /** Cites the records this figure came from. */
  evidence: string;
  baselineValue?: number;
  currentValue?: number;
}

export interface RootCauseInput {
  current: CpmResult;
  /** Baseline activity records, keyed by code. Empty means no baseline. */
  baseline: Map<string, BaselineRecord>;
  baselineDurationDays?: number;
  /** Activity codes with a late procurement package, and their impact. */
  procurementImpact?: Map<string, { material: string; impactDays: number }>;
  taskNames?: Map<string, string>;
}

export interface RootCauseAnalysis {
  hasBaseline: boolean;
  forecastDelayDays: number;
  explainedDays: number;
  unexplainedDays: number;
  causes: DelayCause[];
  criticalPath: string[];
  summary: string;
}

/** Longest chain among the enumerated critical paths. */
function drivingPath(result: CpmResult): string[] {
  if (result.criticalPaths.length === 0) {
    return result.nodes
      .filter((n) => n.isCritical)
      .sort((a, b) => a.es - b.es)
      .map((n) => n.taskId);
  }
  return result.criticalPaths.reduce((longest, p) =>
    p.length > longest.length ? p : longest
  );
}

export function analyseRootCause(input: RootCauseInput): RootCauseAnalysis {
  const path = drivingPath(input.current);
  const nameOf = (c: string) => input.taskNames?.get(c);

  if (input.baseline.size === 0) {
    return {
      hasBaseline: false,
      forecastDelayDays: 0,
      explainedDays: 0,
      unexplainedDays: 0,
      causes: [],
      criticalPath: path,
      summary:
        "No approved baseline exists, so the delay cannot be attributed. " +
        "Capture a baseline before asking why the project is late.",
    };
  }

  const baselineDuration =
    input.baselineDurationDays ??
    [...input.baseline.values()].reduce((s, b) => s + b.durationDays, 0);
  const forecastDelay = input.current.projectDuration - baselineDuration;

  const byCode = new Map(input.current.nodes.map((n) => [n.taskId, n]));
  const causes: DelayCause[] = [];

  for (const code of path) {
    const node = byCode.get(code);
    if (!node) continue;
    const base = input.baseline.get(code);

    // An activity on the critical path that was never baselined is added scope.
    if (!base) {
      if (node.durationDays > 0) {
        causes.push({
          kind: "SCOPE_ADDED",
          taskCode: code,
          taskName: nameOf(code),
          contributionDays: node.durationDays,
          evidence:
            `${code} is on the critical path but absent from the baseline; ` +
            `its full ${node.durationDays}-day duration is added scope.`,
          currentValue: node.durationDays,
        });
      }
      continue;
    }

    const growth = node.durationDays - base.durationDays;
    if (growth > 0) {
      causes.push({
        kind: "DURATION_GROWTH",
        taskCode: code,
        taskName: nameOf(code),
        contributionDays: growth,
        evidence:
          `${code} baselined at ${base.durationDays} working days, now ` +
          `${node.durationDays} — ${growth} day(s) longer.`,
        baselineValue: base.durationDays,
        currentValue: node.durationDays,
      });
    }

    // Lag growth on the links that make up the driving chain.
    for (const pred of node.predecessors) {
      if (!path.includes(pred.taskId)) continue;
      const baseLag = base.lags?.get(pred.taskId) ?? 0;
      const lagGrowth = pred.lag - baseLag;
      if (lagGrowth > 0) {
        causes.push({
          kind: "LAG_INCREASE",
          taskCode: code,
          taskName: nameOf(code),
          contributionDays: lagGrowth,
          evidence:
            `The ${pred.type} link ${pred.taskId} → ${code} carries ${pred.lag} ` +
            `days of lag against ${baseLag} at baseline.`,
          baselineValue: baseLag,
          currentValue: pred.lag,
        });
      }
    }
  }

  // Late start of the chain: the first critical activity beginning after zero
  // without an upstream cause on the path.
  const first = path[0] ? byCode.get(path[0]) : undefined;
  if (first && first.es > 0) {
    causes.push({
      kind: "LATE_START",
      taskCode: first.taskId,
      taskName: nameOf(first.taskId),
      contributionDays: first.es,
      evidence:
        `${first.taskId} opens the critical chain but does not start until day ` +
        `${first.es}, held by a constraint or a recorded actual start.`,
      currentValue: first.es,
    });
  }

  // Procurement causes are cross-referenced, not inferred: only packages that
  // the procurement engine already scored as a genuine project delay appear.
  if (input.procurementImpact) {
    for (const [code, p] of input.procurementImpact) {
      if (p.impactDays <= 0) continue;
      if (!path.includes(code)) continue;
      causes.push({
        kind: "PROCUREMENT",
        taskCode: code,
        taskName: nameOf(code),
        contributionDays: p.impactDays,
        evidence:
          `${p.material} for ${code} arrives after it is needed, costing ` +
          `${p.impactDays} day(s) after float is taken into account.`,
        currentValue: p.impactDays,
      });
    }
  }

  causes.sort((a, b) => b.contributionDays - a.contributionDays);

  const explained = causes.reduce((s, c) => s + c.contributionDays, 0);
  const unexplained = forecastDelay - explained;

  // A large unexplained remainder usually means the critical path has moved to
  // a different chain, so the comparison is not like for like. Say so.
  if (Math.abs(unexplained) > 0 && forecastDelay > 0) {
    causes.push({
      kind: "PATH_REROUTED",
      taskCode: "—",
      contributionDays: unexplained,
      evidence:
        unexplained > 0
          ? `${unexplained} day(s) are not attributable to any single activity on ` +
            `the current critical chain — the critical path has moved since the ` +
            `baseline, so part of the delay comes from a different chain becoming ` +
            `governing.`
          : `The activity-level causes total ${explained} day(s), more than the ` +
            `${forecastDelay}-day project delay, because float absorbed part of ` +
            `the slippage.`,
    });
  }

  const top = causes.filter((c) => c.kind !== "PATH_REROUTED").slice(0, 3);

  return {
    hasBaseline: true,
    forecastDelayDays: forecastDelay,
    explainedDays: explained,
    unexplainedDays: unexplained,
    causes,
    criticalPath: path,
    summary:
      forecastDelay <= 0
        ? `Project is forecast ${Math.abs(forecastDelay)} working day(s) ahead of baseline.`
        : `Forecast ${forecastDelay} working day(s) late. Principal causes: ` +
          top
            .map((c) => `${c.taskCode} (+${c.contributionDays}d)`)
            .join(", ") +
          (top.length === 0 ? "none attributable at activity level." : "."),
  };
}

/**
 * Detects activities that started before a predecessor finished — the usual
 * sign that either the logic is wrong or work is happening out of sequence.
 */
export function findOutOfSequence(
  nodes: ScheduleNode[],
  actualStarts: Map<string, number>,
  actualFinishes: Map<string, number>
): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    const start = actualStarts.get(n.taskId);
    if (start === undefined) continue;
    for (const p of n.predecessors) {
      if (p.type !== "FS") continue;
      const predFinish = actualFinishes.get(p.taskId);
      if (predFinish !== undefined && start < predFinish) {
        out.push(n.taskId);
        break;
      }
    }
  }
  return out;
}
