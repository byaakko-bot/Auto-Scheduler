import { describe, expect, it } from "vitest";
import { buildCalendar } from "../calendarEngine";
import { solve } from "../cpmSolver";
import {
  applyDelay,
  compareSchedules,
  physicalProgress,
  plannedPercentAt,
  reforecast,
} from "../forecast";
import { buildSCurve, progressVarianceAt } from "../sCurve";
import type { DependencyType, ScheduleNode } from "../types";

const cal = buildCalendar(5);
const START = new Date("2027-01-04T00:00:00.000Z"); // a Monday

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

/** A -> {SHORT(2), LONG(10)} -> C. SHORT carries 8 days of float. */
function diamond(): ScheduleNode[] {
  return [
    node("A", 10),
    node("SHORT", 2, [fs("A")]),
    node("LONG", 10, [fs("A")]),
    node("C", 5, [fs("SHORT"), fs("LONG")]),
  ];
}

const baseInput = {
  projectStart: START,
  calendar: cal,
  dataDate: START,
};

describe("§19 — delay propagation re-solves rather than pushing dates", () => {
  it("absorbs a delay entirely within float, moving nothing downstream", () => {
    const { impact } = applyDelay(
      { ...baseInput, nodes: diamond() },
      "SHORT",
      5 // SHORT has 8 days of float
    );
    expect(impact.projectFinishShiftDays).toBe(0);
    // C must not move: LONG still governs.
    expect(impact.deltas.find((d) => d.code === "C")?.startShiftDays ?? 0).toBe(0);
  });

  it("consumes float without making the activity critical", () => {
    const { impact } = applyDelay(
      { ...baseInput, nodes: diamond() },
      "SHORT",
      5
    );
    expect(impact.floatConsumed).toContain("SHORT");
    expect(impact.becameCritical).not.toContain("SHORT");
  });

  it("delays the project only by the excess beyond float", () => {
    // 12 days of delay against 8 days of float -> 4 days of project impact.
    const { impact } = applyDelay(
      { ...baseInput, nodes: diamond() },
      "SHORT",
      12
    );
    expect(impact.projectFinishShiftDays).toBe(4);
  });

  it("passes a critical-path delay through in full", () => {
    const { impact } = applyDelay({ ...baseInput, nodes: diamond() }, "LONG", 6);
    expect(impact.projectFinishShiftDays).toBe(6);
  });

  it("detects the critical path moving to another chain", () => {
    const { impact } = applyDelay(
      { ...baseInput, nodes: diamond() },
      "SHORT",
      12
    );
    expect(impact.criticalPathChanged).toBe(true);
    expect(impact.becameCritical).toContain("SHORT");
    expect(impact.noLongerCritical).toContain("LONG");
  });

  it("respects lag rather than adding a flat offset", () => {
    const nodes = [node("A", 5), node("B", 5, [fs("A", 10)])];
    const { after } = applyDelay({ ...baseInput, nodes }, "A", 3);
    // A now finishes at 8; B starts at 8 + 10 lag = 18.
    expect(after.nodes.find((n) => n.taskId === "B")!.es).toBe(18);
  });
});

describe("§25 — progress uses remaining duration, not percent complete", () => {
  const nodes = () => [node("A", 20), node("B", 10, [fs("A")])];

  it("prefers reported remaining duration over percent complete", () => {
    // 50% complete would imply 10 days left, but the crew reports 18.
    const r = reforecast({
      ...baseInput,
      nodes: nodes(),
      dataDate: new Date("2027-01-18T00:00:00.000Z"), // 10 working days in
      updates: [
        {
          taskCode: "A",
          actualStartDate: START,
          percentComplete: 50,
          remainingDurationDays: 18,
        },
      ],
    });
    const a = r.cpm.nodes.find((n) => n.taskId === "A")!;
    expect(a.durationDays).toBe(28); // 10 elapsed + 18 remaining
    expect(r.notes.get("A")).toContain("remaining duration 18d");
  });

  it("falls back to percent complete when no remaining duration is given", () => {
    const r = reforecast({
      ...baseInput,
      nodes: nodes(),
      dataDate: new Date("2027-01-18T00:00:00.000Z"),
      updates: [
        { taskCode: "A", actualStartDate: START, percentComplete: 75 },
      ],
    });
    const a = r.cpm.nodes.find((n) => n.taskId === "A")!;
    expect(a.durationDays).toBe(15); // 10 elapsed + ceil(20 * 0.25)
  });

  it("pins a completed activity to its actual dates", () => {
    const r = reforecast({
      ...baseInput,
      nodes: nodes(),
      dataDate: new Date("2027-02-01T00:00:00.000Z"),
      updates: [
        {
          taskCode: "A",
          actualStartDate: START,
          actualFinishDate: new Date("2027-01-25T00:00:00.000Z"),
        },
      ],
    });
    expect(r.states.get("A")).toBe("COMPLETE");
    const a = r.cpm.nodes.find((n) => n.taskId === "A")!;
    expect(a.es).toBe(0);
    expect(a.durationDays).toBe(15); // 15 working days to 25 Jan
  });

  it("will not schedule unstarted work in the past", () => {
    const r = reforecast({
      ...baseInput,
      nodes: nodes(),
      dataDate: new Date("2027-02-15T00:00:00.000Z"), // 30 working days in
      updates: [],
    });
    const a = r.cpm.nodes.find((n) => n.taskId === "A")!;
    expect(r.states.get("A")).toBe("NOT_STARTED");
    expect(a.es).toBeGreaterThanOrEqual(r.dataDateOffset);
  });
});

