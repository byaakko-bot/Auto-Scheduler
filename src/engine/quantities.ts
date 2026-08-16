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
  /** Drives the quantity profile. A warehouse is not a block of flats. */
  buildingType?: string;
  /** Storey height, floor to floor. */
  floorHeightM?: number;
  /** Plan aspect ratio (length:width). 1 = square. */
  aspectRatio?: number;
  /** Excavation depth per basement level. */
  basementDepthM?: number;
}

/**
 * Per-building-type quantity ratios.
 *
 * Applying residential ratios to an industrial shed is the single largest
 * source of nonsense in a generated programme: it invents tens of thousands
 * of square metres of plaster, partitions and joinery that do not exist in a
 * clad steel portal frame.
 */
export interface BuildingProfile {
  floorHeightM: number;
  aspectRatio: number;
  /** Internal partition area per m² GFA. */
  partitionM2PerSqm: number;
  /** Proportion of GFA receiving a finished ceiling. */
  ceilingRatio: number;
  /** Whether internal faces are wet-plastered at all. */
  plasterApplies: boolean;
  /** Glazing as a fraction of external wall area. */
  glazingRatio: number;
  /** Structural concrete per m² GFA. */
  concreteM3PerSqm: number;
  /** Foundation concrete per m² of footprint. */
  foundationM3PerSqm: number;
  /** Fraction of GFA receiving tiling. */
  tilingRatio: number;
  /** Fraction of GFA receiving joinery/fit-out. */
  joineryRatio: number;
  /** Fraction of GFA that is fitted-out office within an industrial shell. */
  fitOutFraction: number;
}

const RESIDENTIAL: BuildingProfile = {
  floorHeightM: 3.0,
  aspectRatio: 1.5,
  partitionM2PerSqm: 0.85,
  ceilingRatio: 1.0,
  plasterApplies: true,
  glazingRatio: 0.18,
  concreteM3PerSqm: 0.28,
  foundationM3PerSqm: 0.35,
  tilingRatio: 0.25,
  joineryRatio: 1.0,
  fitOutFraction: 1.0,
};

const OFFICE: BuildingProfile = {
  ...RESIDENTIAL,
  floorHeightM: 3.6,
  partitionM2PerSqm: 0.45,
  ceilingRatio: 0.95,
  glazingRatio: 0.4,
  tilingRatio: 0.08,
  joineryRatio: 0.35,
};

// A clad steel or precast shed: tall, open-span, minimal wet trades. Only a
// small office/welfare block receives partitions, plaster and joinery.
const INDUSTRIAL: BuildingProfile = {
  floorHeightM: 8.0,
  aspectRatio: 1.6,
  partitionM2PerSqm: 0.06,
  ceilingRatio: 0.08,
  plasterApplies: false,
  glazingRatio: 0.05,
  concreteM3PerSqm: 0.14,
  foundationM3PerSqm: 0.22,
  tilingRatio: 0.02,
  joineryRatio: 0.08,
  fitOutFraction: 0.08,
};

const PROFILES: Record<string, BuildingProfile> = {
  RESIDENTIAL_APARTMENT: RESIDENTIAL,
  RESIDENTIAL_HOUSE: { ...RESIDENTIAL, floorHeightM: 2.7, glazingRatio: 0.16 },
  COMMERCIAL_OFFICE: OFFICE,
  COMMERCIAL_RETAIL: { ...OFFICE, partitionM2PerSqm: 0.25, glazingRatio: 0.45 },
  INDUSTRIAL_WAREHOUSE: INDUSTRIAL,
  MIXED_USE: { ...RESIDENTIAL, glazingRatio: 0.28 },
  HOSPITALITY: { ...RESIDENTIAL, partitionM2PerSqm: 1.0, tilingRatio: 0.35 },
  HEALTHCARE: { ...OFFICE, partitionM2PerSqm: 0.9, tilingRatio: 0.3 },
  EDUCATION: { ...OFFICE, partitionM2PerSqm: 0.6 },
  INFRASTRUCTURE: { ...INDUSTRIAL, joineryRatio: 0.02, fitOutFraction: 0.02 },
};

