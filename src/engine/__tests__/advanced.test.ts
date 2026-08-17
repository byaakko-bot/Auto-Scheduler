import { describe, expect, it } from "vitest";
import { solve } from "../cpmSolver";
import { generateRecoveryPlan, type ScalableActivity } from "../recovery";
import { compareMethods, evaluateScenario } from "../scenario";
import {
  detectResourceConflicts,
  resolutionsFor,
  resourceHistogram,
  type ResourceAssignment,
} from "../resources";
import type { DependencyType, ScheduleNode } from "../types";

function node(
  id: string,
  dur: number,
  preds: { taskId: string; type: DependencyType; lag: number }[] = []
): ScheduleNode {
  return {
    taskId: id,
    durationDays: dur,
    predecessors: preds,
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

// A(20) -> B(40) -> C(10). B dominates and is quantity-driven.
function chain(): ScheduleNode[] {
  return [
    node("A", 20),
    node("B", 40, [fs("A")]),
    node("C", 10, [fs("B")]),
  ];
}

const scalableB = new Map<string, ScalableActivity>([
  ["B", { crews: 1, quantity: 4000, outputPerCrewDay: 100, rateCode: "PLASTER" }],
]);

describe("§14/§15 — resource conflicts", () => {
  const capacities = [
    { resourceId: "concrete", resourceName: "Concrete Crew", capacity: 1 },
  ];

  it("detects overlapping demand beyond capacity", () => {
    const assignments: ResourceAssignment[] = [
      { taskCode: "T1", resourceId: "concrete", resourceName: "Concrete Crew", crews: 1, es: 0, ef: 10 },
      { taskCode: "T2", resourceId: "concrete", resourceName: "Concrete Crew", crews: 1, es: 5, ef: 15 },
    ];
    const conflicts = detectResourceConflicts(assignments, capacities);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].fromOffset).toBe(5);
    expect(conflicts[0].toOffset).toBe(10);
    expect(conflicts[0].peakDemand).toBe(2);
    expect(conflicts[0].excess).toBe(1);
    expect(conflicts[0].taskCodes.sort()).toEqual(["T1", "T2"]);
  });

  it("reports no conflict when capacity covers the overlap", () => {
    const assignments: ResourceAssignment[] = [
      { taskCode: "T1", resourceId: "concrete", resourceName: "Concrete Crew", crews: 1, es: 0, ef: 10 },
      { taskCode: "T2", resourceId: "concrete", resourceName: "Concrete Crew", crews: 1, es: 5, ef: 15 },
    ];
    const conflicts = detectResourceConflicts(assignments, [
      { resourceId: "concrete", resourceName: "Concrete Crew", capacity: 2 },
    ]);
    expect(conflicts).toHaveLength(0);
  });

  it("reports nothing for a resource with no declared capacity (§42)", () => {
    const assignments: ResourceAssignment[] = [
      { taskCode: "T1", resourceId: "unknown", resourceName: "Unknown", crews: 5, es: 0, ef: 10 },
    ];
    expect(detectResourceConflicts(assignments, capacities)).toHaveLength(0);
  });

  it("ignores sequential work on the same crew", () => {
    const assignments: ResourceAssignment[] = [
      { taskCode: "T1", resourceId: "concrete", resourceName: "Concrete Crew", crews: 1, es: 0, ef: 10 },
      { taskCode: "T2", resourceId: "concrete", resourceName: "Concrete Crew", crews: 1, es: 10, ef: 20 },
    ];
    expect(detectResourceConflicts(assignments, capacities)).toHaveLength(0);
  });

  it("builds a daily demand histogram", () => {
    const assignments: ResourceAssignment[] = [
      { taskCode: "T1", resourceId: "concrete", resourceName: "Concrete Crew", crews: 1, es: 0, ef: 5 },
      { taskCode: "T2", resourceId: "concrete", resourceName: "Concrete Crew", crews: 2, es: 3, ef: 8 },
    ];
    const h = resourceHistogram(assignments, "concrete", 2, 8);
    expect(h[0].demand).toBe(1);
    expect(h[3].demand).toBe(3);
    expect(h[3].overCapacity).toBe(true);
    expect(h[6].demand).toBe(2);
    expect(h[6].overCapacity).toBe(false);
  });

  it("suggests moving the activity with the most float", () => {
    const conflict = detectResourceConflicts(
      [
        { taskCode: "T1", resourceId: "concrete", resourceName: "Concrete Crew", crews: 1, es: 0, ef: 10 },
        { taskCode: "T2", resourceId: "concrete", resourceName: "Concrete Crew", crews: 1, es: 5, ef: 15 },
      ],
      capacities
    )[0];
    const options = resolutionsFor(
      conflict,
      new Map([
        ["T1", 0],
        ["T2", 12],
      ])
    );
    expect(options[0].kind).toBe("DELAY_TASK");
    expect(options[0].taskCode).toBe("T2");
  });

  it("says so when every overlapping activity is critical", () => {
    const conflict = detectResourceConflicts(
      [
        { taskCode: "T1", resourceId: "concrete", resourceName: "Concrete Crew", crews: 1, es: 0, ef: 10 },
        { taskCode: "T2", resourceId: "concrete", resourceName: "Concrete Crew", crews: 1, es: 5, ef: 15 },
      ],
      capacities
    )[0];
    const options = resolutionsFor(conflict, new Map([["T1", 0], ["T2", 0]]));
    expect(options.some((o) => o.kind === "REASSIGN")).toBe(true);
  });
});

