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
