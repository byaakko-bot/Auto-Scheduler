import { db } from "@/lib/prisma";
import { fail, handleError, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const scenarios = await db.scenario.findMany({
      where: { projectId: params.id },
      include: { changes: true },
      orderBy: { createdAt: "desc" },
    });

    return ok(
      scenarios.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        changeCount: s.changes.length,
        finishShiftDays: s.finishShiftDays,
        isFeasible: s.isFeasible,
        evaluatedAt: s.evaluatedAt,
        createdAt: s.createdAt,
      }))
    );
  } catch (err) {
    return handleError(err);
  }
}

/**
 * §21 — creates a what-if scenario. Changes are stored against the scenario
 * and never applied to the live tasks; the baseline stays untouched.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const project = await db.project.findUnique({ where: { id: params.id } });
    if (!project) return fail("Project not found", 404);

    const body = await req.json().catch(() => ({}));
    const name: string = (body.name ?? "").trim();
    if (!name) return fail("A scenario name is required", 422);

    const changes = Array.isArray(body.changes) ? body.changes : [];
    if (changes.length === 0) {
      return fail("A scenario needs at least one change", 422);
    }

    const existing = await db.scenario.findFirst({
      where: { projectId: params.id, name },
    });
    if (existing) return fail(`A scenario named "${name}" already exists`, 409);

    const scenario = await db.scenario.create({
      data: {
        projectId: params.id,
        name,
        description: body.description ?? null,
        createdBy: body.createdBy ?? null,
        changes: {
          create: changes.map((c: Record<string, unknown>) => ({
            kind: String(c.kind),
            taskCode: String(c.taskCode),
            predecessorCode: c.predecessorCode ? String(c.predecessorCode) : null,
            value: Number(c.value ?? 0),
            dependencyType: c.dependencyType ? String(c.dependencyType) : null,
            constraintType: c.constraintType ? String(c.constraintType) : null,
            note: c.note ? String(c.note) : null,
          })),
        },
      },
      include: { changes: true },
    });

    return ok(
      { id: scenario.id, name: scenario.name, changeCount: scenario.changes.length },
      201
    );
  } catch (err) {
    return handleError(err);
  }
}
