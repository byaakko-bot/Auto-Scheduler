import { randomUUID } from "crypto";
import { db } from "@/lib/prisma";
import { ensureProjectParties, fail, handleError, ok } from "@/lib/api";
import { CircularDependencyError, ScheduleEngine } from "@/engine";
import { DEFAULT_PRODUCTIVITY } from "@/engine/constants";
import { raciForPhase } from "@/engine/raciAssigner";
import { titleCase } from "@/lib/utils";
import type {
  BuildingType,
  ConstructionMethod,
  ProductivityRates,
} from "@/engine/types";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const project = await db.project.findUnique({ where: { id: params.id } });
    if (!project) return fail("Project not found", 404);

    const body = await req.json().catch(() => ({}));

    // §23 — regenerating replaces every activity. With an approved baseline in
    // place that discards the plan variance is measured against, so it has to
    // be a deliberate act rather than a side effect.
    const approved = await db.baseline.findFirst({
      where: { projectId: params.id, status: "APPROVED" },
      select: { name: true },
    });
    if (approved && body.force !== true) {
      return fail(
        `Baseline "${approved.name}" is approved. Regenerating replaces every ` +
          `activity and would discard the plan your variance is measured ` +
          `against. Re-send with { "force": true } to proceed deliberately.`,
        409,
        { approvedBaseline: approved.name }
      );
    }

    const crewSize: number = body.crewSize ?? 20;
    const permitWeeks: number | undefined = body.permitWeeks ?? undefined;
    const productivityRates: ProductivityRates =
      body.productivityRates ?? DEFAULT_PRODUCTIVITY;

    const holidays = await db.publicHoliday.findMany({
      where: { projectId: project.id },
    });

    // Separate blocks drive facade quantity: eleven small buildings have far
    // more external wall than one block of the same total area.
    const buildingCount = await db.building.count({
      where: { projectId: project.id },
    });
    const numberOfBuildings = body.numberOfBuildings ?? Math.max(buildingCount, 1);
    const crews: number = body.crews ?? 1;

    const engine = new ScheduleEngine({
      totalAreaSqm: project.totalAreaSqm,
      numberOfFloors: project.numberOfFloors,
      numberOfUnits: project.numberOfUnits ?? 1,
      numberOfBasements: project.numberOfBasements,
      numberOfBuildings,
      crewSize,
      crews,
      productivityRates,
      constructionMethod: project.constructionMethod as ConstructionMethod,
      buildingType: project.buildingType as BuildingType,
      startDate: project.startDate,
      targetEndDate: project.targetEndDate ?? undefined,
      workingDaysPerWeek: project.workingDaysPerWeek,
      workingHoursPerDay: project.workingHoursPerDay,
      holidays: holidays.map((h) => h.date),
      permitWeeks,
      nearCriticalThreshold: project.nearCriticalThresholdDays,
      watchThreshold: project.watchThresholdDays,
    });

    let schedule;
    try {
      schedule = engine.generate();
    } catch (err) {
      // A cyclic network has no valid solution. Surface the offending chain
      // rather than persisting dates the engine cannot justify.
      if (err instanceof CircularDependencyError) {
        return fail(err.message, 422, { cycles: err.cycles });
      }
      throw err;
    }

    // Pre-assign ids so tasks, dependencies and RACI rows can all be written
    // with batched createMany instead of one round-trip per row.
    const phases: string[] = [];
    for (const t of schedule.tasks) {
      if (!phases.includes(t.phase)) phases.push(t.phase);
    }
    const phaseToWp: Record<string, string> = {};
    for (const phase of phases) phaseToWp[phase] = randomUUID();

    const codeToTaskId: Record<string, string> = {};
    for (const t of schedule.tasks) codeToTaskId[t.code] = randomUUID();

    const partyMap = await ensureProjectParties(project.companyId, project.id);

    const raciRows = schedule.tasks.flatMap((t) =>
      raciForPhase(t.phase)
        .filter((seed) => partyMap[seed.partyType])
        .map((seed) => ({
          taskId: codeToTaskId[t.code],
          partyId: partyMap[seed.partyType],
          raciRole: seed.raciRole,
        }))
    );

    const dependencyRows = schedule.tasks.flatMap((t) =>
      t.predecessors
        .filter((p) => codeToTaskId[p.code])
        .map((p) => ({
          predecessorId: codeToTaskId[p.code],
          successorId: codeToTaskId[t.code],
          type: p.type,
          lagDays: p.lag,
        }))
    );

    await db.$transaction([
      // Idempotent regeneration: clear any previously generated structure.
      db.dependency.deleteMany({
        where: { predecessor: { projectId: project.id } },
      }),
      db.task.deleteMany({ where: { projectId: project.id } }),
      db.workPackage.deleteMany({ where: { projectId: project.id } }),
      db.milestone.deleteMany({ where: { projectId: project.id } }),

      db.workPackage.createMany({
        data: phases.map((phase, i) => ({
          id: phaseToWp[phase],
          projectId: project.id,
          code: String(i + 1),
          name: titleCase(phase),
          phase,
          sortOrder: i,
          color: schedule.tasks.find((t) => t.phase === phase)?.color ?? null,
        })),
      }),

      db.task.createMany({
        data: schedule.tasks.map((t) => ({
          id: codeToTaskId[t.code],
          projectId: project.id,
          workPackageId: phaseToWp[t.phase],
          code: t.code,
          name: t.name,
          phase: t.phase,
          plannedStartDate: t.plannedStartDate,
          plannedEndDate: t.plannedEndDate,
          durationDays: t.durationDays,
          isCritical: t.isCritical,
          isMilestone: t.isMilestone,
          floatDays: t.floatDays,
          freeFloatDays: t.freeFloatDays,
          criticalityBand: t.band,
          earlyStartOffset: t.earlyStartOffset,
          earlyFinishOffset: t.earlyFinishOffset,
          lateStartOffset: t.lateStartOffset,
          lateFinishOffset: t.lateFinishOffset,
          crewSize,
          quantity: t.quantity ?? null,
          quantityUnit: t.quantityUnit ?? null,
          notes: t.durationBasis ?? null,
          sortOrder: t.sortOrder,
        })),
      }),

      db.dependency.createMany({ data: dependencyRows, skipDuplicates: true }),
      db.raciAssignment.createMany({ data: raciRows }),

      db.milestone.createMany({
        data: schedule.tasks
          .filter((x) => x.isMilestone)
          .map((t) => ({
            projectId: project.id,
            name: t.name,
            plannedDate: t.plannedStartDate,
          })),
      }),

      db.project.update({
        where: { id: project.id },
        data: { status: "ACTIVE" },
      }),
    ]);

    return ok({
      taskCount: schedule.tasks.length,
      projectEndDate: schedule.projectEndDate,
      durationWorkingDays: schedule.projectDurationWorkingDays,
      criticalPathCount: schedule.criticalPathCodes.length,
      criticalPaths: schedule.criticalPaths,
      feasibility: schedule.feasibility,
    });
  } catch (err) {
    return handleError(err);
  }
}
