// Binds template activities to productivity rates and quantity codes.
//
// Kept separate from the activity template so the same network can be priced
// against different construction methods: the envelope activity draws on a
// different rate (and therefore a different duration) for AAC panels than for
// blockwork, which is the first concrete piece of the §5 method rule engine.

import type { ConstructionMethod } from "./types";

export interface ActivityRateBinding {
  /** Productivity rate code, also used to look up the quantity. */
  rateCode: string;
  /** Quantity code, when it differs from the rate code. */
  quantityCode?: string;
}

// Activities whose duration is genuinely quantity-driven.
const BASE_BINDINGS: Record<string, ActivityRateBinding> = {
  E1: { rateCode: "EXCAVATION" },
  F1: { rateCode: "CONCRETE_FOUND" },
  F3: { rateCode: "WATERPROOFING" },
  ST1: { rateCode: "CONCRETE_SLAB" },
  EN1: { rateCode: "MASONRY_BLOCK", quantityCode: "EXTERNAL_WALLS" },
  R1: { rateCode: "ROOFING" },
  FA1: { rateCode: "FACADE" },
  W1: { rateCode: "WINDOWS" },
  MEP1: { rateCode: "MEP_ROUGH" },
  PA1: { rateCode: "PARTITIONS" },
  PL1: { rateCode: "PLASTER" },
  SC1: { rateCode: "SCREED" },
  FN1: { rateCode: "TILING" },
  FN2: { rateCode: "JOINERY" },
  FN3: { rateCode: "PAINTING" },
  FN5: { rateCode: "MEP_FINAL" },
  EX1: { rateCode: "EXTERNAL_WORKS" },
};

// The envelope trade changes with the construction system. Everything else in
// the network is method-agnostic for now; as method-specific templates are
// authored (precast erection sequences, panel production and shipping) they
// register here alongside their own activities.
const ENVELOPE_BY_METHOD: Partial<Record<ConstructionMethod, ActivityRateBinding>> = {
  AAC_PANELS: { rateCode: "AAC_PANEL", quantityCode: "EXTERNAL_WALLS" },
  AAC_BLOCKS: { rateCode: "AAC_BLOCK", quantityCode: "EXTERNAL_WALLS" },
  MASONRY_BLOCKWORK: { rateCode: "MASONRY_BLOCK", quantityCode: "EXTERNAL_WALLS" },
  PRECAST_CONCRETE: { rateCode: "PRECAST_ERECT", quantityCode: "EXTERNAL_WALLS" },
  REINFORCED_CONCRETE: { rateCode: "MASONRY_BLOCK", quantityCode: "EXTERNAL_WALLS" },
};

const STRUCTURE_BY_METHOD: Partial<Record<ConstructionMethod, ActivityRateBinding>> = {
  STEEL_FRAME: { rateCode: "STEEL_ERECT" },
  PRECAST_CONCRETE: { rateCode: "PRECAST_ERECT", quantityCode: "EXTERNAL_WALLS" },
};

export function bindingFor(
  activityCode: string,
  method: ConstructionMethod
): ActivityRateBinding | undefined {
  if (activityCode === "EN1") {
    return ENVELOPE_BY_METHOD[method] ?? BASE_BINDINGS.EN1;
  }
  if (activityCode === "ST1" && STRUCTURE_BY_METHOD[method]) {
    return STRUCTURE_BY_METHOD[method];
  }
  return BASE_BINDINGS[activityCode];
}

export function isQuantityDriven(activityCode: string): boolean {
  return activityCode in BASE_BINDINGS;
}
