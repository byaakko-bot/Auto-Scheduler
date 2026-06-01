import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "./prisma";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400, extra?: unknown) {
  return NextResponse.json({ error: message, details: extra }, { status });
}

export function handleError(err: unknown) {
  if (err instanceof ZodError) {
    return fail("Validation failed", 422, err.flatten());
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error("[api] error:", message);
  return fail(message, 500);
}

// In local/dev mode (auth bypassed) we attach work to a single default company.
export async function getOrCreateDefaultCompany() {
  const existing = await db.company.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return db.company.create({
    data: { name: "My Company", country: "—", city: "—" },
  });
}

const DEFAULT_PARTIES: { name: string; type: string }[] = [
  { name: "Developer", type: "DEVELOPER" },
  { name: "General Contractor", type: "GENERAL_CONTRACTOR" },
  { name: "Site Manager", type: "SITE_MANAGER" },
  { name: "Architect", type: "ARCHITECT" },
  { name: "Structural Engineer", type: "STRUCTURAL_ENGINEER" },
  { name: "MEP Engineer", type: "MEP_ENGINEER" },
  { name: "Subcontractor", type: "SUBCONTRACTOR" },
  { name: "Supplier", type: "SUPPLIER" },
  { name: "Logistics", type: "LOGISTICS" },
  { name: "Finance Controller", type: "FINANCE_CONTROLLER" },
  { name: "Quality Inspector", type: "QUALITY_INSPECTOR" },
  { name: "Authority", type: "AUTHORITY" },
];

// Ensures the standard set of parties exists for a company and is linked to a
// project. Returns a map of PartyType -> partyId.
export async function ensureProjectParties(
  companyId: string,
  projectId: string
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};

  for (const p of DEFAULT_PARTIES) {
    let party = await db.party.findFirst({
      where: { companyId, type: p.type as never },
    });
    if (!party) {
      party = await db.party.create({
        data: { companyId, name: p.name, type: p.type as never },
      });
    }
    map[p.type] = party.id;

    const link = await db.projectParty.findFirst({
      where: { projectId, partyId: party.id },
    });
    if (!link) {
      await db.projectParty.create({
        data: { projectId, partyId: party.id },
      });
    }
  }

  return map;
}
