import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * GET /api/runtime/state — latest creative_state_snapshot (metabolism view).
 */
export async function GET() {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ snapshot: null });
  }

  const { data, error } = await supabase
    .from("creative_state_snapshot")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ snapshot: null });
  }

  return NextResponse.json({ snapshot: data });
}

