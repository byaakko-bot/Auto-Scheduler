import type { ConstructionMethod, ProductivityRates } from "./types";

// Appendix B — phase colour coding (hex).
export const PHASE_COLORS: Record<string, string> = {
  DESIGN: "#6366F1",
  PERMITS: "#8B5CF6",
  PROCUREMENT: "#F59E0B",
  SITE_PREP: "#6B7280",
  EARTHWORKS: "#92400E",
  FOUNDATIONS: "#B45309",
  STRUCTURE: "#DC2626",
  ENVELOPE: "#D97706",
  ROOF: "#059669",
  FACADE: "#0891B2",
  WINDOWS_DOORS: "#0284C7",
  MEP_ROUGH: "#7C3AED",
  PARTITIONS: "#CA8A04",
  PLASTERING: "#16A34A",
  SCREED_FLOORS: "#15803D",
  FINISHING: "#2563EB",
  EXTERNAL_WORKS: "#4B5563",
  INSPECTIONS: "#EF4444",
  COMMISSIONING: "#F97316",
  HANDOVER: "#10B981",
};

export function phaseColor(phase: string): string {
  return PHASE_COLORS[phase] ?? "#64748B";
}

// Appendix A — construction method modifiers.
export interface MethodModifier {
  structureDurationFactor: number;
  floatBufferPct: number;
}

export const METHOD_MODIFIERS: Record<ConstructionMethod, MethodModifier> = {
  REINFORCED_CONCRETE: { structureDurationFactor: 1.0, floatBufferPct: 0.1 },
  MASONRY_BLOCKWORK: { structureDurationFactor: 0.85, floatBufferPct: 0.08 },
  STEEL_FRAME: { structureDurationFactor: 0.7, floatBufferPct: 0.12 },
  TIMBER_FRAME: { structureDurationFactor: 0.6, floatBufferPct: 0.08 },
  PRECAST_CONCRETE: { structureDurationFactor: 0.65, floatBufferPct: 0.15 },
  MODULAR: { structureDurationFactor: 0.5, floatBufferPct: 0.2 },
  AAC_PANELS: { structureDurationFactor: 0.75, floatBufferPct: 0.1 },
  AAC_BLOCKS: { structureDurationFactor: 0.8, floatBufferPct: 0.08 },
  HYBRID: { structureDurationFactor: 0.72, floatBufferPct: 0.12 },
};

/**
 * Irreducible structural cycle time per floor, in working days.
 *
 * A multi-storey frame is built floor by floor: formwork, reinforcement,
 * pour, CURE, strike. Curing is a chemical process — no number of crews
 * shortens it, and the floor above cannot start until the floor below is
 * struck. Sizing the structure from pour capacity alone produces a 5-storey
 * frame in a week, which is why this floor exists.
 *
 * Methods that avoid wet concrete on site are correspondingly faster.
 */
export const STRUCTURE_CYCLE_DAYS_PER_FLOOR: Record<ConstructionMethod, number> = {
  REINFORCED_CONCRETE: 10, // formwork + rebar + pour + 7-day cure + strike
  MASONRY_BLOCKWORK: 8,
  AAC_BLOCKS: 8, // RC frame with AAC infill still cures
  AAC_PANELS: 7,
  HYBRID: 7,
  PRECAST_CONCRETE: 5, // cured off site; erection and stitching only
  TIMBER_FRAME: 4,
  STEEL_FRAME: 4, // erection and bolting, no cure
  MODULAR: 3,
};

/** Activities governed by a repeating cycle rather than by labour applied. */
export const CYCLE_CONSTRAINED_ACTIVITIES = new Set(["ST1"]);

/**
 * Irreducible duration for a cycle-governed activity, in working days.
 * Shared by the duration calculator and the recovery planner so recovery can
 * never promise a saving the generator would refuse to deliver.
 */
export function cycleFloorDays(
  activityCode: string,
  method: ConstructionMethod,
  numberOfFloors: number
): number {
  if (!CYCLE_CONSTRAINED_ACTIVITIES.has(activityCode)) return 0;
  return Math.max(numberOfFloors, 1) * (STRUCTURE_CYCLE_DAYS_PER_FLOOR[method] ?? 0);
}

export const DEFAULT_PRODUCTIVITY: ProductivityRates = {
  foundationM3PerDay: 15,
  structureFloorDays: 21,
  masonryM2PerDay: 8,
  plasteringM2PerDay: 40,
  flooringM2PerDay: 35,
  mepRoughInDaysPerFloor: 10,
  paintingM2PerDay: 60,
};

// Phase ordering used for stable sort order in the WBS.
export const PHASE_ORDER: string[] = [
  "DESIGN",
  "PERMITS",
  "PROCUREMENT",
  "SITE_PREP",
  "EARTHWORKS",
  "FOUNDATIONS",
  "STRUCTURE",
  "ENVELOPE",
  "ROOF",
  "FACADE",
  "WINDOWS_DOORS",
  "MEP_ROUGH",
  "PARTITIONS",
  "PLASTERING",
  "SCREED_FLOORS",
  "FINISHING",
  "EXTERNAL_WORKS",
  "INSPECTIONS",
  "COMMISSIONING",
  "HANDOVER",
];
