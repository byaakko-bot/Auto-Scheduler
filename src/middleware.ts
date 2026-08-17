import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authMode, supabaseCredentials } from "@/lib/auth/config";

// Guards the application surface: every /app page and every /api route.
//
// Route handlers still resolve identity and tenancy themselves — this layer
// only rejects anonymous callers early. Authorisation lives in
// `@/lib/auth/session`, because only the handler knows which company owns the
// record being touched.
export async function middleware(request: NextRequest) {
  const isApi = request.nextUrl.pathname.startsWith("/api");

  // A misconfigured environment throws here, so the application refuses to
  // serve rather than serving unprotected. The public marketing routes are not
  // matched and stay up.
  let mode;
  try {
    mode = authMode();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Auth misconfigured";
    console.error("[auth] refusing to serve:", message);
    return isApi
      ? NextResponse.json({ error: message }, { status: 500 })
      : new NextResponse(message, { status: 500 });
  }

  if (mode === "DEV_BYPASS") return NextResponse.next();

  const { url, anonKey } = supabaseCredentials()!;
  const response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get: (name: string) => request.cookies.get(name)?.value,
      set: (name: string, value: string, options: CookieOptions) => {
        response.cookies.set({ name, value, ...options });
      },
      remove: (name: string, options: CookieOptions) => {
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (isApi) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/app/:path*", "/api/:path*"],
};
