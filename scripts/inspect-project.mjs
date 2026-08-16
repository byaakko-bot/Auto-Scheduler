// Read-only diagnostic for a single project.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const needle = process.argv[2] ?? "wehrhahn";
const project = await db.project.findFirst({
  where: { name: { contains: needle, mode: "insensitive" } },
});

if (!project) {
  const all = await db.project.findMany({ select: { name: true, code: true } });
  console.log("no match. projects:", all);
  await db.$disconnect();
  process.exit(0);
}

console.log("PROJECT");
for (const k of [
  "name", "code", "buildingType", "constructionMethod", "totalAreaSqm",
  "numberOfFloors", "numberOfUnits", "numberOfBasements",
  "workingDaysPerWeek", "workingHoursPerDay", "status",
]) console.log(`  ${k.padEnd(20)} ${project[k]}`);
console.log(`  ${"startDate".padEnd(20)} ${project.startDate?.toISOString().slice(0, 10)}`);
console.log(`  ${"targetEndDate".padEnd(20)} ${project.targetEndDate?.toISOString().slice(0, 10)}`);

const buildings = await db.building.count({ where: { projectId: project.id } });
console.log(`  ${"buildings".padEnd(20)} ${buildings}`);

const tasks = await db.task.findMany({
  where: { projectId: project.id },
  orderBy: { plannedEndDate: "desc" },
});
console.log(`\nTASKS: ${tasks.length}`);
if (tasks.length) {
  const first = tasks.reduce((m, t) => (t.plannedStartDate < m ? t.plannedStartDate : m), tasks[0].plannedStartDate);
  const last = tasks[0].plannedEndDate;
  console.log(`  span ${first.toISOString().slice(0, 10)} -> ${last.toISOString().slice(0, 10)}`);
  console.log(`  total duration days (sum): ${tasks.reduce((a, t) => a + t.durationDays, 0)}`);
  console.log(`  has CPM offsets: ${tasks.filter((t) => t.earlyStartOffset !== null).length}/${tasks.length}`);
  console.log("\n  LONGEST ACTIVITIES:");
  for (const t of [...tasks].sort((a, b) => b.durationDays - a.durationDays).slice(0, 10)) {
    console.log(
      `    ${t.code.padEnd(8)} ${t.name.slice(0, 30).padEnd(31)} ${String(t.durationDays).padStart(5)}d  ` +
      `qty=${t.quantity ?? "-"} ${t.quantityUnit ?? ""}`
    );
    if (t.notes) console.log(`             ${t.notes.slice(0, 100)}`);
  }
}
await db.$disconnect();
