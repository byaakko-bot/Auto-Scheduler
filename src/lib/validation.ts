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
