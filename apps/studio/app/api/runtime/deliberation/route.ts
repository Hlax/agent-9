import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * GET /api/runtime/deliberation — latest deliberation_trace row.
 * Internal introspection endpoint; not for public surfaces.
 */
export async function GET() {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ trace: null });
  }

  const { data, error } = await supabase
    .from("deliberation_trace")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ trace: data ?? null });
}

