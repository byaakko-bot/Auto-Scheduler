// Procurement and logistics (§16–§18).
//
// Two modelling decisions drive everything here.
//
// 1. Logistics legs run on CALENDAR days. A container does not stop crossing
//    the Atlantic at the weekend, and a factory lead time quoted as "45 days"
//    is 45 calendar days. Construction activities run on WORKING days. Mixing
//    the two is a classic source of a fortnight's error, so the two spaces are
//    kept explicit and converted at the single point where they meet: the
//    delivery-to-installation handover.
//
// 2. A late delivery is NOT automatically a project delay. Whether it matters
//    depends on the float of the activity consuming the material (§17). An
//    item four days late into an activity with ten days of float costs the
//    project nothing; the same four days on the critical path costs four.

export type TransportMode =
  | "ROAD"
  | "SEA"
  | "RAIL"
  | "AIR"
  | "MULTIMODAL";

export type ProcurementLegKind =
  | "APPROVAL"
  | "PURCHASE_ORDER"
  | "PRODUCTION"
  | "LOADING"
  | "TRANSIT"
  | "CUSTOMS"
  | "DELIVERY";

export interface ProcurementLeg {
  kind: ProcurementLegKind;
  name: string;
  /** Duration in CALENDAR days. */
  days: number;
}

export interface ProcurementPackage {
  code: string;
  material: string;
  supplier?: string;
  origin?: string;
  destination?: string;
  transportMode?: TransportMode;
  /** Activity code that consumes this material. */
  consumingActivityCode: string;
  legs: ProcurementLeg[];
  /** Contingency held before the required-on-site date, in calendar days. */
  bufferDays: number;
  /**
   * Actual or forecast arrival, when known. Absent means "not yet ordered" —
   * the plan is then the only information available, and §42 forbids
   * inventing an ETA.
   */
  currentEtaDate?: Date;
}

export type ProcurementRisk =
  | "ON_TRACK"
  | "ABSORBED_BY_FREE_FLOAT"
  | "ABSORBED_BY_TOTAL_FLOAT"
  | "PROJECT_DELAY"
  | "NOT_ORDERED";

export interface DatedLeg extends ProcurementLeg {
  startDate: Date;
  endDate: Date;
}

export interface ProcurementSchedule {
  code: string;
  material: string;
  consumingActivityCode: string;
  /** Working-day date the material is needed on site. */
  requiredOnSiteDate: Date;
  /** Latest date the order can be placed and still arrive in time. */
  latestOrderDate: Date;
  /** Planned arrival, i.e. required-on-site less the buffer. */
  plannedArrivalDate: Date;
  totalLeadDays: number;
  bufferDays: number;
  legs: DatedLeg[];
  currentEtaDate?: Date;
  /** Positive = arriving after it is needed. */
  slipDays: number;
  risk: ProcurementRisk;
  /** Days of genuine project delay, after float is taken into account. */
  projectImpactDays: number;
  explanation: string;
}

export interface ConsumingActivity {
  code: string;
  /** Date the activity starts, i.e. when the material must be on site. */
  startDate: Date;
  totalFloatDays: number;
  freeFloatDays: number;
}

function addCalendarDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function totalLeadDays(pkg: ProcurementPackage): number {
  return pkg.legs.reduce((sum, l) => sum + Math.max(l.days, 0), 0);
}

/**
 * Schedules one procurement package backwards from the date the material is
 * needed on site (§16), then classifies the risk against the float of the
 * activity that consumes it (§17).
 */
