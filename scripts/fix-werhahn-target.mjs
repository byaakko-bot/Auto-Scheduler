// Restores the Werhahn Factory contract target date, which the old
// generate-schedule route overwrote with its own computed finish.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const p = await db.project.findFirst({ where: { code: "WF-01" } });
if (!p) {
  console.log("WF-01 not found");
  await db.$disconnect();
  process.exit(0);
}

console.log(
  "before: start",
  p.startDate.toISOString().slice(0, 10),
  "target",
  p.targetEndDate?.toISOString().slice(0, 10)
);

// One year from the project start.
const target = new Date("2028-05-01T00:00:00.000Z");

const upd = await db.project.update({
  where: { id: p.id },
  data: { targetEndDate: target },
});

await db.auditLog.create({
  data: {
    projectId: p.id,
    action: "UPDATE",
    entity: "Project",
    entityId: p.id,
    field: "targetEndDate",
    oldValue: p.targetEndDate?.toISOString() ?? null,
    newValue: target.toISOString(),
    reason:
      "Restoring the 1-year contract target overwritten by the old generate-schedule bug",
  },
});

console.log("after:  target", upd.targetEndDate.toISOString().slice(0, 10), "(audit logged)");
await db.$disconnect();
