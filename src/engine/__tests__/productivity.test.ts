import { describe, expect, it } from "vitest";
import {
  DEFAULT_RATES,
  durationFor,
  effectiveOutputPerDay,
  buildRateLookup,
  type ProductivityRate,
} from "../productivity";
import { takeoff } from "../quantities";

const crewRate: ProductivityRate = {
  code: "AAC_PANEL",
  name: "AAC panel installation",
  unit: "m2",
  crewSize: 4,
  outputPerDay: 80,
  basis: "CREW",
};

const personRate: ProductivityRate = {
  code: "TEST_PERSON",
  name: "Per-person rate",
  unit: "m2",
  crewSize: 4,
  outputPerDay: 20,
  basis: "PERSON",
};

describe("crew scaling (§11 — no double counting)", () => {
  it("scales a CREW-basis rate by crew count only, never by headcount", () => {
    // 80 m²/day is already the output of a 4-person crew.
    expect(effectiveOutputPerDay(crewRate, { crews: 1 })).toBe(80);
    expect(effectiveOutputPerDay(crewRate, { crews: 2 })).toBe(160);
    // The bug being guarded against would give 80 × 4 × 2 = 640.
    expect(effectiveOutputPerDay(crewRate, { crews: 2 })).not.toBe(640);
  });

  it("scales a PERSON-basis rate by headcount", () => {
    // 20 m²/day per worker × 4 workers = 80/day for one crew.
    expect(effectiveOutputPerDay(personRate, { crews: 1 })).toBe(80);
    expect(effectiveOutputPerDay(personRate, { crews: 2 })).toBe(160);
  });

  it("gives identical output for equivalent CREW and PERSON rates", () => {
    expect(effectiveOutputPerDay(crewRate, { crews: 3 })).toBe(
      effectiveOutputPerDay(personRate, { crews: 3 })
    );
  });

  it("honours a crew-size override on a PERSON-basis rate", () => {
    expect(effectiveOutputPerDay(personRate, { crews: 1, crewSize: 6 })).toBe(120);
  });
});

describe("duration from quantity", () => {
  it("matches the §11 worked example", () => {
    // 1,200 m² of AAC panel, 4 installers at 80 m²/day → 15 days.
    const d = durationFor(1200, crewRate, { crews: 1 });
    expect(d.durationDays).toBe(15);
  });

  it("recalculates when the quantity changes (§13)", () => {
    const before = durationFor(2400, { ...crewRate, outputPerDay: 100 }, { crews: 1 });
    const after = durationFor(3000, { ...crewRate, outputPerDay: 100 }, { crews: 1 });
    expect(before.durationDays).toBe(24);
    expect(after.durationDays).toBe(30);
  });

  it("halves duration when a second crew is added", () => {
    const one = durationFor(1200, crewRate, { crews: 1 });
    const two = durationFor(1200, crewRate, { crews: 2 });
    expect(one.durationDays).toBe(15);
    expect(two.durationDays).toBe(8); // ceil(1200/160)
  });

  it("never returns a zero-day duration for real work", () => {
    expect(durationFor(1, crewRate, { crews: 10 }).durationDays).toBe(1);
  });

  it("explains its derivation", () => {
    const d = durationFor(1200, crewRate, { crews: 1 });
    expect(d.explanation).toContain("1200 m2");
    expect(d.explanation).toContain("80 m2/day");
    expect(d.explanation).toContain("15 working days");
    expect(d.explanation).toContain("per crew of 4");
  });
});

describe("rate lookup (§42 — no invented rates)", () => {
  it("returns undefined for an unconfigured code rather than a default", () => {
    const lookup = buildRateLookup();
    expect(lookup("NOT_A_REAL_ACTIVITY")).toBeUndefined();
  });

  it("prefers a project override over the library default", () => {
    const lookup = buildRateLookup([
      { ...crewRate, code: "PLASTER", outputPerDay: 999 },
    ]);
    expect(lookup("PLASTER")!.outputPerDay).toBe(999);
  });

  it("every default rate declares a basis and a positive output", () => {
    for (const r of DEFAULT_RATES) {
      expect(["CREW", "PERSON"]).toContain(r.basis);
      expect(r.outputPerDay).toBeGreaterThan(0);
      expect(r.crewSize).toBeGreaterThan(0);
    }
  });
});