export function scheduleProcurement(
  pkg: ProcurementPackage,
  consumer: ConsumingActivity
): ProcurementSchedule {
  const requiredOnSiteDate = consumer.startDate;
  const lead = totalLeadDays(pkg);

  // Buffer is held immediately before the need date, so the material is
  // planned to arrive early by exactly the contingency.
  const plannedArrivalDate = addCalendarDays(requiredOnSiteDate, -pkg.bufferDays);
  const latestOrderDate = addCalendarDays(plannedArrivalDate, -lead);

  // Walk the legs forward from the latest order date to give each a window.
  const legs: DatedLeg[] = [];
  let cursor = latestOrderDate;
  for (const leg of pkg.legs) {
    const startDate = cursor;
    const endDate = addCalendarDays(startDate, Math.max(leg.days, 0));
    legs.push({ ...leg, startDate, endDate });
    cursor = endDate;
  }

  const eta = pkg.currentEtaDate;
  const slipDays = eta ? daysBetween(requiredOnSiteDate, eta) : 0;

  let risk: ProcurementRisk;
  let projectImpactDays = 0;
  let explanation: string;

  if (!eta) {
    risk = "NOT_ORDERED";
    explanation =
      `No confirmed ETA. Order by ${latestOrderDate.toISOString().slice(0, 10)} ` +
      `to meet a required-on-site date of ${requiredOnSiteDate.toISOString().slice(0, 10)} ` +
      `(${lead} days lead + ${pkg.bufferDays} days buffer).`;
  } else if (slipDays <= 0) {
    risk = "ON_TRACK";
    explanation =
      `ETA ${eta.toISOString().slice(0, 10)} is ${Math.abs(slipDays)} day(s) ` +
      `before the required-on-site date.`;
  } else if (slipDays <= consumer.freeFloatDays) {
    risk = "ABSORBED_BY_FREE_FLOAT";
    explanation =
      `${slipDays} day(s) late, absorbed by ${consumer.freeFloatDays} day(s) of free float on ` +
      `${consumer.code}. No successor moves and the project finish is unaffected.`;
  } else if (slipDays <= consumer.totalFloatDays) {
    risk = "ABSORBED_BY_TOTAL_FLOAT";
    explanation =
      `${slipDays} day(s) late, within ${consumer.totalFloatDays} day(s) of total float on ` +
      `${consumer.code}. The project finish holds, but the float is consumed and ` +
      `${consumer.code} moves closer to critical.`;
  } else {
    risk = "PROJECT_DELAY";
    projectImpactDays = slipDays - Math.max(consumer.totalFloatDays, 0);
    explanation =
      `${slipDays} day(s) late against ${consumer.totalFloatDays} day(s) of float on ` +
      `${consumer.code} — ${projectImpactDays} day(s) of project delay.`;
  }

  return {
    code: pkg.code,
    material: pkg.material,
    consumingActivityCode: pkg.consumingActivityCode,
    requiredOnSiteDate,
    latestOrderDate,
    plannedArrivalDate,
    totalLeadDays: lead,
    bufferDays: pkg.bufferDays,
    legs,
    currentEtaDate: eta,
    slipDays,
    risk,
    projectImpactDays,
    explanation,
  };
}

export interface ProcurementReport {
  packages: ProcurementSchedule[];
  /** Worst genuine project impact across all packages. */
  worstProjectImpactDays: number;
  atRiskCount: number;
  notOrderedCount: number;
  /** Packages whose latest order date has already passed. */
  overdueOrders: ProcurementSchedule[];
}

export function buildProcurementReport(
  packages: ProcurementPackage[],
  consumers: Map<string, ConsumingActivity>,
  asOf: Date = new Date()
): ProcurementReport {
  const scheduled: ProcurementSchedule[] = [];

  for (const pkg of packages) {
    const consumer = consumers.get(pkg.consumingActivityCode);
    // Without the consuming activity there is no need date, so the package
    // cannot be scheduled. Skip rather than invent one.
    if (!consumer) continue;
    scheduled.push(scheduleProcurement(pkg, consumer));
  }

  scheduled.sort((a, b) => b.projectImpactDays - a.projectImpactDays);

  return {
    packages: scheduled,
    worstProjectImpactDays: scheduled.reduce(
      (max, p) => Math.max(max, p.projectImpactDays),
      0
    ),
    atRiskCount: scheduled.filter(
      (p) => p.risk === "PROJECT_DELAY" || p.risk === "ABSORBED_BY_TOTAL_FLOAT"
    ).length,
    notOrderedCount: scheduled.filter((p) => p.risk === "NOT_ORDERED").length,
    overdueOrders: scheduled.filter(
      (p) => p.risk === "NOT_ORDERED" && p.latestOrderDate < asOf
    ),
  };
}

// ─── Standard logistics chains (§18) ──────────────────────────────

