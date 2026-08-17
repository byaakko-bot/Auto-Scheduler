import { describe, expect, it } from "vitest";
import { generateWithinTarget } from "../fit";
import { DEFAULT_PRODUCTIVITY } from "../constants";
import type { ProjectInputs } from "../types";

const base: ProjectInputs = {
  totalAreaSqm: 13000,
  numberOfFloors: 1,
  numberOfUnits: 1,
  numberOfBasements: 0,
  numberOfBuildings: 1,
  crewSize: 20,
  productivityRates: DEFAULT_PRODUCTIVITY,
  constructionMethod: "STEEL_FRAME",
  buildingType: "INDUSTRIAL_WAREHOUSE",
  startDate: new Date("2027-05-01T00:00:00.000Z"),
  workingDaysPerWeek: 6,
  workingHoursPerDay: 9,
};

describe("fitting a schedule to a target date", () => {
  it("meets a generous target with the fewest crews", () => {
    const r = generateWithinTarget({
      ...base,
      targetEndDate: new Date("2030-01-01T00:00:00.000Z"),
    });
    expect(r.achieved).toBe(true);
    expect(r.crews).toBe(1);
    expect(r.schedule.projectEndDate.getTime()).toBeLessThanOrEqual(
      new Date("2030-01-01T00:00:00.000Z").getTime()
    );
  });

  it("adds crews until a tighter target is met", () => {
    const loose = generateWithinTarget({
      ...base,
      targetEndDate: new Date("2030-01-01T00:00:00.000Z"),
    });
    const tight = generateWithinTarget({
      ...base,
      targetEndDate: new Date("2029-01-01T00:00:00.000Z"),
    });
    expect(tight.crews).toBeGreaterThan(loose.crews);
    expect(tight.achieved).toBe(true);
  });

  it("never overruns the target when it reports success", () => {
    for (const target of ["2029-01-01", "2029-06-01", "2030-01-01"]) {
      const r = generateWithinTarget({
        ...base,
        targetEndDate: new Date(`${target}T00:00:00.000Z`),
      });
      if (r.achieved) {
        expect(
          r.schedule.projectEndDate.getTime(),
          `${target} with ${r.crews} crews`
        ).toBeLessThanOrEqual(new Date(`${target}T00:00:00.000Z`).getTime());
      }
    }
  });

  it("reports failure honestly rather than compressing the work", () => {
    const r = generateWithinTarget({
      ...base,
      targetEndDate: new Date("2027-09-01T00:00:00.000Z"), // four months
    });
    expect(r.achieved).toBe(false);
    expect(r.residualGapDays).toBeGreaterThan(0);
    expect(r.explanation).toContain("not achievable");
    // It still returns a real schedule, not a fabricated one.
    expect(r.schedule.tasks.length).toBeGreaterThan(0);
  });

  it("abandons a hopeless target early rather than grinding to the ceiling", () => {
    // One month for a 13,000 m² factory: unreachable at any crew count.
    const r = generateWithinTarget(
      { ...base, targetEndDate: new Date("2027-06-01T00:00:00.000Z") },
      { maxCrews: 12 }
    );
    expect(r.achieved).toBe(false);
    expect(r.maxCrewsSearched).toBeLessThan(12);
    expect(r.explanation).toContain("governed by lead times");
  });

  it("does not abandon a target that more crews would have met", () => {
    // Reachable only in the upper half of the crew range. A stop rule based on
    // diminishing returns alone would wrongly give up before finding it.
    const r = generateWithinTarget(
      { ...base, targetEndDate: new Date("2028-08-01T00:00:00.000Z") },
      { maxCrews: 10 }
    );
    expect(r.achieved).toBe(true);
    expect(r.crews).toBeGreaterThan(2);
    expect(r.schedule.projectEndDate.getTime()).toBeLessThanOrEqual(
      new Date("2028-08-01T00:00:00.000Z").getTime()
    );
  });

  it("returns the shortest schedule found when the target is missed", () => {
    const r = generateWithinTarget({
      ...base,
      targetEndDate: new Date("2027-09-01T00:00:00.000Z"),
    });
    const shortest = Math.min(...r.attempts.map((a) => a.durationWorkingDays));
    expect(r.schedule.projectDurationWorkingDays).toBe(shortest);
  });

  it("records every crew count it tried", () => {
    const r = generateWithinTarget({
      ...base,
      targetEndDate: new Date("2029-01-01T00:00:00.000Z"),
    });
    expect(r.attempts.length).toBeGreaterThan(0);
    for (const a of r.attempts) {
      expect(a.crews).toBeGreaterThan(0);
      expect(a.durationWorkingDays).toBeGreaterThan(0);
    }
  });

  it("works without a target by returning the single-crew schedule", () => {
    const r = generateWithinTarget({ ...base, targetEndDate: undefined });
    // With no deadline every schedule is trivially feasible.
    expect(r.achieved).toBe(true);
    expect(r.crews).toBe(1);
  });
});
