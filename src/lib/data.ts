import { db } from "./prisma";

// Wraps a DB call so that pages render an empty/fallback state instead of
// crashing when DATABASE_URL is not reachable (e.g. before first setup).
export async function safeDb<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[data] DB query failed, using fallback:", (err as Error).message);
    }
    return fallback;
  }
}

export async function getProjects() {
  return safeDb(
    () =>
      db.project.findMany({
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
  return safeDb(
    () =>
      db.project.findUnique({
        where: { id },
        include: { company: true },
      }),
    null
  );
}

export async function getProjectScheduleData(projectId: string) {
  return safeDb(
    async () => {
      const tasks = await db.task.findMany({
        where: { projectId },
        orderBy: { sortOrder: "asc" },
      });
      const deps = await db.dependency.findMany({
        where: {
          predecessor: { projectId },
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
  return safeDb(
    async () => {
      const parties = await db.projectParty.findMany({
        where: { projectId },
        include: { party: true },
      });
      const tasks = await db.task.findMany({
        where: { projectId },
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
  return safeDb(
    async () => {
      const [project, tasks, milestones, risks] = await Promise.all([
        db.project.findUnique({ where: { id: projectId }, include: { company: true } }),
        db.task.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" } }),
        db.milestone.findMany({ where: { projectId }, orderBy: { plannedDate: "asc" } }),
        db.risk.findMany({ where: { projectId }, orderBy: { riskScore: "desc" } }),
      ]);
      return { project, tasks, milestones, risks };
    },
    { project: null, tasks: [], milestones: [], risks: [] }
  );
}
