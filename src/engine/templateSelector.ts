import type { BuildingType, ConstructionMethod, TaskTemplate } from "./types";
import { RC_RESIDENTIAL } from "./templates/rc_residential";
import { INDUSTRIAL_STEEL } from "./templates/industrial_steel";

// Building type decides the activity network; construction method then tunes
// the rates and the envelope trade within it.
//
// Selecting on method alone was the source of a real defect: a 13,000 m²
// steel-frame warehouse was scheduled with the residential network, which
// invented 36,000 m² of internal plaster and pushed completion out by years.
const BY_BUILDING_TYPE: Partial<Record<BuildingType, TaskTemplate[]>> = {
  INDUSTRIAL_WAREHOUSE: INDUSTRIAL_STEEL,
  INFRASTRUCTURE: INDUSTRIAL_STEEL,
  RESIDENTIAL_APARTMENT: RC_RESIDENTIAL,
  RESIDENTIAL_HOUSE: RC_RESIDENTIAL,
  COMMERCIAL_OFFICE: RC_RESIDENTIAL,
  COMMERCIAL_RETAIL: RC_RESIDENTIAL,
  MIXED_USE: RC_RESIDENTIAL,
  HOSPITALITY: RC_RESIDENTIAL,
  HEALTHCARE: RC_RESIDENTIAL,
  EDUCATION: RC_RESIDENTIAL,
};

// A steel or precast frame implies the industrial erection sequence even when
// the building type is not itself industrial.
const FRAME_METHODS: ConstructionMethod[] = ["STEEL_FRAME"];

export function templateNameFor(
  buildingType: BuildingType,
  method: ConstructionMethod
): "INDUSTRIAL_STEEL" | "RC_RESIDENTIAL" {
  const base = BY_BUILDING_TYPE[buildingType] ?? RC_RESIDENTIAL;
  if (base === INDUSTRIAL_STEEL) return "INDUSTRIAL_STEEL";

  // A steel frame implies the industrial erection sequence even for a
  // commercial shell.
  if (
    FRAME_METHODS.includes(method) &&
    (buildingType === "COMMERCIAL_RETAIL" || buildingType === "COMMERCIAL_OFFICE")
  ) {
    return "INDUSTRIAL_STEEL";
  }
  return "RC_RESIDENTIAL";
}

export function selectTemplate(
  buildingType: BuildingType,
  method: ConstructionMethod
): TaskTemplate[] {
  const template =
    templateNameFor(buildingType, method) === "INDUSTRIAL_STEEL"
      ? INDUSTRIAL_STEEL
      : RC_RESIDENTIAL;

  // Return a deep-ish copy so the engine never mutates the source template.
  return template.map((t) => ({
    ...t,
    predecessors: t.predecessors.map((p) => ({ ...p })),
  }));
}