describe("§22/§41 — recovery planning", () => {
  it("measures recovery by re-solving, not by assuming", () => {
    const plan = generateRecoveryPlan({ nodes: chain(), scalable: scalableB }, 10);
    expect(plan.baselineDurationDays).toBe(70);

    // B is 4,000 units at 100/crew-day: 40d at 1 crew, 20d at 2, 14d at 3.
    const oneMore = plan.options.find((o) => o.id === "ADD_CREW:B:1")!;
    const twoMore = plan.options.find((o) => o.id === "ADD_CREW:B:2")!;
    expect(oneMore.recoveryDays).toBe(20);
    expect(twoMore.recoveryDays).toBe(26);

    // Diminishing returns: the second extra crew buys far less than the first.
    expect(twoMore.recoveryDays - oneMore.recoveryDays).toBeLessThan(
      oneMore.recoveryDays
    );
  });

  it("does not claim recovery when another chain becomes critical", () => {
    // Parallel chain of 55 days caps any recovery at 15 days.
    const nodes = [
      ...chain(),
      node("P1", 55),
      node("C2", 10, [fs("B"), fs("P1")]),
    ];
    const plan = generateRecoveryPlan({ nodes, scalable: scalableB });
    const best = plan.bestOption!;
    expect(best.recoveryDays).toBeLessThanOrEqual(5);
  });

  it("reports cost as unknown when no rate is configured (§42)", () => {
    const plan = generateRecoveryPlan({ nodes: chain(), scalable: scalableB });
    const addCrew = plan.options.find((o) => o.strategy === "ADD_CREW")!;
    expect(addCrew.additionalCost).toBeNull();
    expect(addCrew.costBasis).toContain("No crew cost rate configured");
    expect(plan.notes.join(" ")).toContain("not configured");
  });

  it("computes cost when a crew rate is given", () => {
    const plan = generateRecoveryPlan({
      nodes: chain(),
      scalable: scalableB,
      crewCostPerDay: 1200,
      currency: "EUR",
    });
    const oneMore = plan.options.find((o) => o.id === "ADD_CREW:B:1")!;
    // One extra crew for the 20 days the activity now takes.
    expect(oneMore.additionalCost).toBe(1200 * 1 * 20);
    expect(oneMore.currency).toBe("EUR");

    // Two extra crews for 14 days costs more but buys only 6 further days.
    const twoMore = plan.options.find((o) => o.id === "ADD_CREW:B:2")!;
    expect(twoMore.additionalCost).toBe(1200 * 2 * 14);
  });

  it("offers lag removal only where a lag sits on the critical path", () => {
    const withLag = [
      node("A", 20),
      node("B", 40, [fs("A", 10)]),
      node("C", 10, [fs("B")]),
    ];
    const plan = generateRecoveryPlan({ nodes: withLag, scalable: new Map() });
    const lagOption = plan.options.find((o) => o.strategy === "REDUCE_LAG")!;
    expect(lagOption).toBeDefined();
    expect(lagOption.recoveryDays).toBe(10);
    expect(lagOption.additionalCost).toBe(0);
    expect(lagOption.riskNote).toContain("curing");
  });

  it("offers fast-tracking with an explicit high-risk warning", () => {
    const plan = generateRecoveryPlan({ nodes: chain(), scalable: new Map() });
    const ft = plan.options.find((o) => o.strategy === "FAST_TRACK");
    expect(ft).toBeDefined();
    expect(ft!.risk).toBe("HIGH");
    expect(ft!.recoveryDays).toBeGreaterThan(0);
  });

  it("flags when no single lever closes the gap", () => {
    const plan = generateRecoveryPlan({ nodes: chain(), scalable: scalableB }, 60);
    expect(plan.requiresCombination).toBe(true);
  });

  it("ranks the largest recovery first", () => {
    const plan = generateRecoveryPlan({ nodes: chain(), scalable: scalableB });
    for (let i = 1; i < plan.options.length; i++) {
      expect(plan.options[i - 1].recoveryDays).toBeGreaterThanOrEqual(
        plan.options[i].recoveryDays
      );
    }
  });

  it("generates nothing scalable for activities that are not critical", () => {
    const nodes = [node("A", 20), node("SIDE", 2), node("C", 10, [fs("A")])];
    const plan = generateRecoveryPlan({
      nodes,
      scalable: new Map([
        ["SIDE", { crews: 1, quantity: 200, outputPerCrewDay: 100, rateCode: "X" }],
      ]),
    });
    expect(plan.options.filter((o) => o.strategy === "ADD_CREW")).toHaveLength(0);
  });
});

