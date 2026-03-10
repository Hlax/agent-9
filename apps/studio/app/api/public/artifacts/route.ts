import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * GET /api/public/artifacts — published artifacts for public habitat.
 * No auth required. Returns artifacts where current_approval_state = approved_for_publication
 * and current_publication_state = published.
 */
export async function GET() {
  try {
    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ artifacts: [] });

    const { data, error } = await supabase
      .from("artifact")
      .select("artifact_id, title, summary, medium, content_text, content_uri, preview_uri, created_at")
      .eq("current_approval_state", "approved_for_publication")
      .eq("current_publication_state", "published")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ artifacts: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
