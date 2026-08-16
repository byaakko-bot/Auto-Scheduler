// Quantity takeoff (§13). Derives measurable quantities from building
// geometry so that durations follow from quantity ÷ productivity, and a
// change in quantity automatically re-drives the duration.
//
// Every figure here is a stated, auditable assumption rather than a hidden
// constant — `QuantityTakeoff.assumptions` is surfaced to the user so an
// estimator can see and override what drove a number.

export type QuantityUnit = "m2" | "m3" | "ton" | "ea" | "m";

export interface GeometryInputs {
  grossFloorAreaSqm: number;
  numberOfFloors: number;
  numberOfBuildings: number;
  numberOfUnits: number;
  numberOfBasements: number;
  /** Storey height, floor to floor. */
  floorHeightM?: number;
  /** Plan aspect ratio (length:width). 1 = square. */
  aspectRatio?: number;
  /** Excavation depth per basement level. */
  basementDepthM?: number;
}

export interface QuantityItem {
  code: string;
  quantity: number;
  unit: QuantityUnit;
  /** How this quantity was derived. */
  derivation: string;
}

export interface QuantityTakeoff {
  items: Map<string, QuantityItem>;
  assumptions: string[];
  /** Footprint of a single building. */
  footprintSqm: number;
  perimeterM: number;
}

const DEFAULTS = {
  floorHeightM: 3.0,
  aspectRatio: 1.5,
  basementDepthM: 3.5,
  // Structural and finishes ratios, per m² of gross floor area unless noted.
  concreteM3PerSqm: 0.28, // suspended slabs, columns, beams
  foundationM3PerSqm: 0.35, // per m² of footprint
  rebarTonPerM3: 0.11,
  formworkM2PerM3: 6.5,
  glazingRatio: 0.18, // window area as a fraction of external wall
  windowAreaSqm: 2.2, // area of one typical window unit
  partitionM2PerSqm: 0.85, // internal partition area per m² GFA
  ceilingRatio: 1.0,
};

/**
 * Perimeter of a rectangular footprint with the given area and aspect ratio.
 * A square (ratio 1) minimises perimeter; real buildings are longer than wide,
 * so the default 1.5 avoids systematically under-measuring facade work.
 */
function perimeterOf(areaSqm: number, aspectRatio: number): number {
  const width = Math.sqrt(Math.max(areaSqm, 1) / aspectRatio);
  const length = width * aspectRatio;
  return 2 * (length + width);
}

