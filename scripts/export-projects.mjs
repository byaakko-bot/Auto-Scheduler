// Exports named projects and everything hanging off them to JSON, so a
// deletion is recoverable. Read-only.
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";

const db = new PrismaClient();
const codes = process.argv.slice(2);
if (codes.length === 0) {
  console.log("usage: export-projects.mjs <code> [<code> ...]");
  process.exit(1);
}

const out = [];
for (const code of codes) {
  const project = await db.project.findFirst({ where: { code } });
  if (!project) {
    console.log(`  ${code}: not found`);
    continue;
  }

  const [tasks, workPackages, milestones, baselines, scenarios, procurement, audit] =
    await Promise.all([
      db.task.findMany({ where: { projectId: project.id } }),
      db.workPackage.findMany({ where: { projectId: project.id } }),
      db.milestone.findMany({ where: { projectId: project.id } }),
      db.baseline.findMany({ where: { projectId: project.id }, include: { tasks: true } }),
      db.scenario.findMany({ where: { projectId: project.id }, include: { changes: true } }),
      db.procurementPackage.findMany({ where: { projectId: project.id }, include: { legs: true } }),
      db.auditLog.findMany({ where: { projectId: project.id } }),
    ]);

  const dependencies = await db.dependency.findMany({
    where: { predecessor: { projectId: project.id } },
  });
  const raci = await db.raciAssignment.findMany({
    where: { task: { projectId: project.id } },
  });

  console.log(
    `  ${code.padEnd(14)} ${project.name.padEnd(24)} tasks=${tasks.length} deps=${dependencies.length} ` +
      `wp=${workPackages.length} milestones=${milestones.length} raci=${raci.length} ` +
      `baselines=${baselines.length} scenarios=${scenarios.length} procurement=${procurement.length} audit=${audit.length}`
  );

  out.push({
    project,
    tasks,
    dependencies,
    workPackages,
    milestones,
    raci,
    baselines,
    scenarios,
    procurement,
    audit,
  });
}

const path = process.env.EXPORT_PATH ?? "/tmp/buildora-export.json";
writeFileSync(path, JSON.stringify(out, null, 2));
console.log(`\nwritten to ${path}`);
await db.$disconnect();