export function profileFor(buildingType?: string): BuildingProfile {
  return PROFILES[buildingType ?? ""] ?? RESIDENTIAL;
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
  const profile = profileFor(inputs.buildingType);
  const floorHeight = inputs.floorHeightM ?? profile.floorHeightM;
  const aspect = inputs.aspectRatio ?? profile.aspectRatio;
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
  const glazedArea = externalWallArea * profile.glazingRatio;
  const solidWallArea = externalWallArea - glazedArea;

  const excavationVol =
    totalFootprint *
    (inputs.numberOfBasements > 0
      ? basementDepth * inputs.numberOfBasements
      : 1.2); // strip/pad foundations still need dig

  const foundationConcrete = totalFootprint * profile.foundationM3PerSqm;
  const superstructureConcrete = gfa * profile.concreteM3PerSqm;
  const totalConcrete = foundationConcrete + superstructureConcrete;

  const partitionArea = gfa * profile.partitionM2PerSqm;
  // Plaster covers both faces of partitions, the inner face of external walls
  // and ceilings — but only where the building is wet-finished at all. A clad
  // industrial shed has an internal lining, not 36,000 m² of plaster.
  const plasterArea = profile.plasterApplies
    ? partitionArea * 2 + solidWallArea + gfa * profile.ceilingRatio
    : partitionArea * 2 + gfa * profile.ceilingRatio;
  const roofArea = totalFootprint * 1.15; // pitch/overhang allowance

  const items: QuantityItem[] = [
    { code: "EXCAVATION", quantity: excavationVol, unit: "m3", derivation: `${Math.round(totalFootprint)} m² footprint × ${inputs.numberOfBasements > 0 ? `${basementDepth} m × ${inputs.numberOfBasements} basement(s)` : "1.2 m foundation dig"}` },
    { code: "CONCRETE_FOUND", quantity: foundationConcrete, unit: "m3", derivation: `${Math.round(totalFootprint)} m² footprint × ${DEFAULTS.foundationM3PerSqm} m³/m²` },
    { code: "CONCRETE_SLAB", quantity: superstructureConcrete, unit: "m3", derivation: `${Math.round(gfa)} m² GFA × ${DEFAULTS.concreteM3PerSqm} m³/m²` },
    { code: "REBAR", quantity: totalConcrete * DEFAULTS.rebarTonPerM3, unit: "ton", derivation: `${Math.round(totalConcrete)} m³ concrete × ${DEFAULTS.rebarTonPerM3} t/m³` },
    { code: "FORMWORK", quantity: superstructureConcrete * DEFAULTS.formworkM2PerM3, unit: "m2", derivation: `${Math.round(superstructureConcrete)} m³ × ${DEFAULTS.formworkM2PerM3} m²/m³` },
    // With no basement this is a damp-proof membrane under the slab, not full
    // tanking of retaining walls.
    {
      code: "WATERPROOFING",
      quantity:
        inputs.numberOfBasements > 0
          ? totalFootprint + perimeter * basementDepth * inputs.numberOfBasements * buildings
          : totalFootprint * 1.05,
      unit: "m2",
      derivation:
        inputs.numberOfBasements > 0
          ? `slab ${Math.round(totalFootprint)} m² + ${inputs.numberOfBasements} basement wall(s)`
          : `${Math.round(totalFootprint)} m² slab DPM (no basement)`,
    },

    { code: "EXTERNAL_WALLS", quantity: solidWallArea, unit: "m2", derivation: `${Math.round(perimeter)} m perimeter × ${floorHeight} m × ${floors} floors × ${buildings} building(s), less ${Math.round(DEFAULTS.glazingRatio * 100)}% glazing` },
    { code: "FACADE", quantity: solidWallArea, unit: "m2", derivation: "external solid wall area" },
    { code: "ROOFING", quantity: roofArea, unit: "m2", derivation: `${Math.round(totalFootprint)} m² footprint × 1.15` },
    { code: "WINDOWS", quantity: Math.ceil(glazedArea / DEFAULTS.windowAreaSqm), unit: "ea", derivation: `${Math.round(glazedArea)} m² glazing ÷ ${DEFAULTS.windowAreaSqm} m² per unit` },

    { code: "MEP_ROUGH", quantity: gfa, unit: "m2", derivation: `${Math.round(gfa)} m² GFA` },
    { code: "MEP_FINAL", quantity: Math.max(gfa * profile.fitOutFraction, 1), unit: "m2", derivation: `${Math.round(gfa)} m² GFA × ${profile.fitOutFraction} fit-out fraction` },
    { code: "PARTITIONS", quantity: Math.max(partitionArea, 1), unit: "m2", derivation: `${Math.round(gfa)} m² GFA × ${profile.partitionM2PerSqm}` },
    { code: "PLASTER", quantity: Math.max(plasterArea, 1), unit: "m2", derivation: profile.plasterApplies ? "partitions both faces + external inner face + ceilings" : "fitted-out areas only (shell is clad, not plastered)" },
    { code: "SCREED", quantity: gfa, unit: "m2", derivation: `${Math.round(gfa)} m² GFA` },
    { code: "TILING", quantity: Math.max(gfa * profile.tilingRatio, 1), unit: "m2", derivation: `${Math.round(gfa)} m² GFA × ${profile.tilingRatio} (wet areas)` },
    { code: "PAINTING", quantity: Math.max(plasterArea, 1), unit: "m2", derivation: profile.plasterApplies ? "plastered area" : "lined/fitted-out area only" },
    { code: "JOINERY", quantity: Math.max(gfa * profile.joineryRatio, 1), unit: "m2", derivation: `${Math.round(gfa)} m² GFA × ${profile.joineryRatio} fit-out fraction` },
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
      `Quantity profile: ${inputs.buildingType ?? "RESIDENTIAL_APARTMENT (default)"}`,
      `Storey height ${floorHeight} m`,
      `Plan aspect ratio ${aspect}:1`,
      `Glazing ${Math.round(profile.glazingRatio * 100)}% of external wall`,
      profile.plasterApplies
        ? "Internal faces wet-plastered"
        : `Shell is clad/lined; wet finishes limited to ${Math.round(profile.fitOutFraction * 100)}% fitted-out area`,
      `${buildings} building(s) of ${Math.round(gfaPerBuilding)} m² over ${floors} floor(s)`,
      `Footprint ${Math.round(footprint)} m², perimeter ${Math.round(perimeter)} m per building`,
    ],
    footprintSqm: footprint,
    perimeterM: perimeter,
  };
}
