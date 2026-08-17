// Schedule quality checks and score (§29, §30).
//
// Every finding names the activities responsible, so the report is actionable
// rather than a count. The score is built from weighted deductions and each
// category reports exactly which findings cost it points — "87/100" is only
// useful if you can see the 13.

import { CircularDependencyError, solve } from "./cpmSolver";
import type { ScheduleNode } from "./types";

export type HealthSeverity = "CRITICAL" | "WARNING" | "INFO";

export type HealthCategory =
  | "LOGIC"
  | "COMPLETENESS"
  | "CONSTRAINTS"
  | "RESOURCES"
  | "PROCUREMENT"
  | "CALENDAR"
  | "BASELINE";

export interface HealthFinding {
  check: string;
  category: HealthCategory;
  severity: HealthSeverity;
  message: string;
  /** Activities responsible, so the finding can be acted on. */
  taskCodes: string[];
  /** Points deducted from the category. */
  penalty: number;
}

export interface HealthThresholds {
  /** Lag beyond which a link is flagged as excessive. */
  maxLagDays: number;
  /** Duration beyond which an activity is flagged as too coarse. */
  maxDurationDays: number;
  /** Hard constraints tolerated before flagging over-constraint. */
  maxHardConstraints: number;
}

export const DEFAULT_THRESHOLDS: HealthThresholds = {
  maxLagDays: 20,
  maxDurationDays: 120,
  maxHardConstraints: 3,
};

export interface HealthInput {
  nodes: ScheduleNode[];
  /** Activity codes carrying at least one RACI assignment. */
  withResponsibility?: Set<string>;
  /** Activity codes consuming a procurement package that arrives late. */
  lateProcurement?: Map<string, number>;
  /** Number of unresolved resource conflicts. */
  resourceConflicts?: number;
  /** Whether an approved baseline exists. */
  hasApprovedBaseline?: boolean;
  /** Activities whose actual start precedes a predecessor's finish. */
  outOfSequence?: string[];
  thresholds?: Partial<HealthThresholds>;
}

export interface CategoryScore {
  category: HealthCategory;
  score: number;
  maxScore: number;
  findings: HealthFinding[];
}

export interface HealthReport {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  activitiesValidated: number;
  activitiesTotal: number;
  validatedPct: number;
  categories: CategoryScore[];
  findings: HealthFinding[];
}

// Category weights sum to 100.
const CATEGORY_WEIGHTS: Record<HealthCategory, number> = {
  LOGIC: 30,
  COMPLETENESS: 20,
  CONSTRAINTS: 15,
  RESOURCES: 10,
  PROCUREMENT: 10,
  CALENDAR: 5,
  BASELINE: 10,
};

