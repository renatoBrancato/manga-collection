import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth callback: exchanges the ?code= from Google (via Supabase) for a
 * session, then redirects into the app.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
    return NextResponse.redirect(
      `${origin}/login?error=auth_failed&reason=${encodeURIComponent(error.message)}`
    );
  }

  const errorDescription = searchParams.get("error_description") ?? searchParams.get("error");
  console.error("[auth/callback] no code param, provider error:", errorDescription);
  return NextResponse.redirect(
    `${origin}/login?error=auth_failed&reason=${encodeURIComponent(errorDescription ?? "missing_code")}`
  );
}
