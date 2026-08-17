import type { TaskTemplate } from "../types";

// Industrial / warehouse template — clad steel or precast portal frame.
//
// Deliberately NOT the residential network: there is no wet plastering of the
// shell, no kitchens, no room-by-room tiling. The shell is erected and clad,
// the floor is a power-floated slab, and wet trades are confined to a small
// office and welfare block. Fit-out activities carry the reduced quantities
// produced by the INDUSTRIAL quantity profile.
export const INDUSTRIAL_STEEL: TaskTemplate[] = [
  // ── DESIGN ────────────────────────────────────────────────
  { code: "D1", name: "Concept & Site Layout", phase: "DESIGN", durationFormula: "SCHEMATIC_DESIGN", predecessors: [] },
  { code: "D2", name: "Structural / Frame Design", phase: "DESIGN", durationFormula: "DETAILED_DESIGN", predecessors: [{ code: "D1", type: "FS", lag: 0 }] },
  { code: "D3", name: "MEP & Process Services Design", phase: "DESIGN", durationFormula: "MEP_DESIGN", predecessors: [{ code: "D1", type: "FS", lag: 0 }] },
  { code: "M_DESIGN", name: "Design Complete", phase: "DESIGN", durationFormula: "FIXED", defaultDays: 0, isMilestone: true, predecessors: [{ code: "D2", type: "FS", lag: 0 }, { code: "D3", type: "FS", lag: 0 }] },

  // ── PERMITS ───────────────────────────────────────────────
  // Planning consent concerns use and massing, so it follows concept design
  // and runs in parallel with detailed design. The building permit needs the
  // structural package as well as planning consent.
  { code: "P1", name: "Planning Permit", phase: "PERMITS", durationFormula: "PERMIT_APPROVAL", predecessors: [{ code: "D1", type: "FS", lag: 0 }] },
  { code: "P2", name: "Building Permit", phase: "PERMITS", durationFormula: "BUILDING_PERMIT", predecessors: [{ code: "P1", type: "FS", lag: 0 }, { code: "D2", type: "FS", lag: 0 }] },
  { code: "M_PERMITS", name: "All Permits Approved", phase: "PERMITS", durationFormula: "FIXED", defaultDays: 0, isMilestone: true, predecessors: [{ code: "P2", type: "FS", lag: 0 }] },

  // ── PROCUREMENT (steel is the long lead) ──────────────────
  { code: "PR1", name: "Steel Frame Fabrication", phase: "PROCUREMENT", durationFormula: "FIXED", defaultDays: 70, predecessors: [{ code: "D2", type: "FS", lag: 0 }] },
  { code: "PR2", name: "Cladding & Roof System", phase: "PROCUREMENT", durationFormula: "FIXED", defaultDays: 56, predecessors: [{ code: "D2", type: "FS", lag: 0 }] },
  { code: "PR3", name: "MEP & Process Equipment", phase: "PROCUREMENT", durationFormula: "PROCUREMENT_MEP", predecessors: [{ code: "D3", type: "FS", lag: 0 }] },

  // ── SITE PREP & EARTHWORKS ────────────────────────────────
  // Mobilisation and bulk earthworks proceed under planning consent. Only
  // permanent works below wait on the building permit, so permitting no
  // longer blocks every activity on site.
  { code: "S1", name: "Site Setup & Access Roads", phase: "SITE_PREP", durationFormula: "SITE_SETUP", predecessors: [{ code: "P1", type: "FS", lag: 0 }] },
  { code: "E1", name: "Bulk Earthworks & Levelling", phase: "EARTHWORKS", durationFormula: "EARTHWORKS", quantityUnit: "m3", predecessors: [{ code: "S1", type: "FS", lag: 0 }] },
  { code: "E2", name: "Ground Improvement & Piling", phase: "EARTHWORKS", durationFormula: "FIXED", defaultDays: 21, predecessors: [{ code: "E1", type: "FS", lag: 0 }] },

  // ── FOUNDATIONS ───────────────────────────────────────────
  { code: "F1", name: "Pad & Strip Foundations", phase: "FOUNDATIONS", durationFormula: "FOUNDATIONS", quantityUnit: "m3", predecessors: [{ code: "E2", type: "FS", lag: 0 }, { code: "P2", type: "FS", lag: 0 }] },
  { code: "F2", name: "Holding-Down Bolts & Grouting", phase: "FOUNDATIONS", durationFormula: "FIXED", defaultDays: 10, predecessors: [{ code: "F1", type: "FS", lag: 0 }] },
  { code: "F3", name: "Under-Slab Membrane", phase: "FOUNDATIONS", durationFormula: "WATERPROOFING", quantityUnit: "m2", predecessors: [{ code: "F1", type: "FS", lag: 0 }] },

  // ── STRUCTURE ─────────────────────────────────────────────
  { code: "ST1", name: "Steel Frame Erection", phase: "STRUCTURE", durationFormula: "TOTAL_STRUCTURE", quantityUnit: "ton", predecessors: [{ code: "F2", type: "FS", lag: 0 }, { code: "PR1", type: "FS", lag: 0 }] },
  { code: "ST2", name: "Secondary Steel & Bracing", phase: "STRUCTURE", durationFormula: "FIXED", defaultDays: 14, predecessors: [{ code: "ST1", type: "SS", lag: 10 }] },
  { code: "M_TOPOUT", name: "Frame Complete", phase: "STRUCTURE", durationFormula: "FIXED", defaultDays: 0, isMilestone: true, predecessors: [{ code: "ST2", type: "FS", lag: 0 }] },

  // ── ENVELOPE ──────────────────────────────────────────────
  { code: "EN1", name: "Wall Cladding", phase: "ENVELOPE", durationFormula: "EXTERNAL_WALLS", quantityUnit: "m2", predecessors: [{ code: "ST1", type: "SS", lag: 15 }, { code: "PR2", type: "FS", lag: 0 }] },
  { code: "R1", name: "Roof Sheeting & Insulation", phase: "ROOF", durationFormula: "ROOF", quantityUnit: "m2", predecessors: [{ code: "ST2", type: "SS", lag: 5 }, { code: "PR2", type: "FS", lag: 0 }] },
  { code: "W1", name: "Doors, Louvres & Dock Levellers", phase: "WINDOWS_DOORS", durationFormula: "WINDOWS_DOORS", quantityUnit: "ea", predecessors: [{ code: "EN1", type: "FS", lag: 0 }] },
  { code: "M_WATERTIGHT", name: "Building Watertight", phase: "WINDOWS_DOORS", durationFormula: "FIXED", defaultDays: 0, isMilestone: true, predecessors: [{ code: "R1", type: "FS", lag: 0 }, { code: "EN1", type: "FS", lag: 0 }, { code: "W1", type: "FS", lag: 0 }] },

  // ── FLOOR SLAB (the dominant concrete activity in a shed) ─
  { code: "SC1", name: "Power-Floated Floor Slab", phase: "SCREED_FLOORS", durationFormula: "SCREED_FLOORS", quantityUnit: "m2", predecessors: [{ code: "F3", type: "FS", lag: 0 }, { code: "ST1", type: "FS", lag: 0 }] },
  { code: "SC2", name: "Slab Curing & Joint Sealing", phase: "SCREED_FLOORS", durationFormula: "FIXED", defaultDays: 14, predecessors: [{ code: "SC1", type: "FS", lag: 0 }] },

  // ── MEP ───────────────────────────────────────────────────
  { code: "MEP1", name: "MEP & Sprinkler Installation", phase: "MEP_ROUGH", durationFormula: "MEP_ROUGH_IN", quantityUnit: "m2", predecessors: [{ code: "M_WATERTIGHT", type: "FS", lag: 0 }, { code: "PR3", type: "FS", lag: 0 }] },
  { code: "MEP2", name: "Process Equipment Installation", phase: "MEP_ROUGH", durationFormula: "FIXED", defaultDays: 42, predecessors: [{ code: "SC2", type: "FS", lag: 0 }, { code: "MEP1", type: "SS", lag: 10 }] },

  // ── OFFICE / WELFARE FIT-OUT (small fraction of GFA) ──────
  { code: "PA1", name: "Office & Welfare Partitions", phase: "PARTITIONS", durationFormula: "INTERNAL_PARTITIONS", quantityUnit: "m2", predecessors: [{ code: "M_WATERTIGHT", type: "FS", lag: 0 }] },
  { code: "PL1", name: "Office Lining & Plaster", phase: "PLASTERING", durationFormula: "PLASTERING", quantityUnit: "m2", predecessors: [{ code: "PA1", type: "FS", lag: 3 }] },
  { code: "FN1", name: "Office Floor & Wall Finishes", phase: "FINISHING", durationFormula: "FINISHING", quantityUnit: "m2", predecessors: [{ code: "PL1", type: "FS", lag: 0 }] },
  { code: "FN2", name: "Office Fit-Out & Joinery", phase: "FINISHING", durationFormula: "FIXED", defaultDays: 21, quantityUnit: "m2", predecessors: [{ code: "FN1", type: "FS", lag: 0 }] },
  { code: "FN3", name: "Painting & Line Marking", phase: "FINISHING", durationFormula: "PAINTING", quantityUnit: "m2", predecessors: [{ code: "PL1", type: "FS", lag: 0 }, { code: "SC2", type: "FS", lag: 0 }] },
  { code: "FN5", name: "MEP Second Fix", phase: "FINISHING", durationFormula: "FIXED", defaultDays: 21, quantityUnit: "m2", predecessors: [{ code: "FN1", type: "FS", lag: 0 }, { code: "MEP1", type: "FS", lag: 0 }] },

  // ── EXTERNAL WORKS ────────────────────────────────────────
  { code: "EX1", name: "Yard, Hardstanding & Parking", phase: "EXTERNAL_WORKS", durationFormula: "EXTERNAL_WORKS", quantityUnit: "m2", predecessors: [{ code: "EN1", type: "FS", lag: 0 }] },

  // ── INSPECTIONS / COMMISSIONING / HANDOVER ────────────────
  { code: "IN1", name: "Fire & Sprinkler Certification", phase: "INSPECTIONS", durationFormula: "INSPECTION", predecessors: [{ code: "MEP1", type: "FS", lag: 0 }] },
  { code: "IN2", name: "Building Control Final", phase: "INSPECTIONS", durationFormula: "INSPECTION", predecessors: [{ code: "IN1", type: "FS", lag: 0 }, { code: "FN5", type: "FS", lag: 0 }, { code: "FN2", type: "FS", lag: 0 }, { code: "FN3", type: "FS", lag: 0 }, { code: "EX1", type: "FS", lag: 0 }] },
  { code: "CM1", name: "Systems & Process Commissioning", phase: "COMMISSIONING", durationFormula: "COMMISSIONING", predecessors: [{ code: "IN2", type: "FS", lag: 0 }, { code: "MEP2", type: "FS", lag: 0 }] },
  { code: "HO1", name: "Snagging", phase: "HANDOVER", durationFormula: "FIXED", defaultDays: 10, predecessors: [{ code: "CM1", type: "FS", lag: 0 }] },
  { code: "HO2", name: "Final Handover", phase: "HANDOVER", durationFormula: "HANDOVER", predecessors: [{ code: "HO1", type: "FS", lag: 0 }] },
  { code: "M_COMPLETE", name: "Practical Completion", phase: "HANDOVER", durationFormula: "FIXED", defaultDays: 0, isMilestone: true, predecessors: [{ code: "HO2", type: "FS", lag: 0 }] },
];
