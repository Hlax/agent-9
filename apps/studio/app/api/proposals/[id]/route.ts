import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const ALLOWED_PROPOSAL_STATES = [
  "archived",
  "rejected",
  "ignored",
  "needs_revision",
  "staged",
  "approved_for_staging",
  "approved_for_publication",
  "published",
] as const;

/**
 * PATCH /api/proposals/[id] — update proposal state.
 * Body: { proposal_state }.
 * Negative: archived, rejected, ignored, needs_revision.
 * Positive flow (concept-to-proposal): staged, approved_for_staging, approved_for_publication, published.
 */
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    const { id } = await params;
    const body = await _request.json().catch(() => ({}));
    const raw = body?.proposal_state;
    const proposal_state = ALLOWED_PROPOSAL_STATES.includes(raw) ? raw : null;
    if (!proposal_state) return NextResponse.json({ error: `proposal_state must be one of: ${ALLOWED_PROPOSAL_STATES.join(", ")}` }, { status: 400 });

    const { data, error } = await supabase
      .from("proposal_record")
      .update({ proposal_state, updated_at: new Date().toISOString() })
      .eq("proposal_record_id", id)
      .select("proposal_record_id, proposal_state")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
