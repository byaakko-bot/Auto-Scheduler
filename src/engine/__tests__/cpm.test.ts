import { describe, expect, it } from "vitest";
import { CircularDependencyError, solve } from "../cpmSolver";
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

const fs = (id: string, lag = 0) =>
  ({ taskId: id, type: "FS" as DependencyType, lag });

describe("CPM forward/backward pass", () => {
  it("computes total float on a parallel branch", () => {
    const nodes = [
      node("A", 10),
      node("SHORT", 2, [fs("A")]),
      node("LONG", 10, [fs("A")]),
      node("C", 5, [fs("SHORT"), fs("LONG")]),
    ];
    const { nodes: solved } = solve(nodes);
    const by = Object.fromEntries(solved.map((n) => [n.taskId, n]));

    expect(by.A.float).toBe(0);
    expect(by.LONG.float).toBe(0);
    expect(by.SHORT.float).toBe(8);
    expect(by.C.ef).toBe(25);
  });

  it("distinguishes free float from total float", () => {
    // SHORT can slip 8 days before delaying the project, but any slip beyond
    // 8 also delays C — free float equals total float here.
    const nodes = [
      node("A", 10),
      node("SHORT", 2, [fs("A")]),
      node("LONG", 10, [fs("A")]),
      node("C", 5, [fs("SHORT"), fs("LONG")]),
    ];
    const { nodes: solved } = solve(nodes);
    const by = Object.fromEntries(solved.map((n) => [n.taskId, n]));
    expect(by.SHORT.freeFloat).toBe(8);
    expect(by.A.freeFloat).toBe(0);
  });

  it("honours FS lag", () => {
    const nodes = [node("A", 5), node("B", 5, [fs("A", 3)])];
    const { nodes: solved } = solve(nodes);
    expect(solved.find((n) => n.taskId === "B")!.es).toBe(8);
  });

  it("honours SS, FF and SF relationships", () => {
    const ss = solve([
      node("A", 3),
      node("B", 4, [{ taskId: "A", type: "SS", lag: 5 }]),
    ]).nodes;
    expect(ss.find((n) => n.taskId === "B")!.es).toBe(5);

    const ff = solve([
      node("A", 10),
      node("B", 4, [{ taskId: "A", type: "FF", lag: 2 }]),
    ]).nodes;
    // B must finish 2 days after A finishes (day 12), so it starts at 8.
    expect(ff.find((n) => n.taskId === "B")!.es).toBe(8);
    expect(ff.find((n) => n.taskId === "B")!.ef).toBe(12);
  });
});

describe("deadlines and feasibility", () => {
  it("reports negative float when the deadline cannot be met", () => {
    // 30 working days of work against a 20-day deadline.
    const nodes = [node("A", 15), node("B", 15, [fs("A")])];
    const result = solve(nodes, { deadline: 20 });

    expect(result.projectDuration).toBe(30);
    expect(result.isFeasible).toBe(false);
    for (const n of result.nodes) {
      expect(n.float).toBe(-10);
      expect(n.isCritical).toBe(true);
    }
  });

  it("reports a feasible schedule with positive float against a loose deadline", () => {
    const nodes = [node("A", 15), node("B", 15, [fs("A")])];
    const result = solve(nodes, { deadline: 40 });

    expect(result.isFeasible).toBe(true);
    expect(result.nodes.every((n) => n.float === 10)).toBe(true);
    // The longest path is still critical even though it beats the deadline:
    // criticality is measured against LEAST float, not against zero, so the
    // chain governing the finish date stays visible.
    expect(result.nodes.every((n) => n.isCritical)).toBe(true);
  });

  it("still identifies a critical path when the deadline is generous", () => {
    // A -> LONG -> C governs; SHORT has genuine slack. With a deadline far in
    // the future every float is positive, and a "float <= 0" rule would report
    // no critical activities at all.
    const nodes = [
      node("A", 10),
      node("SHORT", 2, [fs("A")]),
      node("LONG", 10, [fs("A")]),
      node("C", 5, [fs("SHORT"), fs("LONG")]),
    ];
    const result = solve(nodes, { deadline: 100 });
    const by = Object.fromEntries(result.nodes.map((n) => [n.taskId, n]));

    expect(result.nodes.some((n) => n.isCritical)).toBe(true);
    expect(by.A.isCritical).toBe(true);
    expect(by.LONG.isCritical).toBe(true);
    expect(by.C.isCritical).toBe(true);
    expect(by.SHORT.isCritical).toBe(false);
    expect(result.criticalPaths.length).toBeGreaterThan(0);
  });
});

