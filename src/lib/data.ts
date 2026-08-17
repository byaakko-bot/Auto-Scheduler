import { db } from "./prisma";
import { AuthError, requireCompany } from "./auth/session";

// Wraps a DB call so that pages render an empty/fallback state instead of
// crashing when DATABASE_URL is not reachable (e.g. before first setup).
export async function safeDb<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // An authorisation decision is not an infrastructure failure. Swallowing it
    // would render an empty page where the caller should be redirected or told
    // plainly that they may not see this.
    if (err instanceof AuthError) throw err;
    if (process.env.NODE_ENV === "development") {
      console.warn("[data] DB query failed, using fallback:", (err as Error).message);
    }
    return fallback;
  }
}

/**
 * Confirms the caller's company owns the project before any of its rows are
 * read. Every loader below funnels through this, so a project id lifted from a
 * URL cannot reach another tenant's data.
 */
async function scopedProjectId(projectId: string): Promise<string> {
  const user = await requireCompany();
  const project = await db.project.findFirst({
    where: { id: projectId, companyId: user.companyId },
    select: { id: true },
  });
  if (!project) throw new AuthError("Project not found", 404);
  return project.id;
}

export async function getProjects() {
  const user = await requireCompany();
  return safeDb(
    () =>
      db.project.findMany({
        where: { companyId: user.companyId },
        orderBy: { createdAt: "desc" },
        include: {
          company: true,
          _count: { select: { tasks: true, risks: true, milestones: true } },
        },
      }),
    []
  );
}

export async function getProject(id: string) {
  const user = await requireCompany();
  return safeDb(
    () =>
      db.project.findFirst({
        where: { id, companyId: user.companyId },
        include: { company: true },
      }),
    null
  );
}

export async function getProjectScheduleData(projectId: string) {
  const id = await scopedProjectId(projectId);
  return safeDb(
    async () => {
      const tasks = await db.task.findMany({
        where: { projectId: id },
        orderBy: { sortOrder: "asc" },
      });
      const deps = await db.dependency.findMany({
        where: {
          predecessor: { projectId: id },
        },
        include: {
          predecessor: { select: { code: true } },
          successor: { select: { code: true } },
        },
      });
      return { tasks, deps };
    },
    { tasks: [], deps: [] }
  );
}

export async function getRaciData(projectId: string) {
  const id = await scopedProjectId(projectId);
  return safeDb(
    async () => {
      const parties = await db.projectParty.findMany({
        where: { projectId: id },
        include: { party: true },
      });
      const tasks = await db.task.findMany({
        where: { projectId: id },
        orderBy: { sortOrder: "asc" },
        include: { raciAssignments: true },
      });
      return {
        parties: parties.map((pp) => ({
          id: pp.party.id,
          name: pp.party.name,
          type: pp.party.type as string,
        })),
        tasks: tasks.map((t) => ({
          id: t.id,
          code: t.code,
          name: t.name,
          phase: t.phase,
          isMilestone: t.isMilestone,
          raci: t.raciAssignments.map((r) => ({
            partyId: r.partyId,
            raciRole: r.raciRole as string,
          })),
        })),
      };
    },
    { parties: [], tasks: [] }
  );
}

export async function getDashboardData(projectId: string) {
  const id = await scopedProjectId(projectId);
  return safeDb(
    async () => {
      const [project, tasks, milestones, risks] = await Promise.all([
        db.project.findUnique({ where: { id }, include: { company: true } }),
        db.task.findMany({ where: { projectId: id }, orderBy: { sortOrder: "asc" } }),
        db.milestone.findMany({ where: { projectId: id }, orderBy: { plannedDate: "asc" } }),
        db.risk.findMany({ where: { projectId: id }, orderBy: { riskScore: "desc" } }),
      ]);
      return { project, tasks, milestones, risks };
    },
    { project: null, tasks: [], milestones: [], risks: [] }
  );
}
