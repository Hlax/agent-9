import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Supabase redirects here after sign-in (OAuth or magic link).
 * Exchange code for session and redirect to Studio home.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL(`/login?error=${error.message}`, request.url));
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
