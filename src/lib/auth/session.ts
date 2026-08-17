// Request-scoped identity, tenancy and role checks.
//
// Every guarded entry point resolves the caller here, and every tenant-scoped
// query takes its `companyId` from this module rather than from the request.
// A project id in a URL is an identifier, never an authorisation.

import type { Role } from "@prisma/client";
import { db } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { authMode } from "./config";

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 404
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface SessionUser {
  id: string;
  authId: string;
  email: string;
  name: string;
  role: Role;
  /** Null until an administrator places the user in a workspace. */
  companyId: string | null;
}

// Ascending privilege. A check is "at least this role".
const RANK: Record<Role, number> = {
  VIEWER: 0,
  SITE_MANAGER: 1,
  PROJECT_MANAGER: 2,
  ADMIN: 3,
  OWNER: 4,
};

export function hasRole(user: SessionUser, atLeast: Role): boolean {
  return RANK[user.role] >= RANK[atLeast];
}

/** Supabase user ids are UUIDs; anything else marks a row as never claimed. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Maps a verified Supabase identity onto a Buildora user row, provisioning one
 * on first sign-in.
 *
 * Access is never granted implicitly. A newly provisioned user lands with no
 * company and therefore sees nothing. There are exactly two ways to be placed
 * in a workspace:
 *
 *  - BUILDORA_BOOTSTRAP_OWNER_EMAIL, which names the single account allowed to
 *    take ownership of the workspace on first sign-in. This is how the first
 *    administrator gets in, and it requires control of the environment.
 *  - Claiming a pending invitation: an administrator creates the user row with
 *    the invitee's email and an unclaimed authId, and the row binds to the
 *    Supabase identity when that person first signs in.
 */
async function resolveUser(
  authId: string,
  email: string,
  name: string
): Promise<SessionUser> {
  const existing = await db.user.findUnique({ where: { authId } });
  if (existing) return existing;

  const normalised = email.trim().toLowerCase();

  // Pending invitation: a row exists for this email that no Supabase identity
  // has claimed yet.
  const pending = await db.user.findUnique({ where: { email: normalised } });
  if (pending && !UUID.test(pending.authId)) {
    return db.user.update({
      where: { id: pending.id },
      data: { authId, name: pending.name || name },
    });
  }

  const bootstrapEmail = process.env.BUILDORA_BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
  if (bootstrapEmail && bootstrapEmail === normalised) {
    // Adopt the existing workspace when there is exactly one, so the first
    // administrator inherits the data already in the database rather than
    // starting an empty second tenant beside it.
    const companies = await db.company.findMany({
      orderBy: { createdAt: "asc" },
      take: 2,
    });
    const company =
      companies.length === 1
        ? companies[0]
        : await db.company.create({
            data: { name: "My Company", country: "—", city: "—" },
          });

    return db.user.create({
      data: {
        authId,
        email: normalised,
        name: name || normalised,
        role: "OWNER",
        companyId: company.id,
      },
    });
  }

  // Signed in, but not a member of any workspace.
  return db.user.create({
    data: {
      authId,
      email: normalised,
      name: name || normalised,
      role: "VIEWER",
      companyId: null,
    },
  });
}

/**
 * The synthetic identity used when NEXT_PUBLIC_DEV_AUTH_BYPASS is set. Only
 * reachable outside production — `authMode()` throws otherwise.
 */
async function devBypassUser(): Promise<SessionUser> {
  const company =
    (await db.company.findFirst({ orderBy: { createdAt: "asc" } })) ??
    (await db.company.create({
      data: { name: "My Company", country: "—", city: "—" },
    }));

  return {
    id: "dev-bypass",
    authId: "dev-bypass",
    email: "dev@localhost",
    name: "Local development",
    role: "OWNER",
    companyId: company.id,
  };
}

/** The signed-in user, or null. Never throws for an anonymous caller. */
export async function currentUser(): Promise<SessionUser | null> {
  if (authMode() === "DEV_BYPASS") return devBypassUser();

  const supabase = createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const name =
    (user.user_metadata?.name as string | undefined)?.trim() || user.email;
  return resolveUser(user.id, user.email, name);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new AuthError("Authentication required", 401);
  return user;
}

/** A signed-in user who belongs to a workspace. */
export async function requireCompany(): Promise<
  SessionUser & { companyId: string }
> {
  const user = await requireUser();
  if (!user.companyId) {
    throw new AuthError(
      "Your account is not a member of any workspace. Ask an administrator to invite you.",
      403
    );
  }
  return user as SessionUser & { companyId: string };
}

export async function requireRole(
  atLeast: Role
): Promise<SessionUser & { companyId: string }> {
  const user = await requireCompany();
  if (!hasRole(user, atLeast)) {
    throw new AuthError(
      `This action requires the ${atLeast} role or higher. Your role is ${user.role}.`,
      403
    );
  }
  return user;
}

/**
 * Loads a project the caller is entitled to see.
 *
 * A project the caller's company does not own reports 404, not 403: confirming
 * that an id exists leaks the shape of another tenant's portfolio.
 */
export async function requireProject(
  projectId: string,
  atLeast: Role = "VIEWER"
) {
  const user = await requireRole(atLeast);
  const project = await db.project.findFirst({
    where: { id: projectId, companyId: user.companyId },
  });
  if (!project) throw new AuthError("Project not found", 404);
  return { user, project };
}
