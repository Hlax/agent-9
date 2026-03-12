import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * GET /api/staging/composition — current staging habitat composition (branch head).
 * Returns all pages in staging_habitat_content for the habitat-staging app to render.
 * No auth required so staging app can load from Studio (same as GET /api/staging/proposals).
 */
export async function GET() {
  try {
    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ pages: [] });

    const { data, error } = await supabase
      .from("staging_habitat_content")
      .select("slug, title, body, payload_json, source_proposal_id, updated_at")
      .order("slug");

    if (error) return NextResponse.json({ pages: [], error: error.message }, { status: 500 });
    return NextResponse.json({ pages: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { pages: [], error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
