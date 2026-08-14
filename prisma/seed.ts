import { PrismaClient, type PartyType } from "@prisma/client";
import { ScheduleEngine } from "../src/engine";
import { DEFAULT_PRODUCTIVITY } from "../src/engine/constants";
import { raciForPhase } from "../src/engine/raciAssigner";

const db = new PrismaClient();

function titleCase(s: string): string {
  return s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function main() {
  console.log("Seeding Buildora demo data…");

  // Clean slate for the demo company.
  const existing = await db.company.findFirst({ where: { name: "Meridian Development Group" } });
  if (existing) {
    await db.project.deleteMany({ where: { companyId: existing.id } });
    await db.party.deleteMany({ where: { companyId: existing.id } });
    await db.user.deleteMany({ where: { companyId: existing.id } });
    await db.company.delete({ where: { id: existing.id } });
  }

  const company = await db.company.create({
    data: { name: "Meridian Development Group", country: "UAE", city: "Dubai" },
  });

  await db.user.createMany({
    data: [
      { authId: "seed-admin", email: "admin@meridian.ae", name: "Aisha Admin", role: "ADMIN", companyId: company.id },
      { authId: "seed-pm", email: "pm@meridian.ae", name: "Pranav PM", role: "PROJECT_MANAGER", companyId: company.id },
      { authId: "seed-site", email: "site@meridian.ae", name: "Sami Site", role: "SITE_MANAGER", companyId: company.id },
    ],
  });

  // Parties
  const partyDefs: { name: string; type: PartyType; contactEmail: string }[] = [
    { name: "Meridian Development", type: "DEVELOPER", contactEmail: "dev@meridian.ae" },
    { name: "AlBina Contracting", type: "GENERAL_CONTRACTOR", contactEmail: "pm@albina.ae" },
    { name: "Sami Site Management", type: "SITE_MANAGER", contactEmail: "site@meridian.ae" },
    { name: "Studio Arc", type: "ARCHITECT", contactEmail: "arch@studioarc.ae" },
    { name: "Strucform Engineers", type: "STRUCTURAL_ENGINEER", contactEmail: "se@strucform.ae" },
    { name: "Gulf MEP Solutions", type: "MEP_ENGINEER", contactEmail: "mep@gulfmep.ae" },
    { name: "AlBina Subcontractors", type: "SUBCONTRACTOR", contactEmail: "subs@albina.ae" },
    { name: "Emirates Building Materials", type: "SUPPLIER", contactEmail: "sales@ebm.ae" },
    { name: "Falcon Logistics", type: "LOGISTICS", contactEmail: "ops@falconlog.ae" },
    { name: "Meridian Finance", type: "FINANCE_CONTROLLER", contactEmail: "finance@meridian.ae" },
    { name: "Yusuf Quality Control", type: "QUALITY_INSPECTOR", contactEmail: "qc@yusuf.ae" },
    { name: "Dubai Municipality", type: "AUTHORITY", contactEmail: "permits@dm.gov.ae" },
  ];

  const partyMap: Record<string, string> = {};
  for (const p of partyDefs) {
    const party = await db.party.create({
      data: { companyId: company.id, name: p.name, type: p.type, contactEmail: p.contactEmail, country: "UAE" },
    });
    partyMap[p.type] = party.id;
  }

  // Project
  const startDate = new Date("2026-09-01T00:00:00.000Z");
  const project = await db.project.create({
    data: {
      name: "Meridian Heights",
      code: "MDH-001",
      clientName: "Meridian Development Group",
      description: "6-storey residential apartment building, 36 units, RC construction",
      companyId: company.id,
      country: "UAE",
      city: "Dubai",
      buildingType: "RESIDENTIAL_APARTMENT",
      constructionMethod: "REINFORCED_CONCRETE",
      totalAreaSqm: 3600,
      numberOfFloors: 6,
      numberOfBasements: 1,
      numberOfUnits: 36,
      startDate,
      targetEndDate: startDate,
      workingDaysPerWeek: 6,
      workingHoursPerDay: 10,
      status: "ACTIVE",
      currency: "USD",
    },
  });

  for (const p of partyDefs) {
    await db.projectParty.create({ data: { projectId: project.id, partyId: partyMap[p.type] } });
  }

  // Generate schedule with the engine
  const engine = new ScheduleEngine({
    totalAreaSqm: 3600,
    numberOfFloors: 6,
    numberOfUnits: 36,
    numberOfBasements: 1,
    crewSize: 20,
    productivityRates: DEFAULT_PRODUCTIVITY,
    constructionMethod: "REINFORCED_CONCRETE",
    buildingType: "RESIDENTIAL_APARTMENT",
    startDate,
    workingDaysPerWeek: 6,
    permitWeeks: 6,
  });
  const schedule = engine.generate();

  // Work packages per phase
  const phases: string[] = [];
  for (const t of schedule.tasks) if (!phases.includes(t.phase)) phases.push(t.phase);
  const phaseToWp: Record<string, string> = {};
  for (let i = 0; i < phases.length; i++) {
    const wp = await db.workPackage.create({
      data: {
        projectId: project.id,
        code: String(i + 1),
        name: titleCase(phases[i]),
        phase: phases[i],
        sortOrder: i,
        color: schedule.tasks.find((t) => t.phase === phases[i])?.color ?? null,
      },
    });
    phaseToWp[phases[i]] = wp.id;
  }

  // Tasks
  const codeToTaskId: Record<string, string> = {};
  for (const t of schedule.tasks) {
    const created = await db.task.create({
      data: {
        projectId: project.id,
        workPackageId: phaseToWp[t.phase],
        code: t.code,
        name: t.name,
        phase: t.phase,
        plannedStartDate: t.plannedStartDate,
        plannedEndDate: t.plannedEndDate,
        durationDays: t.durationDays,
        isCritical: t.isCritical,
        isMilestone: t.isMilestone,
        floatDays: t.floatDays,
        crewSize: 20,
        quantity: t.quantity ?? null,
        quantityUnit: t.quantityUnit ?? null,
        sortOrder: t.sortOrder,
      },
    });
    codeToTaskId[t.code] = created.id;
  }

  // Dependencies
  for (const t of schedule.tasks) {
    for (const p of t.predecessors) {
      if (!codeToTaskId[p.code]) continue;
      await db.dependency.create({
        data: {
          predecessorId: codeToTaskId[p.code],
          successorId: codeToTaskId[t.code],
          type: p.type,
          lagDays: p.lag,
        },
      });
    }
  }

  // RACI assignments
  for (const t of schedule.tasks) {
    for (const seed of raciForPhase(t.phase)) {
      const partyId = partyMap[seed.partyType];
      if (!partyId) continue;
      await db.raciAssignment.create({
        data: { taskId: codeToTaskId[t.code], partyId, raciRole: seed.raciRole },
      });
    }
  }

  // Milestones (from generated milestone tasks)
  for (const t of schedule.tasks.filter((x) => x.isMilestone)) {
    await db.milestone.create({
      data: { projectId: project.id, name: t.name, plannedDate: t.plannedStartDate },
    });
  }

  await db.project.update({
    where: { id: project.id },
    data: { targetEndDate: schedule.projectEndDate },
  });

  // Budget lines per phase
  const budgetLines: { phase: string; name: string; estimatedCost: number; category: string }[] = [
    { phase: "DESIGN", name: "Design Fees", estimatedCost: 85000, category: "PROFESSIONAL_FEES" },
    { phase: "PERMITS", name: "Permit Fees", estimatedCost: 22000, category: "PROFESSIONAL_FEES" },
    { phase: "SITE_PREP", name: "Site Preparation", estimatedCost: 45000, category: "LABOUR" },
    { phase: "EARTHWORKS", name: "Excavation & Piling", estimatedCost: 320000, category: "LABOUR" },
    { phase: "FOUNDATIONS", name: "Foundations", estimatedCost: 480000, category: "MATERIALS" },
    { phase: "STRUCTURE", name: "Structural RC Works", estimatedCost: 1250000, category: "MATERIALS" },
    { phase: "ENVELOPE", name: "External Walls", estimatedCost: 210000, category: "MATERIALS" },
    { phase: "ROOF", name: "Roof System", estimatedCost: 95000, category: "MATERIALS" },
    { phase: "FACADE", name: "Facade & Cladding", estimatedCost: 380000, category: "MATERIALS" },
    { phase: "WINDOWS_DOORS", name: "Windows & Doors", estimatedCost: 220000, category: "MATERIALS" },
    { phase: "MEP_ROUGH", name: "MEP Rough-in", estimatedCost: 510000, category: "EQUIPMENT" },
    { phase: "PARTITIONS", name: "Internal Partitions", estimatedCost: 145000, category: "MATERIALS" },
    { phase: "PLASTERING", name: "Plastering", estimatedCost: 190000, category: "LABOUR" },
    { phase: "SCREED_FLOORS", name: "Floor Screed", estimatedCost: 120000, category: "LABOUR" },
    { phase: "FINISHING", name: "Finishing Works", estimatedCost: 680000, category: "MATERIALS" },
    { phase: "EXTERNAL_WORKS", name: "External Works", estimatedCost: 175000, category: "LABOUR" },
    { phase: "COMMISSIONING", name: "Commissioning", estimatedCost: 35000, category: "PROFESSIONAL_FEES" },
  ];
  for (const b of budgetLines) {
    await db.budget.create({
      data: {
        projectId: project.id,
        workPackageId: phaseToWp[b.phase] ?? null,
        name: b.name,
        estimatedCost: b.estimatedCost,
        committedCost: Math.round(b.estimatedCost * 0.4),
        actualCost: Math.round(b.estimatedCost * 0.15),
        forecastCost: b.estimatedCost,
        category: b.category,
        currency: "USD",
      },
    });
  }
  await db.budget.create({
    data: { projectId: project.id, name: "10% Contingency", estimatedCost: 497000, forecastCost: 497000, category: "CONTINGENCY", currency: "USD" },
  });

  // Suppliers
  await db.supplier.createMany({
    data: [
      { partyId: partyMap.SUPPLIER, material: "Rebar & Structural Steel", leadTimeDays: 28, countryOrigin: "UAE" },
      { partyId: partyMap.SUPPLIER, material: "Windows & Doors", leadTimeDays: 56, countryOrigin: "Germany" },
      { partyId: partyMap.SUPPLIER, material: "MEP Equipment", leadTimeDays: 45, countryOrigin: "Italy" },
    ],
  });

  // Risks
  await db.risk.createMany({
    data: [
      { projectId: project.id, title: "Permit delay from Dubai Municipality", level: "HIGH", probability: 0.4, impact: 0.8, riskScore: 0.32, category: "SCHEDULE", mitigation: "Appoint specialist permit expeditor. Submit 2 weeks early." },
      { projectId: project.id, title: "Rebar price increase", level: "MEDIUM", probability: 0.5, impact: 0.4, riskScore: 0.2, category: "COST", mitigation: "Fix price with supplier at contract award. Consider hedging." },
      { projectId: project.id, title: "Ground conditions — unexpected rock", level: "MEDIUM", probability: 0.25, impact: 0.6, riskScore: 0.15, category: "SCHEDULE", mitigation: "Commission full geotechnical survey before pricing." },
      { projectId: project.id, title: "Formwork subcontractor capacity shortage", level: "HIGH", probability: 0.35, impact: 0.7, riskScore: 0.245, category: "SCHEDULE", mitigation: "Pre-qualify 3 formwork subcontractors. Award 4 weeks before start." },
      { projectId: project.id, title: "Window delivery delay (56-day lead time)", level: "MEDIUM", probability: 0.3, impact: 0.5, riskScore: 0.15, category: "LOGISTICS", mitigation: "Order by week 10 of project. Include penalty clauses in PO." },
    ],
  });

  console.log(`Seeded project "${project.name}" with ${schedule.tasks.length} tasks.`);
  console.log(`Project end date: ${schedule.projectEndDate.toDateString()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
