import { METHOD_MODIFIERS } from "./constants";
import type {
  DurationFormula,
  ProjectInputs,
  TaskTemplate,
  TaskWithDuration,
} from "./types";

// Crew size factor: more crew = faster, with diminishing returns (capped at 2x).
function crewSizeFactor(crewSize: number, discipline: string): number {
  const baseCrews: Record<string, number> = {
    EARTH: 2,
    STRUCTURE: 3,
    MEP: 4,
    FINISH: 6,
  };
  const base = baseCrews[discipline] ?? 4;
  return Math.min(1 + (crewSize - base) * 0.12, 2.0);
}

// Rough perimeter estimate from a single floor's area (assumes square footprint).
function perimeter(totalAreaSqm: number, numberOfFloors: number): number {
  const floorArea = totalAreaSqm / Math.max(numberOfFloors, 1);
  const side = Math.sqrt(Math.max(floorArea, 1));
  return side * 4;
}

function computeDuration(
  formula: DurationFormula,
  inputs: ProjectInputs,
  template: TaskTemplate
): number {
  const { totalAreaSqm, numberOfFloors, numberOfUnits, crewSize } = inputs;
  const pr = inputs.productivityRates;
  const structureFactor =
    METHOD_MODIFIERS[inputs.constructionMethod]?.structureDurationFactor ?? 1;

  switch (formula) {
    case "SCHEMATIC_DESIGN":
      return numberOfFloors <= 4 ? 30 : numberOfFloors <= 10 ? 45 : 60;

    case "DETAILED_DESIGN":
      return Math.round(totalAreaSqm / 500) + 30;

    case "MEP_DESIGN":
      return Math.round(totalAreaSqm / 600) + 20;

    case "INTERIOR_DESIGN":
      return Math.round(totalAreaSqm / 500) + 20;

    case "PERMIT_APPROVAL":
      return inputs.permitWeeks ? inputs.permitWeeks * 7 : 42;

    case "BUILDING_PERMIT":
      return 21;

    case "PROCUREMENT_STRUCTURE":
      return 28;

    case "PROCUREMENT_MEP":
      return 45;

    case "PROCUREMENT_WINDOWS":
      return 56;

    case "SITE_SETUP":
      return 7;

    case "EARTHWORKS": {
      const excavationVol =
        totalAreaSqm * 1.5 * Math.max(inputs.numberOfBasements, 1);
      return Math.ceil(excavationVol / (150 * crewSizeFactor(crewSize, "EARTH")));
    }

    case "FOUNDATIONS": {
      const foundationConcreteM3 = totalAreaSqm * 0.35;
      return Math.ceil(foundationConcreteM3 / pr.foundationM3PerDay);
    }

    case "BASEMENT_WALLS":
      return Math.max(14, Math.round(21 * structureFactor));

    case "WATERPROOFING":
      return 10;

    case "STRUCTURE_PER_FLOOR":
      return Math.ceil(
        (pr.structureFloorDays * structureFactor) /
          crewSizeFactor(crewSize, "STRUCTURE")
      );

    case "TOTAL_STRUCTURE": {
      const perFloor = Math.ceil(
        (pr.structureFloorDays * structureFactor) /
          crewSizeFactor(crewSize, "STRUCTURE")
      );
      return numberOfFloors * perFloor;
    }

    case "ROOF_SLAB":
      return 10;

    case "EXTERNAL_WALLS": {
      const extWallArea =
        perimeter(totalAreaSqm, numberOfFloors) * numberOfFloors * 2.8;
      return Math.ceil(
        extWallArea / (pr.masonryM2PerDay * Math.max(crewSize / 4, 1))
      );
    }

    case "ROOF": {
      const roofArea = (totalAreaSqm / Math.max(numberOfFloors, 1)) * 1.15;
      return Math.ceil(roofArea / 80);
    }

    case "FACADE": {
      const facadeArea =
        perimeter(totalAreaSqm, numberOfFloors) * numberOfFloors * 2.8;
      return Math.ceil(facadeArea / 50);
    }

    case "WINDOWS_DOORS":
      return Math.max(14, Math.round(numberOfFloors * 3.5));

    case "MEP_ROUGH_IN":
      return numberOfFloors * pr.mepRoughInDaysPerFloor;

    case "INTERNAL_PARTITIONS": {
      const partitionArea = totalAreaSqm * 0.6;
      return Math.ceil(
        partitionArea / (pr.masonryM2PerDay * Math.max(crewSize / 3, 1))
      );
    }

    case "PLASTERING": {
      const plasterArea = totalAreaSqm * 2.5;
      return Math.ceil(
        plasterArea / (pr.plasteringM2PerDay * Math.max(crewSize / 4, 1))
      );
    }

    case "SCREED_FLOORS":
      return Math.ceil(
        totalAreaSqm / (pr.flooringM2PerDay * Math.max(crewSize / 4, 1))
      );

    case "FINISHING":
      return Math.ceil(totalAreaSqm / 15) + Math.max(numberOfUnits, 1) * 3;

    case "PAINTING": {
      const paintArea = totalAreaSqm * 2.5;
      return Math.ceil(
        paintArea / (pr.paintingM2PerDay * Math.max(crewSize / 4, 1))
      );
    }

    case "EXTERNAL_WORKS":
      return Math.max(14, Math.round(totalAreaSqm / 200));

    case "INSPECTION":
      return 5;

    case "COMMISSIONING":
      return Math.max(14, numberOfFloors * 2);

    case "HANDOVER":
      return 7;

    case "FIXED":
    default:
      return template.defaultDays ?? 14;
  }
}

// Quantity associated with a task (for display / productivity context).
function computeQuantity(
  template: TaskTemplate,
  inputs: ProjectInputs
): number | undefined {
  const { totalAreaSqm, numberOfFloors } = inputs;
  switch (template.durationFormula) {
    case "EARTHWORKS":
      return Math.round(totalAreaSqm * 1.5 * Math.max(inputs.numberOfBasements, 1));
    case "FOUNDATIONS":
      return Math.round(totalAreaSqm * 0.35);
    case "EXTERNAL_WALLS":
    case "FACADE":
      return Math.round(perimeter(totalAreaSqm, numberOfFloors) * numberOfFloors * 2.8);
    case "ROOF":
      return Math.round((totalAreaSqm / Math.max(numberOfFloors, 1)) * 1.15);
    case "INTERNAL_PARTITIONS":
      return Math.round(totalAreaSqm * 0.6);
    case "PLASTERING":
    case "PAINTING":
      return Math.round(totalAreaSqm * 2.5);
    case "SCREED_FLOORS":
      return Math.round(totalAreaSqm);
    case "TOTAL_STRUCTURE":
      return numberOfFloors;
    default:
      return undefined;
  }
}

export function calculateTaskDurations(
  template: TaskTemplate[],
  inputs: ProjectInputs
): TaskWithDuration[] {
  return template.map((task) => {
    if (task.isMilestone) {
      return { ...task, durationDays: 0, quantity: undefined };
    }
    const raw = computeDuration(task.durationFormula, inputs, task);
    const durationDays = Math.max(raw, task.minDays ?? 1);
    return {
      ...task,
      durationDays,
      quantity: computeQuantity(task, inputs),
    };
  });
}
