import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseCredentials } from "@/lib/auth/config";

// Server-side Supabase client bound to the request cookies.
// Returns null only when running with the explicit development bypass, which
// `@/lib/auth/config` refuses to allow in production.
export function createClient() {
  const credentials = supabaseCredentials();
  if (!credentials) return null;
  const { url, anonKey } = credentials;

  const cookieStore = cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Called from a Server Component; ignore (middleware refreshes).
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          // Ignore.
        }
      },
    },
  });
}

// Auth mode now has a single home. Re-exported so existing imports keep
// working, but `@/lib/auth/config` is the source of truth.
export { isDevBypass, authMode } from "@/lib/auth/config";
