import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/sessions — list recent sessions for inspection.
 */
export async function GET(request: Request) {
  try {
    const authClient = await createClient().catch(() => null);
    if (authClient) {
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ sessions: [] });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 50);

    const { data: sessions, error } = await supabase
      .from("creative_session")
      .select("session_id, mode, started_at, ended_at, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sessions: sessions ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
