// Sets a temporary ETA on one package to exercise the §17 risk
// classification against live data, then clears it again.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const pkg = await db.procurementPackage.findFirst({
  where: { code: "PKG-DOORS" },
  include: { consumingTask: true },
});
if (!pkg?.consumingTask) {
  console.log("PKG-DOORS or its consuming task not found");
  await db.$disconnect();
  process.exit(0);
}

const need = pkg.consumingTask.plannedStartDate;
const eta = new Date(need.getTime() + 4 * 86_400_000); // four days late

console.log("consuming activity :", pkg.consumingTask.code, pkg.consumingTask.name);
console.log("required on site   :", need.toISOString().slice(0, 10));
console.log("simulated ETA      :", eta.toISOString().slice(0, 10), "(4 days late)");
console.log("total float        :", pkg.consumingTask.floatDays, "d");
console.log("free float         :", pkg.consumingTask.freeFloatDays, "d");

await db.procurementPackage.update({
  where: { id: pkg.id },
  data: { currentEtaDate: eta, status: "ORDERED" },
});
console.log("\nETA set — query the report, then run with --clear to revert.");

if (process.argv.includes("--clear")) {
  await db.procurementPackage.update({
    where: { id: pkg.id },
    data: { currentEtaDate: null, status: "PLANNED" },
  });
  console.log("ETA cleared, status back to PLANNED.");
}
await db.$disconnect();
