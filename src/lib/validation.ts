import { z } from "zod";

export const BUILDING_TYPE_VALUES = [
  "RESIDENTIAL_APARTMENT",
  "RESIDENTIAL_HOUSE",
  "COMMERCIAL_OFFICE",
  "COMMERCIAL_RETAIL",
  "INDUSTRIAL_WAREHOUSE",
  "MIXED_USE",
  "HOSPITALITY",
  "HEALTHCARE",
  "EDUCATION",
  "INFRASTRUCTURE",
] as const;

export const CONSTRUCTION_METHOD_VALUES = [
  "REINFORCED_CONCRETE",
  "MASONRY_BLOCKWORK",
  "STEEL_FRAME",
  "TIMBER_FRAME",
  "PRECAST_CONCRETE",
  "MODULAR",
  "AAC_PANELS",
  "AAC_BLOCKS",
  "HYBRID",
] as const;

export const productivityRatesSchema = z.object({
  foundationM3PerDay: z.number().positive(),
  structureFloorDays: z.number().positive(),
  masonryM2PerDay: z.number().positive(),
  plasteringM2PerDay: z.number().positive(),
  flooringM2PerDay: z.number().positive(),
  mepRoughInDaysPerFloor: z.number().positive(),
  paintingM2PerDay: z.number().positive(),
});

export const createProjectSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  clientName: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  country: z.string().min(2),
  city: z.string().min(1),
  address: z.string().optional().nullable(),
  buildingType: z.enum(BUILDING_TYPE_VALUES),
  constructionMethod: z.enum(CONSTRUCTION_METHOD_VALUES),
  totalAreaSqm: z.number().positive(),
  numberOfFloors: z.number().int().positive(),
  numberOfUnits: z.number().int().nonnegative().optional().nullable(),
  numberOfBasements: z.number().int().nonnegative().default(0),
  startDate: z.string(),
  targetEndDate: z.string().optional().nullable(),
  workingDaysPerWeek: z.number().int().min(1).max(7).default(5),
  workingHoursPerDay: z.number().int().min(1).max(24).default(8),
  currency: z.string().default("USD"),
  crewSize: z.number().int().positive().default(20),
  permitWeeks: z.number().int().positive().optional().nullable(),
  productivityRates: productivityRatesSchema.optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

// Everything a planner may change after creation. Deliberately includes the
// fields that drive the schedule — area, floors, method, dates, calendar —
// because those are exactly the ones that turn out to be wrong first.
export const updateProjectSchema = z.object({
  name: z.string().min(2).optional(),
  clientName: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  country: z.string().min(2).optional(),
  city: z.string().min(1).optional(),
  address: z.string().optional().nullable(),
  buildingType: z.enum(BUILDING_TYPE_VALUES).optional(),
  constructionMethod: z.enum(CONSTRUCTION_METHOD_VALUES).optional(),
  totalAreaSqm: z.number().positive().optional(),
  numberOfFloors: z.number().int().positive().optional(),
  numberOfUnits: z.number().int().nonnegative().optional().nullable(),
  numberOfBasements: z.number().int().nonnegative().optional(),
  startDate: z.string().optional(),
  targetEndDate: z.string().optional().nullable(),
  workingDaysPerWeek: z.number().int().min(1).max(7).optional(),
  workingHoursPerDay: z.number().int().min(1).max(24).optional(),
  currency: z.string().optional(),
  status: z.string().optional(),
  nearCriticalThresholdDays: z.number().int().nonnegative().optional(),
  watchThresholdDays: z.number().int().nonnegative().optional(),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const updateTaskSchema = z.object({
  progressPct: z.number().min(0).max(100).optional(),
  status: z
    .enum([
      "NOT_STARTED",
      "IN_PROGRESS",
      "COMPLETED",
      "DELAYED",
      "ON_HOLD",
      "CANCELLED",
    ])
    .optional(),
  plannedStartDate: z.string().optional(),
  plannedEndDate: z.string().optional(),
  actualStartDate: z.string().optional().nullable(),
  actualEndDate: z.string().optional().nullable(),
  // §25 — remaining duration is reported independently of percent complete,
  // because 50% complete does not imply 50% of the duration remains.
  remainingDurationDays: z.number().int().nonnegative().optional().nullable(),
  // §26 — quantity installed to date, for physical progress.
  actualQuantity: z.number().nonnegative().optional().nullable(),
});

export const delayTaskSchema = z.object({
  newEndDate: z.string(),
});

export const raciUpdateSchema = z.object({
  updates: z.array(
    z.object({
      taskId: z.string(),
      partyId: z.string(),
      raciRole: z
        .enum(["RESPONSIBLE", "ACCOUNTABLE", "CONSULTED", "INFORMED"])
        .nullable(),
    })
  ),
});
