// Productivity library (§12) and the crew/duration formula (§11).
//
// The critical modelling decision here is `basis`. A published productivity
// figure is ambiguous — "80 m²/day" may describe one worker or a whole gang —
// and conflating the two is how schedules end up an order of magnitude wrong.
// Every rate therefore states which it is, and the duration formula multiplies
// by crew size EXACTLY ONCE, and only when the rate is per-person.

import type { QuantityUnit } from "./quantities";

export type ProductivityBasis = "CREW" | "PERSON";

export interface ProductivityRate {
  /** Stable identifier, referenced by activity templates. */
  code: string;
  name: string;
  unit: QuantityUnit;
  /** Size of the reference crew the rate was measured against. */
  crewSize: number;
  /**
   * Output per working day. When basis is CREW this is the output of the whole
   * reference crew; when PERSON it is the output of a single worker.
   */
  outputPerDay: number;
  basis: ProductivityBasis;
  /** Where the figure came from, so an estimator can audit it. */
  source?: string;
}

export interface CrewAssignment {
  /** How many crews of the reference size are assigned. */
  crews: number;
  /** Optional override of the reference crew size. */
  crewSize?: number;
}

export interface DurationBreakdown {
  durationDays: number;
  quantity: number;
  unit: QuantityUnit;
  rateCode: string;
  effectiveOutputPerDay: number;
  crews: number;
  crewSize: number;
  basis: ProductivityBasis;
  /** Human-readable derivation, surfaced in the UI so a date is explainable. */
  explanation: string;
}

/**
 * Effective daily output for an assignment.
 *
 * CREW basis   → outputPerDay is already a full-crew figure, so it scales by
 *                the NUMBER OF CREWS only. Scaling by headcount as well is the
 *                double-count §11 warns about.
 * PERSON basis → outputPerDay is per worker, so it scales by total headcount.
 */
export function effectiveOutputPerDay(
  rate: ProductivityRate,
  assignment: CrewAssignment
): number {
  const crews = Math.max(assignment.crews, 1);
  if (rate.basis === "CREW") return rate.outputPerDay * crews;
  const crewSize = assignment.crewSize ?? rate.crewSize;
  return rate.outputPerDay * crewSize * crews;
}

/**
 * Duration for a quantity of work. Returns the full derivation rather than a
 * bare number so the UI can explain where a date came from (§"every schedule
 * date must be explainable").
 */
export function durationFor(
  quantity: number,
  rate: ProductivityRate,
  assignment: CrewAssignment
): DurationBreakdown {
  const output = effectiveOutputPerDay(rate, assignment);
  const crews = Math.max(assignment.crews, 1);
  const crewSize = assignment.crewSize ?? rate.crewSize;
  const durationDays = output > 0 ? Math.max(1, Math.ceil(quantity / output)) : 1;

  const basisNote =
    rate.basis === "CREW"
      ? `${rate.outputPerDay} ${rate.unit}/day per crew of ${rate.crewSize} × ${crews} crew(s)`
      : `${rate.outputPerDay} ${rate.unit}/day per person × ${crewSize} × ${crews} crew(s)`;

  return {
    durationDays,
    quantity,
    unit: rate.unit,
    rateCode: rate.code,
    effectiveOutputPerDay: output,
    crews,
    crewSize,
    basis: rate.basis,
    explanation:
      `${Math.round(quantity)} ${rate.unit} ÷ ${output} ${rate.unit}/day ` +
      `= ${durationDays} working days (${basisNote})`,
  };
}

// ─── Default library ──────────────────────────────────────────────
//
// Whole-crew daily outputs for typical European residential work. These are
// starting points a planner is expected to override per project — they are
// stated on a CREW basis because that is how site output is actually measured.