describe("quantity takeoff (§13)", () => {
  const geom = {
    grossFloorAreaSqm: 5940,
    numberOfFloors: 3,
    numberOfBuildings: 11,
    numberOfUnits: 11,
    numberOfBasements: 0,
  };

  it("computes per-building footprint and perimeter, not per-site", () => {
    const t = takeoff(geom);
    // 5940 / 11 buildings / 3 floors = 180 m² footprint each.
    expect(Math.round(t.footprintSqm)).toBe(180);
    expect(t.perimeterM).toBeGreaterThan(50);
    expect(t.perimeterM).toBeLessThan(60);
  });

  it("gives 11 small blocks more facade than one large block", () => {
    const many = takeoff(geom);
    const one = takeoff({ ...geom, numberOfBuildings: 1 });
    const manyWall = many.items.get("EXTERNAL_WALLS")!.quantity;
    const oneWall = one.items.get("EXTERNAL_WALLS")!.quantity;
    expect(manyWall).toBeGreaterThan(oneWall);
  });

  it("scales quantities with floor area", () => {
    const base = takeoff(geom);
    const double = takeoff({ ...geom, grossFloorAreaSqm: 11880 });
    expect(double.items.get("SCREED")!.quantity).toBe(
      base.items.get("SCREED")!.quantity * 2
    );
  });

  it("records auditable assumptions for every takeoff", () => {
    const t = takeoff(geom);
    expect(t.assumptions.length).toBeGreaterThan(3);
    expect(t.assumptions.join(" ")).toContain("Storey height");
  });

  it("produces a derivation string for every quantity", () => {
    const t = takeoff(geom);
    for (const item of t.items.values()) {
      expect(item.derivation.length).toBeGreaterThan(0);
      expect(item.quantity).toBeGreaterThan(0);
    }
  });
});

describe("end-to-end plausibility (§48 example)", () => {
  it("produces realistic durations for the residential development", () => {
    const t = takeoff({
      grossFloorAreaSqm: 5940,
      numberOfFloors: 3,
      numberOfBuildings: 11,
      numberOfUnits: 11,
      numberOfBasements: 0,
    });
    const lookup = buildRateLookup();

    const durations: Record<string, number> = {};
    for (const [code, item] of t.items) {
      const rate = lookup(code);
      if (!rate) continue;
      durations[code] = durationFor(item.quantity, rate, { crews: 2 }).durationDays;
    }

    // No single trade should run past a working year at this crew level. The
    // previous model returned 446 days for partitions alone on 3,564 m², an
    // implied 8 m²/day for the whole gang.
    for (const [code, days] of Object.entries(durations)) {
      expect(days, `${code} = ${days} days`).toBeLessThan(240);
      expect(days, `${code} = ${days} days`).toBeGreaterThan(0);
    }

    // Partitions are the specific regression: 5,049 m² at 45 m²/day per crew
    // with two crews is ~8 weeks, not 15 months.
    expect(durations.PARTITIONS).toBeLessThan(70);

    // Plastering legitimately dominates — 20,484 m² across both partition
    // faces, external inner faces and ceilings. At two crews that is ~171
    // days, which is why a planner would resource it more heavily.
    expect(durations.PLASTER).toBeGreaterThan(120);

    // Adding crews must shorten it proportionally.
    const plasterQty = t.items.get("PLASTER")!.quantity;
    const withSix = durationFor(plasterQty, lookup("PLASTER")!, { crews: 6 });
    expect(withSix.durationDays).toBeLessThan(60);
  });
});
