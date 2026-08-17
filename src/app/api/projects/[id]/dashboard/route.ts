import { requireProject } from "@/lib/auth/session";
import { db } from "@/lib/prisma";
import { fail, handleError, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // A project id in the URL is an identifier, not an authorisation.
    await requireProject(params.id, "VIEWER");
    const project = await db.project.findUnique({
      where: { id: params.id },
      include: { company: true },
    });
    if (!project) return fail("Project not found", 404);

    const [tasks, milestones, risks] = await Promise.all([
      db.task.findMany({ where: { projectId: params.id }, orderBy: { sortOrder: "asc" } }),
      db.milestone.findMany({ where: { projectId: params.id }, orderBy: { plannedDate: "asc" } }),
      db.risk.findMany({ where: { projectId: params.id }, orderBy: { riskScore: "desc" } }),
    ]);

    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const totalProgress =
      tasks.length > 0
        ? tasks.reduce((s, t) => s + t.progressPct, 0) / tasks.length
        : 0;
    const delayed = tasks.filter((t) => t.status === "DELAYED");
    const dueThisWeek = tasks.filter(
      (t) => t.plannedEndDate >= now && t.plannedEndDate <= weekAhead
    );
    const nextMilestone = milestones.find((m) => !m.achieved && m.plannedDate >= now);
    const openRisks = risks.filter((r) => r.status === "OPEN");

    return ok({
      project,
      summary: {
        overallProgress: Math.round(totalProgress),
        delayedCount: delayed.length,
        dueThisWeekCount: dueThisWeek.length,
        openRiskCount: openRisks.length,
        criticalCount: tasks.filter((t) => t.isCritical).length,
        nextMilestone: nextMilestone
          ? { name: nextMilestone.name, date: nextMilestone.plannedDate }
          : null,
      },
      delayedTasks: delayed.slice(0, 10),
      criticalTasks: tasks.filter((t) => t.isCritical).slice(0, 5),
      milestones,
      risks: openRisks.slice(0, 5),
    });
  } catch (err) {
    return handleError(err);
  }
}
