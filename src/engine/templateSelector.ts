import type { BuildingType, ConstructionMethod, TaskTemplate } from "./types";
import { RC_RESIDENTIAL } from "./templates/rc_residential";

// For the MVP, RC_RESIDENTIAL is the canonical, fully-modelled WBS network.
// Other methods reuse the same activity network; their speed differences are
// applied via METHOD_MODIFIERS inside the duration calculator. As additional
// method templates are authored they can be registered here.
const TEMPLATES: Partial<Record<ConstructionMethod, TaskTemplate[]>> = {
  REINFORCED_CONCRETE: RC_RESIDENTIAL,
};

export function selectTemplate(
  _buildingType: BuildingType,
  method: ConstructionMethod
): TaskTemplate[] {
  const template = TEMPLATES[method] ?? RC_RESIDENTIAL;
  // Return a deep-ish copy so the engine never mutates the source template.
  return template.map((t) => ({
    ...t,
    predecessors: t.predecessors.map((p) => ({ ...p })),
  }));
}
