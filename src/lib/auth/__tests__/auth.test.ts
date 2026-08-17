import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthConfigError,
  authMode,
  isProductionRuntime,
  supabaseCredentials,
} from "../config";
import { AuthError, hasRole, type SessionUser } from "../session";

const ENV_KEYS = [
  "NEXT_PUBLIC_DEV_AUTH_BYPASS",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "VERCEL_ENV",
  "NODE_ENV",
] as const;

// NODE_ENV is typed readonly, so the whole block is addressed through a
// mutable view of process.env.
const env = process.env as Record<string, string | undefined>;

const original = Object.fromEntries(ENV_KEYS.map((k) => [k, env[k]]));

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) delete env[key];
  for (const [k, v] of Object.entries(values)) env[k] = v;
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete env[key];
    else env[key] = original[key]!;
  }
  vi.restoreAllMocks();
});

const SUPABASE = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
};

describe("auth configuration fails closed", () => {
  it("throws rather than serving when nothing is configured", () => {
    setEnv({});
    expect(() => authMode()).toThrow(AuthConfigError);
  });

  // The regression that left production publicly readable: the old rule was
  // `disabled = flag || !url || !key`, so a missing variable opened the door.
  it("does not treat missing Supabase credentials as permission to skip auth", () => {
    setEnv({ VERCEL_ENV: "production" });
    expect(() => authMode()).toThrow(/Refusing to serve/i);
  });

  it("enforces Supabase when credentials are present", () => {
    setEnv({ ...SUPABASE, VERCEL_ENV: "production" });
    expect(authMode()).toBe("SUPABASE");
  });

  it("refuses to boot when the bypass is set in production", () => {
    setEnv({
      ...SUPABASE,
      NEXT_PUBLIC_DEV_AUTH_BYPASS: "true",
      VERCEL_ENV: "production",
    });
    expect(() => authMode()).toThrow(/must never exist/i);
  });

  it("allows the bypass on a preview deployment", () => {
    setEnv({ NEXT_PUBLIC_DEV_AUTH_BYPASS: "true", VERCEL_ENV: "preview" });
    expect(authMode()).toBe("DEV_BYPASS");
  });

  it("allows the bypass locally", () => {
    setEnv({ NEXT_PUBLIC_DEV_AUTH_BYPASS: "true", NODE_ENV: "development" });
    expect(authMode()).toBe("DEV_BYPASS");
  });

  it("treats a bare production NODE_ENV as production", () => {
    setEnv({ NODE_ENV: "production" });
    expect(isProductionRuntime()).toBe(true);
  });

  it("prefers VERCEL_ENV over NODE_ENV", () => {
    setEnv({ VERCEL_ENV: "preview", NODE_ENV: "production" });
    expect(isProductionRuntime()).toBe(false);
  });

  it("requires both Supabase variables, not just one", () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" });
    expect(supabaseCredentials()).toBeNull();
    expect(() => authMode()).toThrow(AuthConfigError);
  });
});

describe("role hierarchy", () => {
  const user = (role: SessionUser["role"]): SessionUser => ({
    id: "u1",
    authId: "a1",
    email: "u@example.com",
    name: "U",
    role,
    companyId: "c1",
  });

  it("grants a role to itself and everything below it", () => {
    expect(hasRole(user("OWNER"), "ADMIN")).toBe(true);
    expect(hasRole(user("ADMIN"), "ADMIN")).toBe(true);
    expect(hasRole(user("PROJECT_MANAGER"), "VIEWER")).toBe(true);
  });

  it("denies escalation", () => {
    expect(hasRole(user("VIEWER"), "SITE_MANAGER")).toBe(false);
    expect(hasRole(user("SITE_MANAGER"), "PROJECT_MANAGER")).toBe(false);
    expect(hasRole(user("PROJECT_MANAGER"), "ADMIN")).toBe(false);
    expect(hasRole(user("ADMIN"), "OWNER")).toBe(false);
  });

  it("keeps a viewer out of every write path", () => {
    const viewer = user("VIEWER");
    for (const role of ["SITE_MANAGER", "PROJECT_MANAGER", "ADMIN", "OWNER"] as const) {
      expect(hasRole(viewer, role)).toBe(false);
    }
  });
});

describe("AuthError", () => {
  it("carries the status the API should return", () => {
    expect(new AuthError("nope", 401).status).toBe(401);
    expect(new AuthError("nope", 403).status).toBe(403);
    // A project belonging to another tenant reports 404, not 403: confirming
    // the id exists leaks the shape of their portfolio.
    expect(new AuthError("Project not found", 404).status).toBe(404);
  });
});
