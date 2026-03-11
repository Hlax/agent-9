import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { capSummaryTo200Words } from "@/lib/habitat-payload";

/**
 * GET /api/proposals — list proposals. Query: lane_type, target_type.
 * POST /api/proposals — create a proposal (Twin or Harvey). Body: lane_type, target_type, title, summary?, target_id?, preview_uri?, created_by?.
 */
export async function GET(request: Request) {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ proposals: [] });
    const { searchParams } = new URL(request.url);
    const lane_type = searchParams.get("lane_type");
    const target_type = searchParams.get("target_type");
    const proposal_state = searchParams.get("proposal_state");
    const proposal_role = searchParams.get("proposal_role");
    let query = supabase.from("proposal_record").select("*").order("created_at", { ascending: false }).limit(50);
    if (lane_type) query = query.eq("lane_type", lane_type);
    if (target_type) {
      const types = target_type.split(",").map((t) => t.trim()).filter(Boolean);
      if (types.length > 1) query = query.in("target_type", types);
      else if (types.length === 1) query = query.eq("target_type", types[0]);
    }
    if (proposal_role) {
      const roles = proposal_role.split(",").map((t) => t.trim()).filter(Boolean);
      if (roles.length > 1) query = query.in("proposal_role", roles);
      else if (roles.length === 1) query = query.eq("proposal_role", roles[0]);
    }
    if (proposal_state) {
      if (proposal_state === "archived") {
        query = query.in("proposal_state", ["archived", "rejected", "ignored"]);
      } else if (proposal_state === "approved") {
        query = query.in("proposal_state", ["approved", "approved_for_staging", "approved_for_publication"]);
      } else {
        query = query.eq("proposal_state", proposal_state);
      }
    }
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ proposals: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    const body = await request.json().catch(() => ({}));
    const lane_type = body?.lane_type ?? "surface";
    const target_type = body?.target_type ?? "concept";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const rawSummary = typeof body?.summary === "string" ? body.summary : null;
    const summary = rawSummary ? capSummaryTo200Words(rawSummary) : null;
    const target_id = body?.target_id ?? null;
    const artifact_id = body?.artifact_id ?? null;
    const target_surface = typeof body?.target_surface === "string" ? body.target_surface : null;
    const proposal_type = typeof body?.proposal_type === "string" ? body.proposal_type : null;
    const proposal_role = typeof body?.proposal_role === "string" ? body.proposal_role : null;
    const preview_uri = body?.preview_uri ?? null;
    const created_by = body?.created_by ?? (user?.email ?? "harvey");
    if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
    const row: Record<string, unknown> = {
      lane_type,
      target_type,
      target_id,
      title,
      summary,
      proposal_state: "pending_review",
      preview_uri,
      review_note: null,
      created_by,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (artifact_id != null) row.artifact_id = artifact_id;
    if (target_surface != null) row.target_surface = target_surface;
    if (proposal_type != null) row.proposal_type = proposal_type;
    if (proposal_role != null) row.proposal_role = proposal_role;
    const { data, error } = await supabase.from("proposal_record").insert(row).select("proposal_record_id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ proposal_record_id: data?.proposal_record_id, ...row });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
