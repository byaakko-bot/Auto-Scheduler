import { describe, expect, it } from "vitest";
import { solve } from "../cpmSolver";
import { analyseScheduleHealth } from "../scheduleHealth";
import { analyseRootCause, findOutOfSequence, type BaselineRecord } from "../rootCause";
import type { DependencyType, ScheduleNode } from "../types";

function node(
  id: string,
  dur: number,
  preds: { taskId: string; type: DependencyType; lag: number }[] = [],
  constraint?: ScheduleNode["constraint"]
): ScheduleNode {
  return {
    taskId: id,
    durationDays: dur,
    predecessors: preds,
    constraint,
    es: 0,
    ef: 0,
    ls: 0,
    lf: 0,
    float: 0,
    freeFloat: 0,
    isCritical: false,
    band: "NORMAL",
  };
}
const fs = (id: string, lag = 0) => ({
  taskId: id,
  type: "FS" as DependencyType,
  lag,
});

/** A clean 3-activity chain: no findings expected. */
function healthy(): ScheduleNode[] {
  return [node("A", 10), node("B", 20, [fs("A")]), node("C", 5, [fs("B")])];
}

describe("§29 — schedule quality checks", () => {
  it("gives a clean chain a high score with no critical findings", () => {
    const r = analyseScheduleHealth({ nodes: healthy(), hasApprovedBaseline: true });
    expect(r.criticalCount).toBe(0);
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.grade).toBe("A");
  });

  it("detects a dependency cycle and refuses to grade around it", () => {
    const nodes = [node("A", 5, [fs("B")]), node("B", 5, [fs("A")])];
    const r = analyseScheduleHealth({ nodes, hasApprovedBaseline: true });
    const cycle = r.findings.find((f) => f.check === "circular-dependencies")!;
    expect(cycle).toBeDefined();
    expect(cycle.severity).toBe("CRITICAL");
    expect(cycle.taskCodes).toContain("A");
    expect(r.score).toBeLessThan(80);
  });

  it("flags dangling activities with no successor", () => {
    const nodes = [
      node("A", 10),
      node("B", 5, [fs("A")]),
      node("ORPHAN1", 5, [fs("A")]),
      node("ORPHAN2", 5, [fs("A")]),
    ];
    const r = analyseScheduleHealth({ nodes, hasApprovedBaseline: true });
    const f = r.findings.find((x) => x.check === "missing-successors")!;
    expect(f).toBeDefined();
    expect(f.taskCodes).toContain("ORPHAN1");
  });

  it("flags several open-ended starts", () => {
    const nodes = [node("A", 5), node("B", 5), node("C", 5)];
    const r = analyseScheduleHealth({ nodes, hasApprovedBaseline: true });
    expect(r.findings.some((f) => f.check === "missing-predecessors")).toBe(true);
  });

  it("flags excessive lag as a hidden activity", () => {
    const nodes = [node("A", 10), node("B", 10, [fs("A", 45)])];
    const r = analyseScheduleHealth({ nodes, hasApprovedBaseline: true });
    const f = r.findings.find((x) => x.check === "excessive-lag")!;
    expect(f).toBeDefined();
    expect(f.message).toContain("hide an unmodelled activity");
  });

  it("flags negative float as critical", () => {
    const nodes = [
      node("A", 30),
      node("B", 30, [fs("A")], { type: "FNLT", offset: 40 }),
    ];
    const r = analyseScheduleHealth({ nodes, hasApprovedBaseline: true });
    const f = r.findings.find((x) => x.check === "negative-float")!;
    expect(f.severity).toBe("CRITICAL");
  });

  it("flags over-constraint", () => {
    const nodes = Array.from({ length: 6 }, (_, i) =>
      node(`T${i}`, 5, i === 0 ? [] : [fs(`T${i - 1}`)], {
        type: "MSO",
        offset: i * 5,
      })
    );
    const r = analyseScheduleHealth({ nodes, hasApprovedBaseline: true });
    expect(r.findings.some((f) => f.check === "excessive-constraints")).toBe(true);
  });

  it("flags activities without a responsible party", () => {
    const r = analyseScheduleHealth({
      nodes: healthy(),
      withResponsibility: new Set(["A"]),
      hasApprovedBaseline: true,
    });
    const f = r.findings.find((x) => x.check === "missing-responsibility")!;
    expect(f.taskCodes).toContain("B");
    expect(f.taskCodes).not.toContain("A");
  });

  it("flags a missing baseline", () => {
    const r = analyseScheduleHealth({
      nodes: healthy(),
      hasApprovedBaseline: false,
    });
    const f = r.findings.find((x) => x.check === "no-approved-baseline")!;
    expect(f).toBeDefined();
    expect(r.categories.find((c) => c.category === "BASELINE")!.score).toBe(0);
  });

  it("flags late procurement against the activity that needs it", () => {
    const r = analyseScheduleHealth({
      nodes: healthy(),
      hasApprovedBaseline: true,
      lateProcurement: new Map([["B", 6]]),
    });
    const f = r.findings.find((x) => x.check === "procurement-after-need-date")!;
    expect(f.taskCodes).toContain("B");
    expect(f.severity).toBe("CRITICAL");
  });
});

