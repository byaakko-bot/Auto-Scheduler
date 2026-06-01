import { db } from "@/lib/prisma";
import { ensureProjectParties, fail, handleError, ok } from "@/lib/api";
import { ScheduleEngine } from "@/engine";
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
    const crewSize: number = body.crewSize ?? 20;
    const permitWeeks: number | undefined = body.permitWeeks ?? undefined;
    const productivityRates: ProductivityRates =
      body.productivityRates ?? DEFAULT_PRODUCTIVITY;

    const holidays = await db.publicHoliday.findMany({
      where: { projectId: project.id },
    });

    const engine = new ScheduleEngine({
      totalAreaSqm: project.totalAreaSqm,
      numberOfFloors: project.numberOfFloors,
      numberOfUnits: project.numberOfUnits ?? 1,
      numberOfBasements: project.numberOfBasements,
      crewSize,
      productivityRates,
      constructionMethod: project.constructionMethod as ConstructionMethod,
      buildingType: project.buildingType as BuildingType,
      startDate: project.startDate,
      workingDaysPerWeek: project.workingDaysPerWeek,
      holidays: holidays.map((h) => h.date),
      permitWeeks,
    });

    const schedule = engine.generate();

    // Idempotent regeneration: clear any previously generated structure.
    await db.dependency.deleteMany({
      where: { predecessor: { projectId: project.id } },
    });
    await db.task.deleteMany({ where: { projectId: project.id } });
    await db.workPackage.deleteMany({ where: { projectId: project.id } });

    // One work package per distinct phase, ordered by first appearance.
    const phases: string[] = [];
    for (const t of schedule.tasks) {
      if (!phases.includes(t.phase)) phases.push(t.phase);
    }
    const phaseToWp: Record<string, string> = {};
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      const wp = await db.workPackage.create({
        data: {
          projectId: project.id,
          code: String(i + 1),
          name: titleCase(phase),
          phase,
          sortOrder: i,
          color: schedule.tasks.find((t) => t.phase === phase)?.color ?? null,
        },
      });
      phaseToWp[phase] = wp.id;
    }

    // Tasks
    const codeToTaskId: Record<string, string> = {};
    for (const t of schedule.tasks) {
      const created = await db.task.create({
        data: {
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
          crewSize,
          quantity: t.quantity ?? null,
          quantityUnit: t.quantityUnit ?? null,
          sortOrder: t.sortOrder,
        },
      });
      codeToTaskId[t.code] = created.id;
    }

    // Dependencies
    for (const t of schedule.tasks) {
      for (const p of t.predecessors) {
        const predId = codeToTaskId[p.code];
        const succId = codeToTaskId[t.code];
        if (!predId || !succId) continue;
        await db.dependency.create({
          data: {
            predecessorId: predId,
            successorId: succId,
            type: p.type,
            lagDays: p.lag,
          },
        });
      }
    }

    // RACI auto-assignment per task, based on phase defaults.
    const partyMap = await ensureProjectParties(project.companyId, project.id);
    for (const t of schedule.tasks) {
      const seeds = raciForPhase(t.phase);
      for (const seed of seeds) {
        const partyId = partyMap[seed.partyType];
        if (!partyId) continue;
        await db.raciAssignment.create({
          data: {
            taskId: codeToTaskId[t.code],
            partyId,
            raciRole: seed.raciRole,
          },
        });
      }
    }

    // Milestones mirror the generated milestone tasks.
    await db.milestone.deleteMany({ where: { projectId: project.id } });
    for (const t of schedule.tasks.filter((x) => x.isMilestone)) {
      await db.milestone.create({
        data: {
          projectId: project.id,
          name: t.name,
          plannedDate: t.plannedStartDate,
        },
      });
    }

    await db.project.update({
      where: { id: project.id },
      data: { targetEndDate: schedule.projectEndDate, status: "ACTIVE" },
    });

    return ok({
      taskCount: schedule.tasks.length,
      projectEndDate: schedule.projectEndDate,
      durationWorkingDays: schedule.projectDurationWorkingDays,
      criticalPathCount: schedule.criticalPathCodes.length,
    });
  } catch (err) {
    return handleError(err);
  }
}
