import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = createClient();
  if (supabase) await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/login", request.url), {
    // 303 so the browser follows with GET after the POST.
    status: 303,
  });
}