describe("§30 — schedule quality score", () => {
  it("explains where every deducted point went", () => {
    const nodes = [node("A", 10), node("B", 10, [fs("A", 45)])];
    const r = analyseScheduleHealth({ nodes, hasApprovedBaseline: false });

    const totalPenalty = r.findings.reduce((s, f) => s + f.penalty, 0);
    const totalScore = r.categories.reduce((s, c) => s + c.score, 0);
    const totalMax = r.categories.reduce((s, c) => s + c.maxScore, 0);

    expect(totalMax).toBe(100);
    expect(totalScore).toBeLessThan(100);
    expect(totalPenalty).toBeGreaterThan(0);
    // Every category reports the findings that cost it points.
    for (const c of r.categories) {
      const catPenalty = c.findings.reduce((s, f) => s + f.penalty, 0);
      expect(c.score).toBe(Math.max(0, c.maxScore - catPenalty));
    }
  });

  it("never scores a category below zero", () => {
    const nodes = Array.from({ length: 20 }, (_, i) => node(`T${i}`, 300));
    const r = analyseScheduleHealth({ nodes, hasApprovedBaseline: false });
    for (const c of r.categories) expect(c.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it("reports how many activities passed every check", () => {
    const r = analyseScheduleHealth({ nodes: healthy(), hasApprovedBaseline: true });
    expect(r.activitiesTotal).toBe(3);
    expect(r.validatedPct).toBe(100);
  });
});

describe("§40 — why are we late", () => {
  const baseline = new Map<string, BaselineRecord>([
    ["A", { code: "A", durationDays: 10 }],
    ["B", { code: "B", durationDays: 20 }],
    ["C", { code: "C", durationDays: 5 }],
  ]);

  it("refuses to attribute delay without a baseline", () => {
    const r = analyseRootCause({
      current: solve(healthy()),
      baseline: new Map(),
    });
    expect(r.hasBaseline).toBe(false);
    expect(r.causes).toHaveLength(0);
    expect(r.summary).toContain("Capture a baseline");
  });

  it("attributes a delay to the activity that grew", () => {
    const nodes = [node("A", 10), node("B", 32, [fs("A")]), node("C", 5, [fs("B")])];
    const r = analyseRootCause({
      current: solve(nodes),
      baseline,
      baselineDurationDays: 35,
    });
    expect(r.forecastDelayDays).toBe(12);
    const growth = r.causes.find((c) => c.kind === "DURATION_GROWTH")!;
    expect(growth.taskCode).toBe("B");
    expect(growth.contributionDays).toBe(12);
    expect(growth.evidence).toContain("baselined at 20");
  });

  it("cites lag growth on the driving chain", () => {
    const withLag = new Map(baseline);
    withLag.set("B", { code: "B", durationDays: 20, lags: new Map([["A", 0]]) });
    const nodes = [node("A", 10), node("B", 20, [fs("A", 7)]), node("C", 5, [fs("B")])];
    const r = analyseRootCause({
      current: solve(nodes),
      baseline: withLag,
      baselineDurationDays: 35,
    });
    const lag = r.causes.find((c) => c.kind === "LAG_INCREASE")!;
    expect(lag.contributionDays).toBe(7);
    expect(lag.evidence).toContain("7 days of lag against 0");
  });

  it("does not report lag growth when the baseline recorded no lag data", () => {
    // The baseline snapshot stores durations but not link lags. Treating that
    // absence as "baseline lag was 0" would report every legitimate template
    // lag as a regression.
    const nodes = [
      node("A", 10),
      node("B", 20, [fs("A", 10)]),
      node("C", 5, [fs("B", 3)]),
    ];
    const r = analyseRootCause({
      current: solve(nodes),
      baseline, // no `lags` on any record
      baselineDurationDays: 35,
    });
    expect(r.causes.filter((c) => c.kind === "LAG_INCREASE")).toHaveLength(0);
  });

  it("treats an unbaselined critical activity as added scope", () => {
    const nodes = [
      node("A", 10),
      node("B", 20, [fs("A")]),
      node("NEW", 8, [fs("B")]),
      node("C", 5, [fs("NEW")]),
    ];
    const r = analyseRootCause({
      current: solve(nodes),
      baseline,
      baselineDurationDays: 35,
    });
    const added = r.causes.find((c) => c.kind === "SCOPE_ADDED")!;
    expect(added.taskCode).toBe("NEW");
    expect(added.contributionDays).toBe(8);
  });

  it("reports unexplained days rather than padding the causes", () => {
    // A parallel chain becomes governing; the old chain is unchanged.
    const nodes = [
      node("A", 10),
      node("B", 20, [fs("A")]),
      node("C", 5, [fs("B")]),
      node("OTHER", 60),
    ];
    const r = analyseRootCause({
      current: solve(nodes),
      baseline,
      baselineDurationDays: 35,
    });
    expect(r.forecastDelayDays).toBe(25);
    const rerouted = r.causes.find((c) => c.kind === "PATH_REROUTED");
    expect(rerouted).toBeDefined();
    expect(r.explainedDays + r.unexplainedDays).toBe(r.forecastDelayDays);
  });

  it("only cites procurement the procurement engine already scored", () => {
    const nodes = [node("A", 10), node("B", 26, [fs("A")]), node("C", 5, [fs("B")])];
    const r = analyseRootCause({
      current: solve(nodes),
      baseline,
      baselineDurationDays: 35,
      procurementImpact: new Map([
        ["B", { material: "AAC panels", impactDays: 4 }],
        ["OFFPATH", { material: "Paint", impactDays: 9 }],
      ]),
    });
    const proc = r.causes.filter((c) => c.kind === "PROCUREMENT");
    expect(proc).toHaveLength(1);
    expect(proc[0].taskCode).toBe("B");
  });

  it("reports being ahead of baseline without inventing causes", () => {
    const nodes = [node("A", 10), node("B", 10, [fs("A")]), node("C", 5, [fs("B")])];
    const r = analyseRootCause({
      current: solve(nodes),
      baseline,
      baselineDurationDays: 35,
    });
    expect(r.forecastDelayDays).toBe(-10);
    expect(r.summary).toContain("ahead of baseline");
  });
});

describe("out-of-sequence detection", () => {
  it("finds work started before its predecessor finished", () => {
    const nodes = [node("A", 10), node("B", 10, [fs("A")])];
    const out = findOutOfSequence(
      nodes,
      new Map([["B", 5]]),
      new Map([["A", 10]])
    );
    expect(out).toEqual(["B"]);
  });

  it("accepts work started after its predecessor finished", () => {
    const nodes = [node("A", 10), node("B", 10, [fs("A")])];
    const out = findOutOfSequence(
      nodes,
      new Map([["B", 12]]),
      new Map([["A", 10]])
    );
    expect(out).toEqual([]);
  });
});

describe("shipped templates pass their own health checks", () => {
  it("has no dangling work activities in either template", async () => {
    const { RC_RESIDENTIAL } = await import("../templates/rc_residential");
    const { INDUSTRIAL_STEEL } = await import("../templates/industrial_steel");

    for (const tpl of [RC_RESIDENTIAL, INDUSTRIAL_STEEL]) {
      const hasSuccessor = new Set<string>();
      for (const t of tpl) for (const p of t.predecessors) hasSuccessor.add(p.code);
      // Milestones may legitimately drive nothing; work activities may not.
      const dangling = tpl.filter(
        (t) => !hasSuccessor.has(t.code) && !t.isMilestone
      );
      expect(dangling.map((d) => d.code)).toEqual([]);
    }
  });

  it("does not flag a zero-duration milestone as dangling", () => {
    const nodes = [
      node("A", 10),
      node("B", 10, [fs("A")]),
      node("M1", 0, [fs("B")]),
      node("M2", 0, [fs("B")]),
    ];
    const r = analyseScheduleHealth({ nodes, hasApprovedBaseline: true });
    expect(r.findings.some((f) => f.check === "missing-successors")).toBe(false);
  });

  it("still flags work activities that drive nothing", () => {
    const nodes = [
      node("A", 10),
      node("W1", 5, [fs("A")]),
      node("W2", 5, [fs("A")]),
    ];
    const r = analyseScheduleHealth({ nodes, hasApprovedBaseline: true });
    const f = r.findings.find((x) => x.check === "missing-successors")!;
    expect(f.taskCodes.sort()).toEqual(["W1", "W2"]);
  });
});