/** Domestic road delivery: production then a short haul. */
export function roadChain(productionDays: number, transitDays = 3): ProcurementLeg[] {
  return [
    { kind: "PURCHASE_ORDER", name: "Purchase order & approval", days: 7 },
    { kind: "PRODUCTION", name: "Supplier production", days: productionDays },
    { kind: "LOADING", name: "Loading", days: 1 },
    { kind: "TRANSIT", name: "Road transit", days: transitDays },
    { kind: "DELIVERY", name: "Site delivery & offload", days: 1 },
  ];
}

/** Imported goods: production, port handling, sea freight, customs. */
export function seaFreightChain(
  productionDays: number,
  seaDays: number,
  customsDays = 5
): ProcurementLeg[] {
  return [
    { kind: "PURCHASE_ORDER", name: "Purchase order & approval", days: 10 },
    { kind: "PRODUCTION", name: "Supplier production", days: productionDays },
    { kind: "LOADING", name: "Haulage to port & loading", days: 3 },
    { kind: "TRANSIT", name: "Sea freight", days: seaDays },
    { kind: "CUSTOMS", name: "Customs clearance", days: customsDays },
    { kind: "DELIVERY", name: "Haulage to site & offload", days: 2 },
  ];
}

// ─── Default long-lead packages ───────────────────────────────────

export interface PackageSeed {
  code: string;
  material: string;
  consumingActivityCode: string;
  bufferDays: number;
  legs: ProcurementLeg[];
  transportMode: TransportMode;
}

/**
 * Long-lead items worth tracking for a given building type and method.
 * Deliberately conservative: only items that genuinely gate an activity are
 * seeded, because a procurement register full of noise gets ignored.
 */
export function defaultPackagesFor(
  buildingType: string,
  method: string
): PackageSeed[] {
  const industrial =
    buildingType === "INDUSTRIAL_WAREHOUSE" || buildingType === "INFRASTRUCTURE";

  if (industrial) {
    return [
      { code: "PKG-STEEL", material: "Structural steel frame", consumingActivityCode: "ST1", bufferDays: 10, transportMode: "ROAD", legs: roadChain(70, 4) },
      { code: "PKG-CLAD", material: "Insulated wall cladding", consumingActivityCode: "EN1", bufferDays: 7, transportMode: "ROAD", legs: roadChain(45, 3) },
      { code: "PKG-ROOF", material: "Roof sheeting & insulation", consumingActivityCode: "R1", bufferDays: 7, transportMode: "ROAD", legs: roadChain(45, 3) },
      { code: "PKG-DOORS", material: "Industrial doors & dock levellers", consumingActivityCode: "W1", bufferDays: 5, transportMode: "ROAD", legs: roadChain(56, 3) },
      { code: "PKG-MEP", material: "MEP & sprinkler equipment", consumingActivityCode: "MEP1", bufferDays: 10, transportMode: "ROAD", legs: roadChain(60, 3) },
    ];
  }

  const envelope: PackageSeed[] =
    method === "AAC_PANELS" || method === "AAC_BLOCKS"
      ? [
          {
            code: "PKG-AAC",
            material: method === "AAC_PANELS" ? "AAC wall panels" : "AAC blocks",
            consumingActivityCode: "EN1",
            bufferDays: 14,
            transportMode: "SEA",
            legs: seaFreightChain(40, 18, 5),
          },
        ]
      : method === "PRECAST_CONCRETE"
      ? [
          {
            code: "PKG-PRECAST",
            material: "Precast concrete panels",
            consumingActivityCode: "EN1",
            bufferDays: 10,
            transportMode: "ROAD",
            legs: roadChain(60, 4),
          },
        ]
      : [];

  return [
    { code: "PKG-REBAR", material: "Reinforcement steel", consumingActivityCode: "ST1", bufferDays: 7, transportMode: "ROAD", legs: roadChain(28, 3) },
    ...envelope,
    { code: "PKG-WIN", material: "Windows & external doors", consumingActivityCode: "W1", bufferDays: 5, transportMode: "ROAD", legs: roadChain(45, 7) },
    { code: "PKG-MEP", material: "MEP equipment", consumingActivityCode: "MEP1", bufferDays: 10, transportMode: "ROAD", legs: roadChain(45, 3) },
  ];
}