export const DEFAULT_RATES: ProductivityRate[] = [
  { code: "EXCAVATION", name: "Bulk excavation", unit: "m3", crewSize: 3, outputPerDay: 150, basis: "CREW", source: "Machine + banksman" },
  { code: "BLINDING", name: "Blinding concrete", unit: "m3", crewSize: 4, outputPerDay: 60, basis: "CREW" },
  { code: "REBAR", name: "Reinforcement fixing", unit: "ton", crewSize: 5, outputPerDay: 1.5, basis: "CREW" },
  { code: "FORMWORK", name: "Formwork erect/strike", unit: "m2", crewSize: 6, outputPerDay: 60, basis: "CREW" },
  { code: "CONCRETE_FOUND", name: "Foundation concrete", unit: "m3", crewSize: 6, outputPerDay: 30, basis: "CREW" },
  { code: "CONCRETE_SLAB", name: "Suspended slab concrete", unit: "m3", crewSize: 8, outputPerDay: 80, basis: "CREW" },
  { code: "WATERPROOFING", name: "Tanking / waterproofing", unit: "m2", crewSize: 3, outputPerDay: 120, basis: "CREW" },

  { code: "MASONRY_BLOCK", name: "Blockwork masonry", unit: "m2", crewSize: 4, outputPerDay: 25, basis: "CREW" },
  { code: "AAC_BLOCK", name: "AAC block walling", unit: "m2", crewSize: 4, outputPerDay: 40, basis: "CREW" },
  { code: "AAC_PANEL", name: "AAC panel installation", unit: "m2", crewSize: 4, outputPerDay: 80, basis: "CREW" },
  { code: "PRECAST_ERECT", name: "Precast panel erection", unit: "m2", crewSize: 5, outputPerDay: 120, basis: "CREW" },
  { code: "STEEL_ERECT", name: "Structural steel erection", unit: "ton", crewSize: 5, outputPerDay: 8, basis: "CREW" },

  { code: "ROOFING", name: "Roof covering", unit: "m2", crewSize: 4, outputPerDay: 80, basis: "CREW" },
  { code: "FACADE", name: "Facade / render", unit: "m2", crewSize: 4, outputPerDay: 45, basis: "CREW" },
  { code: "WINDOWS", name: "Window installation", unit: "ea", crewSize: 3, outputPerDay: 12, basis: "CREW" },

  { code: "MEP_ROUGH", name: "MEP first fix", unit: "m2", crewSize: 6, outputPerDay: 200, basis: "CREW" },
  { code: "MEP_FINAL", name: "MEP second fix", unit: "m2", crewSize: 6, outputPerDay: 250, basis: "CREW" },

  { code: "PARTITIONS", name: "Internal partitions", unit: "m2", crewSize: 4, outputPerDay: 45, basis: "CREW" },
  { code: "PLASTER", name: "Plastering", unit: "m2", crewSize: 4, outputPerDay: 60, basis: "CREW" },
  { code: "SCREED", name: "Floor screed", unit: "m2", crewSize: 4, outputPerDay: 120, basis: "CREW" },
  { code: "TILING", name: "Tiling", unit: "m2", crewSize: 4, outputPerDay: 35, basis: "CREW" },
  { code: "PAINTING", name: "Painting", unit: "m2", crewSize: 3, outputPerDay: 150, basis: "CREW" },
  { code: "JOINERY", name: "Joinery / fit-out", unit: "m2", crewSize: 4, outputPerDay: 40, basis: "CREW" },
  { code: "EXTERNAL_WORKS", name: "External works", unit: "m2", crewSize: 5, outputPerDay: 100, basis: "CREW" },
];

const BY_CODE = new Map(DEFAULT_RATES.map((r) => [r.code, r]));

export function rateFor(code: string): ProductivityRate | undefined {
  return BY_CODE.get(code);
}

/**
 * Builds a lookup that prefers project-specific overrides and falls back to the
 * default library. Returns undefined for unknown codes rather than inventing a
 * rate — §42 requires "not configured" over a fabricated number.
 */
export function buildRateLookup(
  overrides: ProductivityRate[] = []
): (code: string) => ProductivityRate | undefined {
  const merged = new Map(BY_CODE);
  for (const r of overrides) merged.set(r.code, r);
  return (code: string) => merged.get(code);
}
