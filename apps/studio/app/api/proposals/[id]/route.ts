import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * PATCH /api/proposals/[id] — update proposal (e.g. set proposal_state to archived).
 * Body: { proposal_state: 'archived' }.
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
    const proposal_state = body?.proposal_state === "archived" ? "archived" : null;
    if (!proposal_state) return NextResponse.json({ error: "Only proposal_state: 'archived' is supported" }, { status: 400 });

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
