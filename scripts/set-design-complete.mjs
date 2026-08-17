// Marks design and permits as already complete on every project, then
// regenerates through the deployed API and reports the effect.
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BUILDORA_BASE ?? "https://buildora-platform.vercel.app";
const db = new PrismaClient();

const projects = await db.project.findMany({ orderBy: { createdAt: "asc" } });
const iso = (d) => (d ? d.toISOString().slice(0, 10) : "—");

for (const p of projects) {
  const before = await db.task.findFirst({
    where: { projectId: p.id },
    orderBy: { plannedEndDate: "desc" },
    select: { plannedEndDate: true },
  });

  const res = await fetch(`${BASE}/api/projects/${p.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ designComplete: true, permitsObtained: true }),
  });
  if (!res.ok) {
    console.log(`${p.name}: PATCH failed — ${(await res.json()).error}`);
    continue;
  }

  const gen = await fetch(`${BASE}/api/projects/${p.id}/generate-schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force: true }),
  });
  const json = await gen.json();
  if (!gen.ok) {
    console.log(`${p.name}: regenerate failed — ${json.error}`);
    continue;
  }

  const fit = json.fit ?? {};
  const over =
    p.targetEndDate && json.projectEndDate
      ? Math.round((new Date(json.projectEndDate) - p.targetEndDate) / 86_400_000)
      : null;

  console.log(
    `${p.name.padEnd(28)} ${iso(before?.plannedEndDate)} -> ${json.projectEndDate.slice(0, 10)}  ` +
      `${String(json.durationWorkingDays).padStart(4)} wd | ${fit.crewsRequired ?? "-"} crews | ` +
      `met=${fit.achieved ?? "-"}` +
      (over !== null ? ` | ${over > 0 ? "+" : ""}${over}d vs target` : "")
  );
}

await db.$disconnect();
