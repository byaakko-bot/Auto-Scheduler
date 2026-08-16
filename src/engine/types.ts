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
  /** Separate blocks on the site. Drives per-building facade and perimeter. */
  numberOfBuildings?: number;
  crewSize: number;
  /** Number of crews assigned to quantity-driven trades (§11/§15). */
  crews?: number;
  /** Project-specific productivity rates overriding the default library. */
  productivityOverrides?: import("./productivity").ProductivityRate[];
  productivityRates: ProductivityRates;
  constructionMethod: ConstructionMethod;
  buildingType: BuildingType;
  startDate: Date;
  /** Contractual completion date. Drives the CPM deadline and §35 feasibility. */
  targetEndDate?: Date;
  workingDaysPerWeek: number; // 5 | 6 | 7
  /** Explicit week mask (index 0 = Sunday). Overrides workingDaysPerWeek. */
  workingWeek?: boolean[];
  workingHoursPerDay?: number;
  holidays?: Date[];
  permitWeeks?: number;
  nearCriticalThreshold?: number;
  watchThreshold?: number;
}

export interface TaskWithDuration extends TaskTemplate {
  durationDays: number;
  quantity?: number;
  /** How the duration was derived — shown to the user so a date is defensible. */
  durationBasis?: string;
  /** How the quantity was measured. */
  quantityDerivation?: string;
  /** Productivity rate used, or undefined when none is configured. */
  productivityCode?: string;
}

// Date constraints, using Primavera/MS-Project semantics.
//   SNET — Start No Earlier Than    FNLT — Finish No Later Than
//   MSO  — Must Start On            MFO  — Must Finish On
export type ConstraintType = "SNET" | "FNLT" | "MSO" | "MFO";

export interface ScheduleConstraint {
  type: ConstraintType;
  offset: number; // working-day offset from project start
}

// How close to critical an activity sits. §9 requires more than a binary flag.
export type CriticalityBand =
  | "CRITICAL"
  | "NEAR_CRITICAL"
  | "WATCH"
  | "NORMAL";

export interface ScheduleNode {
  taskId: string; // template code
  durationDays: number;
  predecessors: { taskId: string; type: DependencyType; lag: number }[];
  constraint?: ScheduleConstraint;
  es: number; // early start (working-day offset)
  ef: number; // early finish
  ls: number; // late start
  lf: number; // late finish
  float: number; // total float
  freeFloat: number; // slip available without moving any successor
  isCritical: boolean;
  band: CriticalityBand;
}

export interface CpmOptions {
  // Required project finish, as a working-day offset. When the network cannot
  // meet it, total float goes negative rather than being clamped to zero.
  deadline?: number;
  nearCriticalThreshold?: number; // default 5 working days
  watchThreshold?: number; // default 10 working days
}

export interface CpmResult {
  nodes: ScheduleNode[];
  projectDuration: number; // earliest achievable finish, in working days
  deadline?: number;
  isFeasible: boolean;
  criticalPaths: string[][];
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
  freeFloatDays: number;
  band: CriticalityBand;
  earlyStartOffset: number;
  earlyFinishOffset: number;
  lateStartOffset: number;
  lateFinishOffset: number;
  sortOrder: number;
  color: string;
  quantity?: number;
  quantityUnit?: string;
  durationBasis?: string;
  quantityDerivation?: string;
  productivityCode?: string;
  predecessors: TemplatePredecessor[];
}

/** §35 — is the requested completion date reachable, and if not, by how much? */
export interface FeasibilityReport {
  targetEndDate?: Date;
  requiredWorkingDays: number;
  availableWorkingDays?: number;
  gapWorkingDays: number; // >0 means the target cannot be met
  isFeasible: boolean;
}

export interface GeneratedSchedule {
  tasks: GeneratedTask[];
  projectDurationWorkingDays: number;
  projectEndDate: Date;
  criticalPathCodes: string[];
  criticalPaths: string[][];
  feasibility: FeasibilityReport;
}
