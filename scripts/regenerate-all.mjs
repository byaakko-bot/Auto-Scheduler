// Regenerates every project through the deployed API so they all pick up the
// current engine, and reports before/after. Read-only until it posts.
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BUILDORA_BASE ?? "https://buildora-platform.vercel.app";
const db = new PrismaClient();

const projects = await db.project.findMany({
  orderBy: { createdAt: "asc" },
  select: {
    id: true,
    name: true,
    code: true,
    startDate: true,
    targetEndDate: true,
    workingDaysPerWeek: true,
  },
});

const iso = (d) => (d ? d.toISOString().slice(0, 10) : "—");

for (const p of projects) {
  const tasks = await db.task.findMany({
    where: { projectId: p.id },
    orderBy: { plannedEndDate: "desc" },
    take: 1,
  });
  const beforeFinish = tasks[0]?.plannedEndDate ?? null;

  const res = await fetch(`${BASE}/api/projects/${p.id}/generate-schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force: true }),
  });
  const json = await res.json();

  if (!res.ok) {
    console.log(`\n${p.name} [${p.code}]  ERROR ${json.error}`);
    continue;
  }

  const fit = json.fit ?? {};
  const after = json.projectEndDate?.slice(0, 10);
  const overrun =
    p.targetEndDate && json.projectEndDate
      ? Math.round(
          (new Date(json.projectEndDate) - p.targetEndDate) / 86_400_000
        )
      : null;

  console.log(`\n${p.name} [${p.code}]  ${p.workingDaysPerWeek}-day week`);
  console.log(`  start ${iso(p.startDate)}  target ${iso(p.targetEndDate)}`);
  console.log(`  finish ${iso(beforeFinish)}  ->  ${after}`);
  console.log(
    `  ${json.durationWorkingDays} wd | crews ${fit.crewsRequired ?? "n/a"} | ` +
      `target met: ${fit.achieved ?? "n/a"}` +
      (overrun !== null ? ` | ${overrun > 0 ? "+" : ""}${overrun} calendar days vs target` : "")
  );
  if (fit.requested && !fit.achieved) {
    console.log(`  ${fit.explanation}`);
  }
}

await db.$disconnect();
