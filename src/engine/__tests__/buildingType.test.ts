import { describe, expect, it } from "vitest";
import { generateSchedule } from "../index";
import { DEFAULT_PRODUCTIVITY } from "../constants";
import { templateNameFor } from "../templateSelector";
import { takeoff, profileFor } from "../quantities";

const werhahn = {
  totalAreaSqm: 13000,
  numberOfFloors: 1,
  numberOfUnits: 1,
  numberOfBasements: 0,
  numberOfBuildings: 1,
  crewSize: 20,
  crews: 2,
  productivityRates: DEFAULT_PRODUCTIVITY,
  constructionMethod: "STEEL_FRAME" as const,
  buildingType: "INDUSTRIAL_WAREHOUSE" as const,
  startDate: new Date("2027-05-01"),
  workingDaysPerWeek: 6,
  workingHoursPerDay: 9,
};

describe("template selection follows building type", () => {
  it("gives an industrial warehouse the industrial network", () => {
    expect(templateNameFor("INDUSTRIAL_WAREHOUSE", "STEEL_FRAME")).toBe("INDUSTRIAL_STEEL");
    expect(templateNameFor("INDUSTRIAL_WAREHOUSE", "PRECAST_CONCRETE")).toBe("INDUSTRIAL_STEEL");
  });

  it("keeps residential on the RC network", () => {
    expect(templateNameFor("RESIDENTIAL_APARTMENT", "REINFORCED_CONCRETE")).toBe("RC_RESIDENTIAL");
  });

  it("does not put kitchens or room tiling in a factory", () => {
    const s = generateSchedule(werhahn);
    const names = s.tasks.map((t) => t.name.toLowerCase()).join(" | ");
    expect(names).not.toContain("kitchen");
    expect(names).toContain("cladding");
    expect(names).toContain("steel frame erection");
  });
});

describe("industrial quantity profile", () => {
  it("does not wet-plaster a clad shed", () => {
    expect(profileFor("INDUSTRIAL_WAREHOUSE").plasterApplies).toBe(false);
    expect(profileFor("RESIDENTIAL_APARTMENT").plasterApplies).toBe(true);
  });

  it("produces vastly less plaster than the residential profile", () => {
    const geom = {
      grossFloorAreaSqm: 13000,
      numberOfFloors: 1,
      numberOfBuildings: 1,
      numberOfUnits: 1,
      numberOfBasements: 0,
    };
    const industrial = takeoff({ ...geom, buildingType: "INDUSTRIAL_WAREHOUSE" });
    const residential = takeoff({ ...geom, buildingType: "RESIDENTIAL_APARTMENT" });

    const iPlaster = industrial.items.get("PLASTER")!.quantity;
    const rPlaster = residential.items.get("PLASTER")!.quantity;

    // The residential profile invented ~36,000 m² of plaster on this shed.
    expect(rPlaster).toBeGreaterThan(30_000);
    expect(iPlaster).toBeLessThan(3_000);
  });

  it("does not tank a building with no basement", () => {
    const t = takeoff({
      grossFloorAreaSqm: 13000,
      numberOfFloors: 1,
      numberOfBuildings: 1,
      numberOfUnits: 1,
      numberOfBasements: 0,
      buildingType: "INDUSTRIAL_WAREHOUSE",
    });
    const wp = t.items.get("WATERPROOFING")!;
    expect(wp.derivation).toContain("no basement");
    // Slab DPM only — roughly the footprint, not footprint plus wall tanking.
    expect(wp.quantity).toBeLessThan(13000 * 1.1);
  });
});

describe("Werhahn Factory regression", () => {
  it("no longer forecasts completion in 2033", () => {
    const s = generateSchedule(werhahn);
    // Previously 1,848 working days finishing 2033-03-26.
    expect(s.projectEndDate.getUTCFullYear()).toBeLessThan(2030);
    expect(s.projectDurationWorkingDays).toBeLessThan(600);
  });

  it("shortens as crews are added", () => {
    const one = generateSchedule({ ...werhahn, crews: 1 });
    const three = generateSchedule({ ...werhahn, crews: 3 });
    expect(three.projectDurationWorkingDays).toBeLessThan(
      one.projectDurationWorkingDays
    );
  });

  it("reports infeasibility against a one-year target rather than silently slipping", () => {
    const s = generateSchedule({
      ...werhahn,
      targetEndDate: new Date("2028-05-01"),
    });
    expect(s.feasibility.isFeasible).toBe(false);
    expect(s.feasibility.gapWorkingDays).toBeGreaterThan(0);
    // And the target date itself is preserved, not overwritten by the forecast.
    expect(s.feasibility.targetEndDate?.toISOString().slice(0, 10)).toBe("2028-05-01");
  });
});
