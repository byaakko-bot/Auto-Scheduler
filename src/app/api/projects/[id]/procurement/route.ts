import { db } from "@/lib/prisma";
import { fail, handleError, ok } from "@/lib/api";
import {
  buildProcurementReport,
  defaultPackagesFor,
  type ConsumingActivity,
  type ProcurementPackage,
} from "@/engine/procurement";

export const dynamic = "force-dynamic";

/**
 * §16–§18 — procurement status for a project.
 *
 * Required-on-site dates are read from the consuming activity rather than
 * stored, so they track the schedule automatically. Risk is classified
 * against that activity's float, so a late delivery into a task with slack
 * is not reported as a project delay (§17).
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const project = await db.project.findUnique({ where: { id: params.id } });
    if (!project) return fail("Project not found", 404);

    const packages = await db.procurementPackage.findMany({
      where: { projectId: params.id },
      include: {
        legs: { orderBy: { sequence: "asc" } },
        supplier: { include: { party: true } },
        consumingTask: true,
      },
      orderBy: { code: "asc" },
    });

    if (packages.length === 0) {
      return ok({
        packages: [],
        summary: {
          total: 0,
          worstProjectImpactDays: 0,
          atRiskCount: 0,
          notOrderedCount: 0,
          overdueOrderCount: 0,
        },
        message:
          "No procurement packages defined. POST to this endpoint to seed the long-lead items for this project.",
      });
    }

    const consumers = new Map<string, ConsumingActivity>();
    for (const p of packages) {
      if (!p.consumingTask) continue;
      consumers.set(p.consumingTask.code, {
        code: p.consumingTask.code,
        startDate: p.consumingTask.plannedStartDate,
        totalFloatDays: p.consumingTask.floatDays,
        freeFloatDays: p.consumingTask.freeFloatDays,
      });
    }

    const enginePackages: ProcurementPackage[] = packages
      .filter((p) => p.consumingTask)
      .map((p) => ({
        code: p.code,
        material: p.material,
        supplier: p.supplier?.party?.name ?? undefined,
        origin: p.origin ?? undefined,
        destination: p.destination ?? undefined,
        transportMode: (p.transportMode as never) ?? undefined,
        consumingActivityCode: p.consumingTask!.code,
        bufferDays: p.bufferDays,
        currentEtaDate: p.currentEtaDate ?? undefined,
        legs: p.legs.map((l) => ({
          kind: l.kind as never,
          name: l.name,
          days: l.days,
        })),
      }));

    const report = buildProcurementReport(enginePackages, consumers);
    const byCode = new Map(packages.map((p) => [p.code, p]));

    return ok({
      packages: report.packages.map((s) => {
        const row = byCode.get(s.code);
        return {
          ...s,
          status: row?.status,
          origin: row?.origin,
          destination: row?.destination,
          transportMode: row?.transportMode,
          supplier: row?.supplier?.party?.name ?? null,
          consumingActivityName: row?.consumingTask?.name ?? null,
          consumingActivityFloat: row?.consumingTask?.floatDays ?? null,
          consumingActivityBand: row?.consumingTask?.criticalityBand ?? null,
        };
      }),
      summary: {
        total: report.packages.length,
        worstProjectImpactDays: report.worstProjectImpactDays,
        atRiskCount: report.atRiskCount,
        notOrderedCount: report.notOrderedCount,
        overdueOrderCount: report.overdueOrders.length,
        overdueOrders: report.overdueOrders.map((o) => ({
          code: o.code,
          material: o.material,
          latestOrderDate: o.latestOrderDate,
        })),
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Seeds the long-lead procurement packages implied by the project's building
 * type and construction method, linking each to the activity that consumes it.
 * Existing packages are left untouched so field edits are never overwritten.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const project = await db.project.findUnique({ where: { id: params.id } });
    if (!project) return fail("Project not found", 404);

    const tasks = await db.task.findMany({
      where: { projectId: params.id },
      select: { id: true, code: true },
    });
    if (tasks.length === 0) {
      return fail("Generate a schedule before seeding procurement", 422);
    }
    const taskByCode = new Map(tasks.map((t) => [t.code, t.id]));

    const existing = await db.procurementPackage.findMany({
      where: { projectId: params.id },
      select: { code: true },
    });
    const existingCodes = new Set(existing.map((e) => e.code));

    const seeds = defaultPackagesFor(
      project.buildingType,
      project.constructionMethod
    ).filter(
      (s) => !existingCodes.has(s.code) && taskByCode.has(s.consumingActivityCode)
    );

    const created: string[] = [];
    for (const seed of seeds) {
      await db.procurementPackage.create({
        data: {
          projectId: params.id,
          code: seed.code,
          material: seed.material,
          bufferDays: seed.bufferDays,
          transportMode: seed.transportMode as never,
          consumingTaskId: taskByCode.get(seed.consumingActivityCode)!,
          legs: {
            create: seed.legs.map((l, i) => ({
              kind: l.kind as never,
              name: l.name,
              days: l.days,
              sequence: i,
            })),
          },
        },
      });
      created.push(seed.code);
    }

    return ok(
      {
        created,
        skipped: [...existingCodes],
        message:
          created.length === 0
            ? "No new packages to seed."
            : `Seeded ${created.length} long-lead package(s).`,
      },
      created.length ? 201 : 200
    );
  } catch (err) {
    return handleError(err);
  }
}