export function takeoff(inputs: GeometryInputs): QuantityTakeoff {
  const floorHeight = inputs.floorHeightM ?? DEFAULTS.floorHeightM;
  const aspect = inputs.aspectRatio ?? DEFAULTS.aspectRatio;
  const basementDepth = inputs.basementDepthM ?? DEFAULTS.basementDepthM;

  const buildings = Math.max(inputs.numberOfBuildings, 1);
  const floors = Math.max(inputs.numberOfFloors, 1);
  const gfa = Math.max(inputs.grossFloorAreaSqm, 1);

  // Footprint and perimeter are per-building: eleven small blocks have far
  // more facade than one block of the same total area.
  const gfaPerBuilding = gfa / buildings;
  const footprint = gfaPerBuilding / floors;
  const perimeter = perimeterOf(footprint, aspect);

  const totalFootprint = footprint * buildings;
  const externalWallArea = perimeter * floorHeight * floors * buildings;
  const glazedArea = externalWallArea * DEFAULTS.glazingRatio;
  const solidWallArea = externalWallArea - glazedArea;

  const excavationVol =
    totalFootprint *
    (inputs.numberOfBasements > 0
      ? basementDepth * inputs.numberOfBasements
      : 1.2); // strip/pad foundations still need dig

  const foundationConcrete = totalFootprint * DEFAULTS.foundationM3PerSqm;
  const superstructureConcrete = gfa * DEFAULTS.concreteM3PerSqm;
  const totalConcrete = foundationConcrete + superstructureConcrete;

  const partitionArea = gfa * DEFAULTS.partitionM2PerSqm;
  // Plaster covers both faces of partitions, inner face of external walls,
  // and ceilings.
  const plasterArea =
    partitionArea * 2 + solidWallArea + gfa * DEFAULTS.ceilingRatio;
  const roofArea = totalFootprint * 1.15; // pitch/overhang allowance

  const items: QuantityItem[] = [
    { code: "EXCAVATION", quantity: excavationVol, unit: "m3", derivation: `${Math.round(totalFootprint)} m² footprint × ${inputs.numberOfBasements > 0 ? `${basementDepth} m × ${inputs.numberOfBasements} basement(s)` : "1.2 m foundation dig"}` },
    { code: "CONCRETE_FOUND", quantity: foundationConcrete, unit: "m3", derivation: `${Math.round(totalFootprint)} m² footprint × ${DEFAULTS.foundationM3PerSqm} m³/m²` },
    { code: "CONCRETE_SLAB", quantity: superstructureConcrete, unit: "m3", derivation: `${Math.round(gfa)} m² GFA × ${DEFAULTS.concreteM3PerSqm} m³/m²` },
    { code: "REBAR", quantity: totalConcrete * DEFAULTS.rebarTonPerM3, unit: "ton", derivation: `${Math.round(totalConcrete)} m³ concrete × ${DEFAULTS.rebarTonPerM3} t/m³` },
    { code: "FORMWORK", quantity: superstructureConcrete * DEFAULTS.formworkM2PerM3, unit: "m2", derivation: `${Math.round(superstructureConcrete)} m³ × ${DEFAULTS.formworkM2PerM3} m²/m³` },
    { code: "WATERPROOFING", quantity: totalFootprint * 1.3, unit: "m2", derivation: `${Math.round(totalFootprint)} m² footprint × 1.3` },

    { code: "EXTERNAL_WALLS", quantity: solidWallArea, unit: "m2", derivation: `${Math.round(perimeter)} m perimeter × ${floorHeight} m × ${floors} floors × ${buildings} building(s), less ${Math.round(DEFAULTS.glazingRatio * 100)}% glazing` },
    { code: "FACADE", quantity: solidWallArea, unit: "m2", derivation: "external solid wall area" },
    { code: "ROOFING", quantity: roofArea, unit: "m2", derivation: `${Math.round(totalFootprint)} m² footprint × 1.15` },
    { code: "WINDOWS", quantity: Math.ceil(glazedArea / DEFAULTS.windowAreaSqm), unit: "ea", derivation: `${Math.round(glazedArea)} m² glazing ÷ ${DEFAULTS.windowAreaSqm} m² per unit` },

    { code: "MEP_ROUGH", quantity: gfa, unit: "m2", derivation: `${Math.round(gfa)} m² GFA` },
    { code: "MEP_FINAL", quantity: gfa, unit: "m2", derivation: `${Math.round(gfa)} m² GFA` },
    { code: "PARTITIONS", quantity: partitionArea, unit: "m2", derivation: `${Math.round(gfa)} m² GFA × ${DEFAULTS.partitionM2PerSqm}` },
    { code: "PLASTER", quantity: plasterArea, unit: "m2", derivation: `partitions both faces + external inner face + ceilings` },
    { code: "SCREED", quantity: gfa, unit: "m2", derivation: `${Math.round(gfa)} m² GFA` },
    { code: "TILING", quantity: gfa * 0.25, unit: "m2", derivation: `${Math.round(gfa)} m² GFA × 0.25 (wet areas)` },
    { code: "PAINTING", quantity: plasterArea, unit: "m2", derivation: "plastered area" },
    { code: "JOINERY", quantity: gfa, unit: "m2", derivation: `${Math.round(gfa)} m² GFA` },
    { code: "EXTERNAL_WORKS", quantity: totalFootprint * 0.6, unit: "m2", derivation: `${Math.round(totalFootprint)} m² footprint × 0.6` },

    { code: "AAC_PANEL", quantity: solidWallArea, unit: "m2", derivation: "external solid wall area" },
    { code: "AAC_BLOCK", quantity: solidWallArea, unit: "m2", derivation: "external solid wall area" },
    { code: "MASONRY_BLOCK", quantity: solidWallArea, unit: "m2", derivation: "external solid wall area" },
    { code: "PRECAST_ERECT", quantity: solidWallArea, unit: "m2", derivation: "external solid wall area" },
    { code: "STEEL_ERECT", quantity: gfa * 0.055, unit: "ton", derivation: `${Math.round(gfa)} m² GFA × 0.055 t/m²` },
  ];

  return {
    items: new Map(items.map((i) => [i.code, i])),
    assumptions: [
      `Storey height ${floorHeight} m`,
      `Plan aspect ratio ${aspect}:1`,
      `Glazing ${Math.round(DEFAULTS.glazingRatio * 100)}% of external wall`,
      `${buildings} building(s) of ${Math.round(gfaPerBuilding)} m² over ${floors} floor(s)`,
      `Footprint ${Math.round(footprint)} m², perimeter ${Math.round(perimeter)} m per building`,
    ],
    footprintSqm: footprint,
    perimeterM: perimeter,
  };
}
