import { describe, expect, it } from "vitest";
import {
  buildProcurementReport,
  roadChain,
  scheduleProcurement,
  seaFreightChain,
  totalLeadDays,
  type ConsumingActivity,
  type ProcurementPackage,
  defaultPackagesFor,
} from "../procurement";

const iso = (d: Date) => d.toISOString().slice(0, 10);

function consumer(
  code: string,
  startDate: string,
  totalFloatDays = 0,
  freeFloatDays = 0
): ConsumingActivity {
  return {
    code,
    startDate: new Date(`${startDate}T00:00:00.000Z`),
    totalFloatDays,
    freeFloatDays,
  };
}

describe("§16 — backward scheduling from site need", () => {
  // Window installation required 15 October; 45-day lead, 7-day shipping,
  // 5-day buffer → latest PO date 19 August.
  const windows: ProcurementPackage = {
    code: "PKG-WIN",
    material: "Windows & external doors",
    consumingActivityCode: "W1",
    bufferDays: 5,
    legs: [
      { kind: "PRODUCTION", name: "Supplier production", days: 45 },
      { kind: "TRANSIT", name: "Shipping", days: 7 },
    ],
  };

  it("computes the latest order date backwards from the need date", () => {
    const s = scheduleProcurement(windows, consumer("W1", "2027-10-15"));
    expect(s.totalLeadDays).toBe(52);
    expect(iso(s.plannedArrivalDate)).toBe("2027-10-10"); // 15 Oct less 5-day buffer
    expect(iso(s.latestOrderDate)).toBe("2027-08-19"); // 10 Oct less 52 days
  });

  it("gives every logistics leg a dated window", () => {
    const s = scheduleProcurement(windows, consumer("W1", "2027-10-15"));
    expect(s.legs).toHaveLength(2);
    expect(iso(s.legs[0].startDate)).toBe("2027-08-19");
    expect(iso(s.legs[0].endDate)).toBe("2027-10-03"); // +45 days
    expect(iso(s.legs[1].endDate)).toBe("2027-10-10"); // +7 days
  });

  it("pushes the order earlier as the buffer grows", () => {
    const relaxed = scheduleProcurement(
      { ...windows, bufferDays: 20 },
      consumer("W1", "2027-10-15")
    );
    expect(iso(relaxed.latestOrderDate)).toBe("2027-08-04");
  });

  it("reports NOT_ORDERED rather than inventing an ETA (§42)", () => {
    const s = scheduleProcurement(windows, consumer("W1", "2027-10-15"));
    expect(s.risk).toBe("NOT_ORDERED");
    expect(s.currentEtaDate).toBeUndefined();
    expect(s.explanation).toContain("No confirmed ETA");
  });
});

describe("§17 — a late delivery is only a delay if float cannot absorb it", () => {
  const base: ProcurementPackage = {
    code: "PKG-AAC",
    material: "AAC panels",
    consumingActivityCode: "EN1",
    bufferDays: 0,
    legs: [{ kind: "PRODUCTION", name: "Production", days: 30 }],
    currentEtaDate: new Date("2027-10-19T00:00:00.000Z"),
  };
  // Required 15 October, ETA 19 October → four days late.

  it("is ON_TRACK when the ETA beats the need date", () => {
    const early = {
      ...base,
      currentEtaDate: new Date("2027-10-10T00:00:00.000Z"),
    };
    const s = scheduleProcurement(early, consumer("EN1", "2027-10-15", 0, 0));
    expect(s.risk).toBe("ON_TRACK");
    expect(s.projectImpactDays).toBe(0);
  });

  it("costs the project nothing when free float covers the slip", () => {
    const s = scheduleProcurement(base, consumer("EN1", "2027-10-15", 10, 10));
    expect(s.slipDays).toBe(4);
    expect(s.risk).toBe("ABSORBED_BY_FREE_FLOAT");
    expect(s.projectImpactDays).toBe(0);
  });

  it("holds the finish but consumes float when only total float covers it", () => {
    const s = scheduleProcurement(base, consumer("EN1", "2027-10-15", 10, 0));
    expect(s.risk).toBe("ABSORBED_BY_TOTAL_FLOAT");
    expect(s.projectImpactDays).toBe(0);
    expect(s.explanation).toContain("float is consumed");
  });

  it("delays the project only by the excess over total float", () => {
    const s = scheduleProcurement(base, consumer("EN1", "2027-10-15", 1, 0));
    expect(s.slipDays).toBe(4);
    expect(s.risk).toBe("PROJECT_DELAY");
    expect(s.projectImpactDays).toBe(3); // 4 late less 1 day of float
  });

  it("passes the full slip through on the critical path", () => {
    const s = scheduleProcurement(base, consumer("EN1", "2027-10-15", 0, 0));
    expect(s.risk).toBe("PROJECT_DELAY");
    expect(s.projectImpactDays).toBe(4);
  });

  it("never reports negative project impact from negative float", () => {
    const s = scheduleProcurement(base, consumer("EN1", "2027-10-15", -5, 0));
    expect(s.projectImpactDays).toBe(4);
  });
});