describe("§21 — what-if scenarios", () => {
  it("does not modify the baseline", () => {
    const nodes = chain();
    const before = nodes.map((n) => n.durationDays);
    evaluateScenario({
      nodes,
      changes: [{ kind: "DURATION_DELTA", taskCode: "B", value: 10 }],
    });
    expect(nodes.map((n) => n.durationDays)).toEqual(before);
  });

  it("answers 'what if B slips 10 days'", () => {
    const r = evaluateScenario({
      nodes: chain(),
      changes: [{ kind: "DURATION_DELTA", taskCode: "B", value: 10 }],
    });
    expect(r.finishShiftDays).toBe(10);
    expect(r.baseline.projectDuration).toBe(70);
    expect(r.scenario.projectDuration).toBe(80);
  });

  it("reports a scenario that saves time as a negative shift", () => {
    const r = evaluateScenario({
      nodes: chain(),
      changes: [{ kind: "DURATION_SET", taskCode: "B", value: 20 }],
    });
    expect(r.finishShiftDays).toBe(-20);
  });

  it("applies link changes and reports them", () => {
    const r = evaluateScenario({
      nodes: chain(),
      changes: [
        {
          kind: "DEPENDENCY_TYPE",
          taskCode: "C",
          predecessorCode: "B",
          dependencyType: "SS",
          value: 5,
        },
      ],
    });
    expect(r.applied[0]).toContain("SS+5");
    expect(r.finishShiftDays).toBeLessThan(0);
  });

  it("rejects changes to activities or links that do not exist", () => {
    const r = evaluateScenario({
      nodes: chain(),
      changes: [
        { kind: "DURATION_DELTA", taskCode: "NOPE", value: 5 },
        { kind: "LAG_SET", taskCode: "C", predecessorCode: "A", value: 3 },
      ],
    });
    expect(r.rejected).toHaveLength(2);
    expect(r.applied).toHaveLength(0);
    expect(r.finishShiftDays).toBe(0);
  });

  it("reports infeasibility against a deadline", () => {
    const r = evaluateScenario({
      nodes: chain(),
      changes: [{ kind: "DURATION_DELTA", taskCode: "B", value: 30 }],
      deadline: 75,
    });
    expect(r.isFeasible).toBe(false);
  });
});

describe("§36 — method comparison", () => {
  it("ranks methods by duration and reports the spread", () => {
    const mk = (d: number) => solve([node("X", d)]);
    const c = compareMethods([
      { method: "MASONRY_BLOCKWORK", result: mk(280) },
      { method: "AAC_BLOCKS", result: mk(240) },
      { method: "AAC_PANELS", result: mk(205) },
    ]);
    expect(c.fastest).toBe("AAC_PANELS");
    expect(c.slowest).toBe("MASONRY_BLOCKWORK");
    expect(c.spreadDays).toBe(75);
    expect(c.rows[0].deltaVsFastestDays).toBe(0);
    expect(c.rows[2].deltaVsFastestDays).toBe(75);
  });

  it("leaves cost null when no cost model is supplied (§42)", () => {
    const c = compareMethods([
      { method: "AAC_PANELS", result: solve([node("X", 100)]) },
    ]);
    expect(c.rows[0].estimatedCost).toBeNull();
  });

  it("handles an empty comparison without throwing", () => {
    expect(compareMethods([]).rows).toHaveLength(0);
  });
});

describe("recovery respects cycle-governed work", () => {
  // A 5-storey frame with a 40-day cycle floor: 4,000 units at 100/crew-day
  // would say 40d at one crew and 20d at two, but curing forbids the latter.
  const cycleBound = new Map<string, ScalableActivity>([
    [
      "B",
      {
        crews: 1,
        quantity: 4000,
        outputPerCrewDay: 100,
        rateCode: "CONCRETE_SLAB",
        minDays: 40,
      },
    ],
  ]);

  it("does not offer crew savings that curing prevents", () => {
    const plan = generateRecoveryPlan({ nodes: chain(), scalable: cycleBound });
    expect(plan.options.filter((o) => o.strategy === "ADD_CREW")).toHaveLength(0);
  });

  it("explains why adding crews recovers nothing", () => {
    const plan = generateRecoveryPlan({ nodes: chain(), scalable: cycleBound });
    expect(plan.notes.join(" ")).toContain("cycle floor");
  });

  it("still offers crew savings above the floor", () => {
    const headroom = new Map<string, ScalableActivity>([
      ["B", { crews: 1, quantity: 4000, outputPerCrewDay: 100, rateCode: "X", minDays: 10 }],
    ]);
    const plan = generateRecoveryPlan({ nodes: chain(), scalable: headroom });
    const opt = plan.options.find((o) => o.id === "ADD_CREW:B:1")!;
    expect(opt).toBeDefined();
    expect(opt.recoveryDays).toBe(20); // 40d -> 20d, still above the 10d floor
  });

  it("does not let overtime breach the cycle floor either", () => {
    const plan = generateRecoveryPlan({ nodes: chain(), scalable: cycleBound });
    expect(plan.options.filter((o) => o.strategy === "OVERTIME")).toHaveLength(0);
  });
});
