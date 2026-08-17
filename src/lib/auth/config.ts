// Single source of truth for whether authentication is enforced.
//
// The previous rule was `disabled = DISABLE_AUTH === "true" || !url || !key`,
// which fails OPEN: forget to set the Supabase variables and the whole
// application — pages and API — serves every tenant's data to anyone with a
// URL. That is how production ended up publicly readable and writable.
//
// The rule here fails CLOSED. Enforcement is the default; the only way to skip
// it is to say so explicitly, and saying so in production is a boot error
// rather than a quietly open door.

export type AuthMode = "SUPABASE" | "DEV_BYPASS";

export class AuthConfigError extends Error {
  readonly status = 500;
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigError";
  }
}

/**
 * Whether this runtime is the real production deployment.
 *
 * `VERCEL_ENV` distinguishes production from preview builds, which both run
 * with `NODE_ENV=production`; a preview deploy is a legitimate place to use the
 * bypass, the production deploy never is.
 */
export function isProductionRuntime(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) return vercelEnv === "production";
  return process.env.NODE_ENV === "production";
}

export function supabaseCredentials(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/**
 * Resolves the auth mode, or throws if the environment is not a configuration
 * we are willing to serve.
 *
 * Throwing propagates as a 500 from middleware and from every guarded route,
 * so a misconfigured deployment refuses to serve the application rather than
 * serving it unprotected.
 */
export function authMode(): AuthMode {
  const bypassRequested = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";
  const production = isProductionRuntime();

  if (bypassRequested) {
    if (production) {
      throw new AuthConfigError(
        "NEXT_PUBLIC_DEV_AUTH_BYPASS is set in a production runtime. This " +
          "variable disables all authentication and must never exist in the " +
          "production environment. Remove it from the Vercel production " +
          "environment and redeploy."
      );
    }
    return "DEV_BYPASS";
  }

  if (supabaseCredentials()) return "SUPABASE";

  throw new AuthConfigError(
    "Authentication is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY to enforce sign-in, or set " +
      "NEXT_PUBLIC_DEV_AUTH_BYPASS=true for local development only. Refusing " +
      "to serve the application unauthenticated."
  );
}

/** True when requests run without a real signed-in user. Local development only. */
export function isDevBypass(): boolean {
  return authMode() === "DEV_BYPASS";
}