describe("§26 — physical progress is independent of duration", () => {
  it("reports the spec's worked example", () => {
    // 2,400 m² of AAC wall, 1,500 m² installed -> 62.5%.
    const p = physicalProgress(2400, 1500, 72);
    expect(p.physicalPct).toBe(62.5);
    expect(p.plannedPct).toBe(72);
    expect(p.variancePct).toBeCloseTo(-9.5, 5);
  });

  it("caps at 100% when more is installed than measured", () => {
    expect(physicalProgress(100, 130, 50).physicalPct).toBe(100);
  });

  it("returns zero rather than dividing by zero", () => {
    expect(physicalProgress(0, 0, 0).physicalPct).toBe(0);
  });

  it("derives planned percent from the schedule position", () => {
    const n = { es: 0, ef: 10, durationDays: 10 };
    expect(plannedPercentAt(n, 0)).toBe(0);
    expect(plannedPercentAt(n, 5)).toBe(50);
    expect(plannedPercentAt(n, 10)).toBe(100);
    expect(plannedPercentAt(n, 20)).toBe(100);
  });
});

describe("§20 — impact analysis", () => {
  it("counts affected activities and separates critical ones", () => {
    const { impact } = applyDelay({ ...baseInput, nodes: diamond() }, "A", 5);
    expect(impact.affectedCount).toBeGreaterThan(0);
    expect(impact.criticalAffectedCount).toBeGreaterThan(0);
    expect(impact.projectFinishShiftDays).toBe(5);
  });

  it("reports no impact when nothing changed", () => {
    const before = solve(diamond());
    const after = solve(diamond());
    const impact = compareSchedules(before, after);
    expect(impact.affectedCount).toBe(0);
    expect(impact.criticalPathChanged).toBe(false);
    expect(impact.projectFinishShiftDays).toBe(0);
  });
});

describe("§27 — S-curve", () => {
  it("rises monotonically from 0 to 100 percent", () => {
    const planned = solve(diamond()).nodes;
    const curve = buildSCurve({ planned, projectStart: START, calendar: cal });

    expect(curve[0].plannedPct).toBe(0);
    expect(curve.at(-1)!.plannedPct).toBeCloseTo(100, 5);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].plannedPct).toBeGreaterThanOrEqual(curve[i - 1].plannedPct);
    }
  });

  it("weights activities by duration, not by count", () => {
    // One 90-day activity and nine 1-day activities running in parallel.
    const nodes = [node("BIG", 90), ...Array.from({ length: 9 }, (_, i) => node(`S${i}`, 1))];
    const planned = solve(nodes).nodes;
    const curve = buildSCurve({ planned, projectStart: START, calendar: cal, intervals: 10 });
    // After the nine short tasks finish, only 9 of 99 duration-days are done.
    const early = curve.find((p) => p.workingDayOffset >= 9)!;
    expect(early.plannedPct).toBeLessThan(20);
  });

  it("stops the actual series at the data date and starts forecast there", () => {
    const planned = solve(diamond()).nodes;
    const forecast = solve(diamond()).nodes;
    const curve = buildSCurve({
      planned,
      forecast,
      actualProgress: new Map([["A", 100]]),
      projectStart: START,
      calendar: cal,
      dataDateOffset: 10,
      intervals: 10,
    });
    expect(curve.some((p) => p.actualPct !== null)).toBe(true);
    expect(curve.at(-1)!.actualPct).toBeNull();
    expect(curve.at(-1)!.forecastPct).not.toBeNull();
    expect(curve[0].forecastPct).toBeNull();
  });

  it("computes schedule variance in days behind plan", () => {
    const planned = solve(diamond()).nodes;
    const v = progressVarianceAt(planned, 20, 15, START, cal);
    expect(v.plannedPct).toBeGreaterThan(20);
    expect(v.variancePct).toBeLessThan(0);
    expect(v.scheduleVarianceDays).toBeGreaterThan(0); // behind
  });
});