export function analyseScheduleHealth(input: HealthInput): HealthReport {
  const t = { ...DEFAULT_THRESHOLDS, ...input.thresholds };
  const nodes = input.nodes;
  const findings: HealthFinding[] = [];
  const flagged = new Set<string>();

  const add = (f: HealthFinding) => {
    findings.push(f);
    for (const c of f.taskCodes) flagged.add(c);
  };

  const byCode = new Map(nodes.map((n) => [n.taskId, n]));
  const successorsOf = new Map<string, string[]>();
  for (const n of nodes) successorsOf.set(n.taskId, []);
  for (const n of nodes) {
    for (const p of n.predecessors) {
      successorsOf.get(p.taskId)?.push(n.taskId);
    }
  }

  // ── LOGIC ───────────────────────────────────────────────────────

  // Circular dependencies make every other check meaningless, so run first.
  let solved: ReturnType<typeof solve> | null = null;
  try {
    solved = solve(nodes.map((n) => ({ ...n, predecessors: [...n.predecessors] })));
  } catch (err) {
    if (err instanceof CircularDependencyError) {
      add({
        check: "circular-dependencies",
        category: "LOGIC",
        severity: "CRITICAL",
        message: `Dependency cycle detected: ${err.cycles
          .slice(0, 3)
          .map((c) => c.join(" → "))
          .join("; ")}. No valid schedule exists until this is broken.`,
        taskCodes: err.cycles.flat().slice(0, 20),
        penalty: 30,
      });
    } else {
      throw err;
    }
  }

  const duplicates = new Map<string, number>();
  for (const n of nodes) {
    duplicates.set(n.taskId, (duplicates.get(n.taskId) ?? 0) + 1);
  }
  const dupCodes = [...duplicates.entries()].filter(([, c]) => c > 1).map(([c]) => c);
  if (dupCodes.length > 0) {
    add({
      check: "duplicate-activities",
      category: "LOGIC",
      severity: "CRITICAL",
      message: `${dupCodes.length} duplicate activity code(s).`,
      taskCodes: dupCodes,
      penalty: 10,
    });
  }

  const danglingPreds = nodes
    .filter((n) => n.predecessors.length === 0)
    .map((n) => n.taskId);
  if (danglingPreds.length > 1) {
    add({
      check: "missing-predecessors",
      category: "LOGIC",
      severity: "WARNING",
      message:
        `${danglingPreds.length} activities have no predecessor. Only the project ` +
        `start should be open-ended; the rest float free of the network.`,
      taskCodes: danglingPreds,
      penalty: Math.min(danglingPreds.length * 2, 12),
    });
  }

  const danglingSuccs = nodes
    .filter((n) => (successorsOf.get(n.taskId) ?? []).length === 0)
    .map((n) => n.taskId);
  if (danglingSuccs.length > 1) {
    add({
      check: "missing-successors",
      category: "LOGIC",
      severity: "WARNING",
      message:
        `${danglingSuccs.length} activities have no successor. Their finish drives ` +
        `nothing, so delays to them are invisible to the critical path.`,
      taskCodes: danglingSuccs,
      penalty: Math.min(danglingSuccs.length * 2, 12),
    });
  }

  const brokenLinks: string[] = [];
  for (const n of nodes) {
    for (const p of n.predecessors) {
      if (!byCode.has(p.taskId)) brokenLinks.push(`${p.taskId}→${n.taskId}`);
    }
  }
  if (brokenLinks.length > 0) {
    add({
      check: "broken-links",
      category: "LOGIC",
      severity: "CRITICAL",
      message: `${brokenLinks.length} dependency link(s) reference a missing activity.`,
      taskCodes: brokenLinks,
      penalty: 10,
    });
  }

  // ── COMPLETENESS ────────────────────────────────────────────────

  const zeroDuration = nodes
    .filter((n) => n.durationDays === 0)
    .map((n) => n.taskId);
  // Milestones are legitimately zero-duration; more than a handful is not.
  if (zeroDuration.length > nodes.length * 0.25) {
    add({
      check: "zero-duration-activities",
      category: "COMPLETENESS",
      severity: "WARNING",
      message: `${zeroDuration.length} of ${nodes.length} activities have zero duration.`,
      taskCodes: zeroDuration.slice(0, 20),
      penalty: 6,
    });
  }

  const tooLong = nodes
    .filter((n) => n.durationDays > t.maxDurationDays)
    .map((n) => n.taskId);
  if (tooLong.length > 0) {
    add({
      check: "excessive-duration",
      category: "COMPLETENESS",
      severity: "WARNING",
      message:
        `${tooLong.length} activity(ies) exceed ${t.maxDurationDays} working days. ` +
        `Activities this coarse cannot be progressed or resourced meaningfully.`,
      taskCodes: tooLong,
      penalty: Math.min(tooLong.length * 3, 10),
    });
  }

  if (input.withResponsibility) {
    const noOwner = nodes
      .filter((n) => n.durationDays > 0 && !input.withResponsibility!.has(n.taskId))
      .map((n) => n.taskId);
    if (noOwner.length > 0) {
      add({
        check: "missing-responsibility",
        category: "COMPLETENESS",
        severity: "WARNING",
        message: `${noOwner.length} activity(ies) have no RACI assignment.`,
        taskCodes: noOwner.slice(0, 20),
        penalty: Math.min(noOwner.length, 10),
      });
    }
  }

  // ── CONSTRAINTS ─────────────────────────────────────────────────

  const hardConstraints = nodes
    .filter((n) => n.constraint?.type === "MSO" || n.constraint?.type === "MFO")
    .map((n) => n.taskId);
  if (hardConstraints.length > t.maxHardConstraints) {
    add({
      check: "excessive-constraints",
      category: "CONSTRAINTS",
      severity: "WARNING",
      message:
        `${hardConstraints.length} hard constraints (Must Start/Finish On). ` +
        `These override network logic and mask real float.`,
      taskCodes: hardConstraints,
      penalty: Math.min((hardConstraints.length - t.maxHardConstraints) * 3, 10),
    });
  }

  const bigLags: string[] = [];
  for (const n of nodes) {
    for (const p of n.predecessors) {
      if (p.lag > t.maxLagDays) bigLags.push(`${p.taskId}→${n.taskId}`);
    }
  }
  if (bigLags.length > 0) {
    add({
      check: "excessive-lag",
      category: "CONSTRAINTS",
      severity: "WARNING",
      message:
        `${bigLags.length} link(s) carry more than ${t.maxLagDays} days of lag. ` +
        `Long lags usually hide an unmodelled activity.`,
      taskCodes: bigLags,
      penalty: Math.min(bigLags.length * 2, 8),
    });
  }

  const negativeLags: string[] = [];
  for (const n of nodes) {
    for (const p of n.predecessors) {
      if (p.lag < 0) negativeLags.push(`${p.taskId}→${n.taskId}`);
    }
  }
  if (negativeLags.length > 0) {
    add({
      check: "negative-lag",
      category: "CONSTRAINTS",
      severity: "WARNING",
      message:
        `${negativeLags.length} link(s) use negative lag, which lets a successor ` +
        `start before its predecessor logically allows.`,
      taskCodes: negativeLags,
      penalty: Math.min(negativeLags.length * 2, 6),
    });
  }

  if (solved) {
    const negativeFloat = solved.nodes
      .filter((n) => n.float < 0)
      .map((n) => n.taskId);
    if (negativeFloat.length > 0) {
      add({
        check: "negative-float",
        category: "CONSTRAINTS",
        severity: "CRITICAL",
        message:
          `${negativeFloat.length} activity(ies) carry negative float — the schedule ` +
          `cannot meet its constraints as sequenced.`,
        taskCodes: negativeFloat.slice(0, 20),
        penalty: 12,
      });
    }
  }

  // ── RESOURCES ───────────────────────────────────────────────────

  if (input.resourceConflicts && input.resourceConflicts > 0) {
    add({
      check: "resource-conflicts",
      category: "RESOURCES",
      severity: "WARNING",
      message: `${input.resourceConflicts} unresolved resource over-allocation(s).`,
      taskCodes: [],
      penalty: Math.min(input.resourceConflicts * 3, 10),
    });
  }

  if (input.outOfSequence && input.outOfSequence.length > 0) {
    add({
      check: "out-of-sequence-progress",
      category: "LOGIC",
      severity: "WARNING",
      message:
        `${input.outOfSequence.length} activity(ies) started before a predecessor ` +
        `finished. Either the logic is wrong or the work is being done out of sequence.`,
      taskCodes: input.outOfSequence,
      penalty: Math.min(input.outOfSequence.length * 2, 8),
    });
  }

  // ── PROCUREMENT ─────────────────────────────────────────────────

  if (input.lateProcurement && input.lateProcurement.size > 0) {
    const codes = [...input.lateProcurement.keys()];
    const worst = Math.max(...input.lateProcurement.values());
    add({
      check: "procurement-after-need-date",
      category: "PROCUREMENT",
      severity: worst > 0 ? "CRITICAL" : "WARNING",
      message:
        `${codes.length} activity(ies) depend on material arriving after it is ` +
        `needed; worst case ${worst} day(s) of project impact.`,
      taskCodes: codes,
      penalty: Math.min(codes.length * 4, 10),
    });
  }

  // ── BASELINE ────────────────────────────────────────────────────

  if (input.hasApprovedBaseline === false) {
    add({
      check: "no-approved-baseline",
      category: "BASELINE",
      severity: "WARNING",
      message:
        "No approved baseline. Variance cannot be measured and delays cannot be attributed.",
      taskCodes: [],
      penalty: 10,
    });
  }

  // ── Scoring ─────────────────────────────────────────────────────

  const categories: CategoryScore[] = (
    Object.keys(CATEGORY_WEIGHTS) as HealthCategory[]
  ).map((category) => {
    const catFindings = findings.filter((f) => f.category === category);
    const penalty = catFindings.reduce((s, f) => s + f.penalty, 0);
    const max = CATEGORY_WEIGHTS[category];
    return {
      category,
      score: Math.max(0, max - penalty),
      maxScore: max,
      findings: catFindings,
    };
  });

  const score = Math.round(categories.reduce((s, c) => s + c.score, 0));
  const grade =
    score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";

  const validated = nodes.filter((n) => !flagged.has(n.taskId)).length;

  return {
    score,
    grade,
    criticalCount: findings.filter((f) => f.severity === "CRITICAL").length,
    warningCount: findings.filter((f) => f.severity === "WARNING").length,
    infoCount: findings.filter((f) => f.severity === "INFO").length,
    activitiesValidated: validated,
    activitiesTotal: nodes.length,
    validatedPct: nodes.length > 0 ? (validated / nodes.length) * 100 : 100,
    categories,
    findings: findings.sort((a, b) => b.penalty - a.penalty),
  };
}
