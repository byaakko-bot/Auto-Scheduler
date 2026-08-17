import { db } from "@/lib/prisma";
import { fail, handleError, ok } from "@/lib/api";
import { createProjectSchema } from "@/lib/validation";
import { requireCompany, requireRole } from "@/lib/auth/session";
import { DEFAULT_PRODUCTIVITY } from "@/engine/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireCompany();
    const projects = await db.project.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "desc" },
      include: { company: true, _count: { select: { tasks: true } } },
    });
    return ok(projects);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    // The owning company comes from the session, never from the request body.
    const user = await requireRole("PROJECT_MANAGER");

    const body = await req.json();
    const input = createProjectSchema.parse(body);

    const existingCode = await db.project.findUnique({
      where: { code: input.code },
    });
    if (existingCode) {
      return fail(`Project code "${input.code}" already exists`, 409);
    }

    const startDate = new Date(input.startDate);
    const targetEndDate = input.targetEndDate
      ? new Date(input.targetEndDate)
      : new Date(startDate.getTime() + 1000 * 60 * 60 * 24 * 365);

    const project = await db.project.create({
      data: {
        name: input.name,
        code: input.code,
        clientName: input.clientName ?? null,
        description: input.description ?? null,
        companyId: user.companyId,
        country: input.country,
        city: input.city,
        address: input.address ?? null,
        buildingType: input.buildingType,
        constructionMethod: input.constructionMethod,
        totalAreaSqm: input.totalAreaSqm,
        numberOfFloors: input.numberOfFloors,
        numberOfUnits: input.numberOfUnits ?? null,
        numberOfBasements: input.numberOfBasements ?? 0,
        startDate,
        targetEndDate,
        workingDaysPerWeek: input.workingDaysPerWeek,
        workingHoursPerDay: input.workingHoursPerDay,
        currency: input.currency,
        status: "PLANNING",
      },
    });

    // Persist crew size + productivity on a lightweight resource record so the
    // schedule generator can read them back later if needed.
    await db.resource.create({
      data: {
        projectId: project.id,
        name: "Default crew",
        type: "LABOUR",
        unit: "day",
        unitCost: 0,
        currency: input.currency,
      },
    });

    return ok(
      {
        ...project,
        _generationInputs: {
          crewSize: input.crewSize,
          permitWeeks: input.permitWeeks ?? null,
          productivityRates: input.productivityRates ?? DEFAULT_PRODUCTIVITY,
        },
      },
      201
    );
  } catch (err) {
    return handleError(err);
  }
}
