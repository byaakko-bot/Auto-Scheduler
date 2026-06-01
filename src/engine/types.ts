// Pure-TypeScript engine types. No DB or framework imports allowed here.

export type ConstructionMethod =
  | "REINFORCED_CONCRETE"
  | "MASONRY_BLOCKWORK"
  | "STEEL_FRAME"
  | "TIMBER_FRAME"
  | "PRECAST_CONCRETE"
  | "MODULAR"
  | "AAC_PANELS"
  | "AAC_BLOCKS"
  | "HYBRID";

export type BuildingType =
  | "RESIDENTIAL_APARTMENT"
  | "RESIDENTIAL_HOUSE"
  | "COMMERCIAL_OFFICE"
  | "COMMERCIAL_RETAIL"
  | "INDUSTRIAL_WAREHOUSE"
  | "MIXED_USE"
  | "HOSPITALITY"
  | "HEALTHCARE"
  | "EDUCATION"
  | "INFRASTRUCTURE";

export type DependencyType = "FS" | "FF" | "SS" | "SF";

export type DurationFormula =
  | "SCHEMATIC_DESIGN"
  | "DETAILED_DESIGN"
  | "MEP_DESIGN"
  | "INTERIOR_DESIGN"
  | "PERMIT_APPROVAL"
  | "BUILDING_PERMIT"
  | "PROCUREMENT_STRUCTURE"
  | "PROCUREMENT_MEP"
  | "PROCUREMENT_WINDOWS"
  | "SITE_SETUP"
  | "EARTHWORKS"
  | "FOUNDATIONS"
  | "BASEMENT_WALLS"
  | "WATERPROOFING"
  | "STRUCTURE_PER_FLOOR"
  | "TOTAL_STRUCTURE"
  | "ROOF_SLAB"
  | "EXTERNAL_WALLS"
  | "ROOF"
  | "FACADE"
  | "WINDOWS_DOORS"
  | "MEP_ROUGH_IN"
  | "INTERNAL_PARTITIONS"
  | "PLASTERING"
  | "SCREED_FLOORS"
  | "FINISHING"
  | "PAINTING"
  | "EXTERNAL_WORKS"
  | "INSPECTION"
  | "COMMISSIONING"
  | "HANDOVER"
  | "FIXED";

export interface TemplatePredecessor {
  code: string;
  type: DependencyType;
  lag: number; // in working days
}

export interface TaskTemplate {
  code: string;
  name: string;
  phase: string;
  durationFormula: DurationFormula;
  defaultDays?: number;
  minDays?: number;
  isMilestone?: boolean;
  quantityUnit?: string;
  predecessors: TemplatePredecessor[];
}

export interface ProductivityRates {
  foundationM3PerDay: number;
  structureFloorDays: number;
  masonryM2PerDay: number;
  plasteringM2PerDay: number;
  flooringM2PerDay: number;
  mepRoughInDaysPerFloor: number;
  paintingM2PerDay: number;
}

export interface ProjectInputs {
  totalAreaSqm: number;
  numberOfFloors: number;
  numberOfUnits: number;
  numberOfBasements: number;
  crewSize: number;
  productivityRates: ProductivityRates;
  constructionMethod: ConstructionMethod;
  buildingType: BuildingType;
  startDate: Date;
  workingDaysPerWeek: number; // 5 | 6 | 7
  holidays?: Date[];
  permitWeeks?: number;
}

export interface TaskWithDuration extends TaskTemplate {
  durationDays: number;
  quantity?: number;
}

export interface ScheduleNode {
  taskId: string; // template code
  durationDays: number;
  predecessors: { taskId: string; type: DependencyType; lag: number }[];
  es: number; // early start (working-day offset)
  ef: number; // early finish
  ls: number; // late start
  lf: number; // late finish
  float: number;
  isCritical: boolean;
}

export interface GeneratedTask {
  code: string;
  name: string;
  phase: string;
  description?: string;
  durationDays: number;
  plannedStartDate: Date;
  plannedEndDate: Date;
  isCritical: boolean;
  isMilestone: boolean;
  floatDays: number;
  sortOrder: number;
  color: string;
  quantity?: number;
  quantityUnit?: string;
  predecessors: TemplatePredecessor[];
}

export interface GeneratedSchedule {
  tasks: GeneratedTask[];
  projectDurationWorkingDays: number;
  projectEndDate: Date;
  criticalPathCodes: string[];
}
