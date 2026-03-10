import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * POST /api/proposals/[id]/approve — approve a proposal and apply it.
 * Body: { action: 'apply_name' | 'approve_avatar' | 'approve_publication' }.
 * - apply_name: set active identity.name from proposal title.
 * - approve_avatar: mark proposal approved, update identity.embodiment_direction or store avatar.
 * - approve_publication: mark proposal approved, promote habitat content to public (e.g. store for public-site).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = body?.action ?? "approve";

    const { data: proposal, error: fetchErr } = await supabase
      .from("proposal_record")
      .select("*")
      .eq("proposal_record_id", id)
      .single();
    if (fetchErr || !proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

    if (action === "apply_name" && proposal.target_type === "identity_name") {
      const { data: ident } = await supabase.from("identity").select("identity_id").eq("is_active", true).limit(1).maybeSingle();
      if (ident) {
        await supabase.from("identity").update({
          name: proposal.title ?? "",
          name_status: "accepted",
          updated_at: new Date().toISOString(),
        }).eq("identity_id", ident.identity_id);
      }
    }
    if (action === "approve_avatar" && proposal.target_type === "avatar_candidate") {
      const { data: ident } = await supabase.from("identity").select("identity_id").eq("is_active", true).limit(1).maybeSingle();
      if (ident && (proposal.summary ?? proposal.title)) {
        await supabase.from("identity").update({ embodiment_direction: (proposal.summary ?? proposal.title).slice(0, 2000), updated_at: new Date().toISOString() }).eq("identity_id", ident.identity_id);
      }
    }
    if (action === "approve_publication" && (proposal.target_type === "public_habitat_proposal" || proposal.target_type === "habitat")) {
      await supabase.from("public_habitat_content").upsert(
        { slug: "home", title: proposal.title ?? "Habitat", body: proposal.summary ?? null, updated_at: new Date().toISOString() },
        { onConflict: "slug" }
      );
    }

    const { error: updateErr } = await supabase
      .from("proposal_record")
      .update({ proposal_state: "approved", updated_at: new Date().toISOString() })
      .eq("proposal_record_id", id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, proposal_record_id: id, action });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