describe("criticality bands", () => {
  it("classifies critical, near-critical, watch and normal", () => {
    const nodes = [
      node("DRIVER", 30),
      node("CRIT", 30, [fs("DRIVER")]),
      node("NEAR", 27, [fs("DRIVER")]),
      node("WATCH", 22, [fs("DRIVER")]),
      node("NORMAL", 5, [fs("DRIVER")]),
      node("END", 1, [fs("CRIT"), fs("NEAR"), fs("WATCH"), fs("NORMAL")]),
    ];
    const { nodes: solved } = solve(nodes, {
      nearCriticalThreshold: 5,
      watchThreshold: 10,
    });
    const by = Object.fromEntries(solved.map((n) => [n.taskId, n]));

    expect(by.CRIT.band).toBe("CRITICAL");
    expect(by.NEAR.band).toBe("NEAR_CRITICAL"); // float 3
    expect(by.WATCH.band).toBe("WATCH"); // float 8
    expect(by.NORMAL.band).toBe("NORMAL"); // float 25
  });

  it("respects a configurable near-critical threshold", () => {
    const nodes = [
      node("DRIVER", 30),
      node("CRIT", 30, [fs("DRIVER")]),
      node("NEAR", 22, [fs("DRIVER")]),
      node("END", 1, [fs("CRIT"), fs("NEAR")]),
    ];
    const tight = solve(nodes, { nearCriticalThreshold: 5 }).nodes;
    expect(tight.find((n) => n.taskId === "NEAR")!.band).toBe("WATCH");

    const loose = solve(nodes, { nearCriticalThreshold: 10 }).nodes;
    expect(loose.find((n) => n.taskId === "NEAR")!.band).toBe("NEAR_CRITICAL");
  });
});

describe("date constraints", () => {
  it("SNET pushes an activity later than its logic would allow", () => {
    const nodes = [
      node("A", 5),
      node("B", 5, [fs("A")], { type: "SNET", offset: 20 }),
    ];
    const { nodes: solved } = solve(nodes);
    expect(solved.find((n) => n.taskId === "B")!.es).toBe(20);
  });

  it("FNLT drives negative float when logic overruns the constraint", () => {
    const nodes = [
      node("A", 20),
      node("B", 20, [fs("A")], { type: "FNLT", offset: 25 }),
    ];
    const { nodes: solved } = solve(nodes);
    // B cannot finish before day 40 but must finish by 25 → 15 days late.
    expect(solved.find((n) => n.taskId === "B")!.float).toBe(-15);
  });
});

describe("multiple critical paths", () => {
  it("enumerates distinct critical chains", () => {
    // Two independent 20-day chains converging on handover.
    const nodes = [
      node("STRUCT_1", 10),
      node("STRUCT_2", 10, [fs("STRUCT_1")]),
      node("PROC_1", 10),
      node("PROC_2", 10, [fs("PROC_1")]),
      node("HANDOVER", 1, [fs("STRUCT_2"), fs("PROC_2")]),
    ];
    const result = solve(nodes, { nearCriticalThreshold: 0 });

    expect(result.criticalPaths.length).toBe(2);
    const asStrings = result.criticalPaths.map((p) => p.join(">"));
    expect(asStrings).toContain("STRUCT_1>STRUCT_2>HANDOVER");
    expect(asStrings).toContain("PROC_1>PROC_2>HANDOVER");
  });
});

describe("cycle detection", () => {
  it("throws rather than emitting plausible-looking dates", () => {
    const nodes = [node("A", 5, [fs("B")]), node("B", 5, [fs("A")])];
    expect(() => solve(nodes)).toThrow(CircularDependencyError);
  });

  it("names the activities in the cycle", () => {
    const nodes = [
      node("A", 5, [fs("C")]),
      node("B", 5, [fs("A")]),
      node("C", 5, [fs("B")]),
      node("SAFE", 5),
    ];
    try {
      solve(nodes);
      throw new Error("expected a CircularDependencyError");
    } catch (err) {
      expect(err).toBeInstanceOf(CircularDependencyError);
      const cycle = (err as CircularDependencyError).cycles[0];
      expect(cycle).toContain("A");
      expect(cycle).toContain("B");
      expect(cycle).toContain("C");
      expect(cycle).not.toContain("SAFE");
    }
  });
});

describe("performance", () => {
  it("solves a 10,000-activity chain well under a second", () => {
    const nodes: ScheduleNode[] = [];
    for (let i = 0; i < 10_000; i++) {
      nodes.push(node(`T${i}`, 2, i === 0 ? [] : [fs(`T${i - 1}`)]));
    }
    const started = Date.now();
    const result = solve(nodes);
    const elapsed = Date.now() - started;

    expect(result.projectDuration).toBe(20_000);
    expect(elapsed).toBeLessThan(1000);
  });
});
