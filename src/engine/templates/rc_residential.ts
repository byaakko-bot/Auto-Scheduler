import type { TaskTemplate } from "../types";

// Reinforced-concrete residential template.
// Predecessors reference other task `code`s in this same template.
export const RC_RESIDENTIAL: TaskTemplate[] = [
  // ── DESIGN ────────────────────────────────────────────────
  { code: "D1", name: "Schematic Design", phase: "DESIGN", durationFormula: "SCHEMATIC_DESIGN", predecessors: [] },
  { code: "D2", name: "Structural Design", phase: "DESIGN", durationFormula: "DETAILED_DESIGN", predecessors: [{ code: "D1", type: "FS", lag: 0 }] },
  { code: "D3", name: "MEP Design", phase: "DESIGN", durationFormula: "MEP_DESIGN", predecessors: [{ code: "D1", type: "FS", lag: 0 }] },
  { code: "D4", name: "Interior Design", phase: "DESIGN", durationFormula: "INTERIOR_DESIGN", predecessors: [{ code: "D1", type: "FS", lag: 0 }] },
  { code: "M_DESIGN", name: "Design Complete", phase: "DESIGN", durationFormula: "FIXED", defaultDays: 0, isMilestone: true, predecessors: [{ code: "D2", type: "FS", lag: 0 }, { code: "D3", type: "FS", lag: 0 }, { code: "D4", type: "FS", lag: 0 }] },

  // ── PERMITS ───────────────────────────────────────────────
  // Planning consent concerns use and massing, so it follows concept design
  // and runs in parallel with detailed design. The building permit needs the
  // structural package as well as planning consent.
  { code: "P1", name: "Planning Permit", phase: "PERMITS", durationFormula: "PERMIT_APPROVAL", predecessors: [{ code: "D1", type: "FS", lag: 0 }] },
  { code: "P2", name: "Building Permit", phase: "PERMITS", durationFormula: "BUILDING_PERMIT", predecessors: [{ code: "P1", type: "FS", lag: 0 }, { code: "D2", type: "FS", lag: 0 }] },
  { code: "M_PERMITS", name: "All Permits Approved", phase: "PERMITS", durationFormula: "FIXED", defaultDays: 0, isMilestone: true, predecessors: [{ code: "P2", type: "FS", lag: 0 }] },

  // ── PROCUREMENT (long-lead, runs in parallel) ─────────────
  { code: "PR1", name: "Structural Steel / Rebar", phase: "PROCUREMENT", durationFormula: "PROCUREMENT_STRUCTURE", predecessors: [{ code: "D2", type: "FS", lag: 0 }] },
  { code: "PR2", name: "MEP Equipment", phase: "PROCUREMENT", durationFormula: "PROCUREMENT_MEP", predecessors: [{ code: "D3", type: "FS", lag: 0 }] },
  { code: "PR3", name: "Windows & Doors", phase: "PROCUREMENT", durationFormula: "PROCUREMENT_WINDOWS", predecessors: [{ code: "D4", type: "FS", lag: 0 }] },

  // ── SITE PREP ─────────────────────────────────────────────
  { code: "S1", name: "Site Setup & Hoarding", phase: "SITE_PREP", durationFormula: "SITE_SETUP", predecessors: [{ code: "P1", type: "FS", lag: 0 }] },

  // ── EARTHWORKS ────────────────────────────────────────────
  { code: "E1", name: "Excavation & Earthworks", phase: "EARTHWORKS", durationFormula: "EARTHWORKS", quantityUnit: "m3", predecessors: [{ code: "S1", type: "FS", lag: 0 }] },

  // ── FOUNDATIONS ───────────────────────────────────────────
  { code: "F1", name: "Foundations & Raft Slab", phase: "FOUNDATIONS", durationFormula: "FOUNDATIONS", quantityUnit: "m3", predecessors: [{ code: "E1", type: "FS", lag: 0 }, { code: "P2", type: "FS", lag: 0 }] },
  { code: "F2", name: "Basement Walls", phase: "FOUNDATIONS", durationFormula: "BASEMENT_WALLS", predecessors: [{ code: "F1", type: "FS", lag: 0 }] },
  { code: "F3", name: "Basement Waterproofing", phase: "FOUNDATIONS", durationFormula: "WATERPROOFING", predecessors: [{ code: "F2", type: "FS", lag: 0 }] },

  // ── STRUCTURE ─────────────────────────────────────────────
  { code: "ST1", name: "Superstructure (all floors)", phase: "STRUCTURE", durationFormula: "TOTAL_STRUCTURE", quantityUnit: "floors", predecessors: [{ code: "F2", type: "FS", lag: 0 }, { code: "PR1", type: "FS", lag: 0 }] },
  { code: "ST2", name: "Roof Slab", phase: "STRUCTURE", durationFormula: "ROOF_SLAB", predecessors: [{ code: "ST1", type: "FS", lag: 0 }] },
  { code: "M_TOPOUT", name: "Structure Topped Out", phase: "STRUCTURE", durationFormula: "FIXED", defaultDays: 0, isMilestone: true, predecessors: [{ code: "ST2", type: "FS", lag: 0 }] },

  // ── ENVELOPE ──────────────────────────────────────────────
  { code: "EN1", name: "External Blockwork", phase: "ENVELOPE", durationFormula: "EXTERNAL_WALLS", quantityUnit: "m2", predecessors: [{ code: "ST1", type: "SS", lag: 10 }] },

  // ── ROOF ──────────────────────────────────────────────────
  { code: "R1", name: "Roof Waterproofing & Insulation", phase: "ROOF", durationFormula: "ROOF", quantityUnit: "m2", predecessors: [{ code: "ST2", type: "FS", lag: 0 }] },

  // ── FACADE ────────────────────────────────────────────────
  { code: "FA1", name: "External Render / Cladding", phase: "FACADE", durationFormula: "FACADE", quantityUnit: "m2", predecessors: [{ code: "EN1", type: "FS", lag: 0 }] },

  // ── WINDOWS & DOORS ───────────────────────────────────────
  { code: "W1", name: "Install Windows & External Doors", phase: "WINDOWS_DOORS", durationFormula: "WINDOWS_DOORS", predecessors: [{ code: "FA1", type: "FS", lag: 0 }, { code: "PR3", type: "FS", lag: 0 }] },
  { code: "M_WATERTIGHT", name: "Building Watertight", phase: "WINDOWS_DOORS", durationFormula: "FIXED", defaultDays: 0, isMilestone: true, predecessors: [{ code: "W1", type: "FS", lag: 0 }, { code: "R1", type: "FS", lag: 0 }] },

  // ── MEP ROUGH-IN ──────────────────────────────────────────
  { code: "MEP1", name: "MEP Rough-in", phase: "MEP_ROUGH", durationFormula: "MEP_ROUGH_IN", predecessors: [{ code: "ST1", type: "SS", lag: 15 }, { code: "PR2", type: "FS", lag: 0 }] },

  // ── PARTITIONS ────────────────────────────────────────────
  { code: "PA1", name: "Internal Partitions", phase: "PARTITIONS", durationFormula: "INTERNAL_PARTITIONS", quantityUnit: "m2", predecessors: [{ code: "ST2", type: "FS", lag: 0 }] },

  // ── PLASTERING ────────────────────────────────────────────
  { code: "PL1", name: "Internal Plastering", phase: "PLASTERING", durationFormula: "PLASTERING", quantityUnit: "m2", predecessors: [{ code: "PA1", type: "FS", lag: 5 }, { code: "MEP1", type: "FS", lag: 0 }] },

  // ── SCREED ────────────────────────────────────────────────
  { code: "SC1", name: "Floor Screed", phase: "SCREED_FLOORS", durationFormula: "SCREED_FLOORS", quantityUnit: "m2", predecessors: [{ code: "PA1", type: "FS", lag: 7 }] },

  // ── FINISHING ─────────────────────────────────────────────
  { code: "FN1", name: "Tiling", phase: "FINISHING", durationFormula: "FINISHING", predecessors: [{ code: "SC1", type: "FS", lag: 0 }, { code: "PL1", type: "FS", lag: 0 }] },
  { code: "FN2", name: "Joinery & Kitchens", phase: "FINISHING", durationFormula: "FIXED", defaultDays: 35, predecessors: [{ code: "FN1", type: "FS", lag: 0 }] },
  { code: "FN3", name: "Painting", phase: "FINISHING", durationFormula: "PAINTING", quantityUnit: "m2", predecessors: [{ code: "PL1", type: "FS", lag: 0 }] },
  { code: "FN4", name: "Sanitaryware", phase: "FINISHING", durationFormula: "FIXED", defaultDays: 14, predecessors: [{ code: "FN2", type: "FS", lag: 0 }] },
  { code: "FN5", name: "MEP Final Fix", phase: "FINISHING", durationFormula: "FIXED", defaultDays: 21, predecessors: [{ code: "MEP1", type: "FS", lag: 0 }, { code: "FN3", type: "FS", lag: 0 }] },

  // ── EXTERNAL WORKS ────────────────────────────────────────
  { code: "EX1", name: "Paving & Landscaping", phase: "EXTERNAL_WORKS", durationFormula: "EXTERNAL_WORKS", predecessors: [{ code: "FA1", type: "FS", lag: 0 }, { code: "F3", type: "FS", lag: 0 }] },

  // ── INSPECTIONS ───────────────────────────────────────────
  { code: "IN1", name: "MEP Inspections", phase: "INSPECTIONS", durationFormula: "INSPECTION", predecessors: [{ code: "FN5", type: "FS", lag: 0 }] },
  { code: "IN2", name: "Building Control Final", phase: "INSPECTIONS", durationFormula: "INSPECTION", predecessors: [{ code: "IN1", type: "FS", lag: 0 }, { code: "FN4", type: "FS", lag: 0 }, { code: "EX1", type: "FS", lag: 0 }] },

  // ── COMMISSIONING ─────────────────────────────────────────
  { code: "CM1", name: "Systems Commissioning", phase: "COMMISSIONING", durationFormula: "COMMISSIONING", predecessors: [{ code: "IN2", type: "FS", lag: 0 }] },

  // ── HANDOVER ──────────────────────────────────────────────
  { code: "HO1", name: "Snagging", phase: "HANDOVER", durationFormula: "FIXED", defaultDays: 7, predecessors: [{ code: "CM1", type: "FS", lag: 0 }] },
  { code: "HO2", name: "Final Handover", phase: "HANDOVER", durationFormula: "HANDOVER", predecessors: [{ code: "HO1", type: "FS", lag: 0 }] },
  { code: "M_COMPLETE", name: "Practical Completion", phase: "HANDOVER", durationFormula: "FIXED", defaultDays: 0, isMilestone: true, predecessors: [{ code: "HO2", type: "FS", lag: 0 }] },
];
