// Read-only pre-flight for the Phase 1 migration. Makes no changes.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const q = (sql, ...args) => db.$queryRawUnsafe(sql, ...args);

try {
  const cols = await q(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'Task' AND column_name IN
      ('freeFloatDays','criticalityBand','earlyStartOffset','constraintType')
  `);
  console.log("Phase-1 Task columns already present:", cols.length);

  const tables = await q(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name IN
      ('Calendar','Baseline','BaselineTask','ScheduleRevision','AuditLog')
  `);
  console.log("Phase-1 tables already present:", tables.map((t) => t.table_name));

  const dupes = await q(`
    SELECT "projectId", code, COUNT(*)::int AS n
    FROM "Task" GROUP BY "projectId", code HAVING COUNT(*) > 1
  `);
  console.log("Duplicate (projectId, code) pairs:", dupes.length);
  if (dupes.length) console.log("  sample:", dupes.slice(0, 5));

  const counts = await q(`
    SELECT
      (SELECT COUNT(*)::int FROM "Project")    AS projects,
      (SELECT COUNT(*)::int FROM "Task")       AS tasks,
      (SELECT COUNT(*)::int FROM "Dependency") AS dependencies
  `);
  console.log("Row counts:", counts[0]);
} finally {
  await db.$disconnect();
}
