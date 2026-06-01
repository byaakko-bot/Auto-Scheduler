import { describe, expect, it } from "vitest";
import { ScheduleEngine } from "../index";
import { DEFAULT_PRODUCTIVITY } from "../constants";
import { buildCalendar, workingDayDate } from "../calendarEngine";
import { propagateDelay } from "../delayPropagator";
import type { ProjectInputs } from "../types";

const baseInputs: ProjectInputs = {
  totalAreaSqm: 3600,
  numberOfFloors: 6,
  numberOfUnits: 36,
  numberOfBasements: 1,
  crewSize: 20,
  productivityRates: DEFAULT_PRODUCTIVITY,
  constructionMethod: "REINFORCED_CONCRETE",
  buildingType: "RESIDENTIAL_APARTMENT",
  startDate: new Date("2026-09-01T00:00:00.000Z"),
  workingDaysPerWeek: 6,
  permitWeeks: 6,
};

describe("ScheduleEngine", () => {
  const schedule = new ScheduleEngine(baseInputs).generate();

  it("generates a task for every template entry", () => {
    expect(schedule.tasks.length).toBeGreaterThan(30);
  });

  it("starts the first task on the project start date or later", () => {
    const first = schedule.tasks[0];
    expect(first.plannedStartDate.getTime()).toBeGreaterThanOrEqual(
      baseInputs.startDate.getTime()
    );
  });

  it("has a non-empty critical path", () => {
    expect(schedule.criticalPathCodes.length).toBeGreaterThan(0);
  });

  it("ends after it starts", () => {
    expect(schedule.projectEndDate.getTime()).toBeGreaterThan(
      baseInputs.startDate.getTime()
    );
  });

  it("never schedules a successor before its predecessor finishes (FS)", () => {
    const byCode = new Map(schedule.tasks.map((t) => [t.code, t]));
    for (const t of schedule.tasks) {
      for (const p of t.predecessors) {
        if (p.type !== "FS") continue;
        const pred = byCode.get(p.code);
        if (!pred) continue;
        expect(t.plannedStartDate.getTime()).toBeGreaterThanOrEqual(
          pred.plannedEndDate.getTime()
        );
      }
    }
  });

  it("faster methods finish sooner than RC", () => {
    const modular = new ScheduleEngine({
      ...baseInputs,
      constructionMethod: "MODULAR",
    }).generate();
    expect(modular.projectDurationWorkingDays).toBeLessThan(
      schedule.projectDurationWorkingDays
    );
  });
});

describe("propagateDelay", () => {
  it("pushes a successor when a predecessor slips", () => {
    const cal = buildCalendar(6, []);
    const a = {
      code: "A",
      durationDays: 5,
      plannedStartDate: workingDayDate(new Date("2026-09-01T00:00:00Z"), 0, cal),
      plannedEndDate: workingDayDate(new Date("2026-09-01T00:00:00Z"), 4, cal),
    };
    const b = {
      code: "B",
      durationDays: 5,
      plannedStartDate: workingDayDate(new Date("2026-09-01T00:00:00Z"), 5, cal),
      plannedEndDate: workingDayDate(new Date("2026-09-01T00:00:00Z"), 9, cal),
    };
    const newEnd = workingDayDate(new Date("2026-09-01T00:00:00Z"), 9, cal);
    const changed = propagateDelay(
      [a, b],
      [{ predecessorCode: "A", successorCode: "B", type: "FS", lagDays: 0 }],
      "A",
      newEnd,
      cal
    );
    const bChange = changed.find((c) => c.code === "B");
    expect(bChange).toBeTruthy();
    expect(bChange!.plannedStartDate.getTime()).toBeGreaterThan(
      b.plannedStartDate.getTime()
    );
  });
});