describe("§18 — logistics chains", () => {
  it("builds an import chain with production, freight and customs", () => {
    const legs = seaFreightChain(40, 18, 5);
    expect(totalLeadDays({ legs } as never)).toBe(10 + 40 + 3 + 18 + 5 + 2);
    expect(legs.map((l) => l.kind)).toContain("CUSTOMS");
  });

  it("a domestic road chain is materially shorter than an import", () => {
    const road = totalLeadDays({ legs: roadChain(40) } as never);
    const sea = totalLeadDays({ legs: seaFreightChain(40, 18) } as never);
    expect(road).toBeLessThan(sea);
  });

  it("dates an Oldenburg to Tarragona sea freight chain end to end", () => {
    const pkg: ProcurementPackage = {
      code: "PKG-PANEL",
      material: "AAC panels",
      supplier: "Wehrhahn",
      origin: "Oldenburg",
      destination: "Tarragona",
      transportMode: "SEA",
      consumingActivityCode: "EN1",
      bufferDays: 10,
      legs: seaFreightChain(40, 18, 5),
    };
    const s = scheduleProcurement(pkg, consumer("EN1", "2028-03-01"));
    expect(s.totalLeadDays).toBe(78);
    expect(iso(s.plannedArrivalDate)).toBe("2028-02-20");
    expect(iso(s.latestOrderDate)).toBe("2027-12-04");
    // The chain must run contiguously from order to delivery.
    expect(iso(s.legs[0].startDate)).toBe(iso(s.latestOrderDate));
    expect(iso(s.legs.at(-1)!.endDate)).toBe(iso(s.plannedArrivalDate));
  });
});

describe("procurement report", () => {
  const consumers = new Map([
    ["W1", consumer("W1", "2027-10-15", 0, 0)],
    ["EN1", consumer("EN1", "2027-09-01", 20, 20)],
  ]);

  const packages: ProcurementPackage[] = [
    {
      code: "PKG-WIN",
      material: "Windows",
      consumingActivityCode: "W1",
      bufferDays: 5,
      legs: roadChain(45),
      currentEtaDate: new Date("2027-10-25T00:00:00.000Z"), // 10 days late, no float
    },
    {
      code: "PKG-AAC",
      material: "AAC panels",
      consumingActivityCode: "EN1",
      bufferDays: 5,
      legs: seaFreightChain(40, 18),
      currentEtaDate: new Date("2027-09-08T00:00:00.000Z"), // 7 late, 20 float
    },
    {
      code: "PKG-ORPHAN",
      material: "Unlinked material",
      consumingActivityCode: "DOES_NOT_EXIST",
      bufferDays: 0,
      legs: roadChain(10),
    },
  ];

  it("ranks genuine project impact above absorbed slippage", () => {
    const r = buildProcurementReport(packages, consumers);
    expect(r.packages[0].code).toBe("PKG-WIN");
    expect(r.worstProjectImpactDays).toBe(10);
  });

  it("counts the float-absorbed item as at risk but not as a delay", () => {
    const r = buildProcurementReport(packages, consumers);
    const aac = r.packages.find((p) => p.code === "PKG-AAC")!;
    expect(aac.projectImpactDays).toBe(0);
    expect(aac.risk).toBe("ABSORBED_BY_FREE_FLOAT");
  });

  it("skips packages with no consuming activity rather than guessing", () => {
    const r = buildProcurementReport(packages, consumers);
    expect(r.packages.find((p) => p.code === "PKG-ORPHAN")).toBeUndefined();
    expect(r.packages).toHaveLength(2);
  });

  it("flags orders whose latest order date has already passed", () => {
    const notOrdered: ProcurementPackage[] = [
      {
        code: "PKG-LATE",
        material: "Steel frame",
        consumingActivityCode: "W1",
        bufferDays: 0,
        legs: roadChain(120),
      },
    ];
    const r = buildProcurementReport(
      notOrdered,
      consumers,
      new Date("2027-08-01T00:00:00.000Z")
    );
    expect(r.notOrderedCount).toBe(1);
    expect(r.overdueOrders).toHaveLength(1);
  });
});

describe("default long-lead packages", () => {
  it("seeds steel, cladding and roof for an industrial shed", () => {
    const seeds = defaultPackagesFor("INDUSTRIAL_WAREHOUSE", "STEEL_FRAME");
    const codes = seeds.map((s) => s.code);
    expect(codes).toContain("PKG-STEEL");
    expect(codes).toContain("PKG-CLAD");
    expect(codes).not.toContain("PKG-AAC");
  });

  it("adds an imported AAC package with a customs leg for AAC panels", () => {
    const seeds = defaultPackagesFor("RESIDENTIAL_APARTMENT", "AAC_PANELS");
    const aac = seeds.find((s) => s.code === "PKG-AAC")!;
    expect(aac).toBeDefined();
    expect(aac.transportMode).toBe("SEA");
    expect(aac.legs.map((l) => l.kind)).toContain("CUSTOMS");
  });

  it("omits an envelope package for plain reinforced concrete", () => {
    const seeds = defaultPackagesFor("RESIDENTIAL_APARTMENT", "REINFORCED_CONCRETE");
    expect(seeds.find((s) => s.code === "PKG-AAC")).toBeUndefined();
    expect(seeds.map((s) => s.code)).toContain("PKG-REBAR");
  });

  it("every seed links to an activity and carries a complete chain", () => {
    for (const bt of ["INDUSTRIAL_WAREHOUSE", "RESIDENTIAL_APARTMENT"]) {
      for (const m of ["STEEL_FRAME", "AAC_PANELS", "REINFORCED_CONCRETE"]) {
        for (const s of defaultPackagesFor(bt, m)) {
          expect(s.consumingActivityCode).toBeTruthy();
          expect(s.legs.length).toBeGreaterThan(2);
          expect(totalLeadDays({ legs: s.legs } as never)).toBeGreaterThan(0);
        }
      }
    }
  });
});
