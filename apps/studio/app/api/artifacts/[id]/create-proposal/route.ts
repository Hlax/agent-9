import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { validateHabitatPayload, summaryFromHabitatPayload, capSummaryTo200Words } from "@/lib/habitat-payload";

/**
 * POST /api/artifacts/[id]/create-proposal — create a surface/system proposal from this concept artifact (Harvey override).
 * Body (optional): { lane_type?, target_surface?, proposal_type?, habitat_payload? }.
 * When target_surface is public_habitat, habitat_payload is validated and stored as habitat_payload_json.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: artifactId } = await params;
    if (!artifactId) return NextResponse.json({ error: "Missing artifact id" }, { status: 400 });

    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    const { data: artifact, error: artError } = await supabase
      .from("artifact")
      .select("artifact_id, title, summary, medium")
      .eq("artifact_id", artifactId)
      .single();
    if (artError || !artifact) return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
    if (artifact.medium !== "concept") {
      return NextResponse.json({ error: "Only concept artifacts can be turned into proposals." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const lane_type = (body?.lane_type === "system" ? "system" : body?.lane_type === "medium" ? "medium" : "surface") as "surface" | "system" | "medium";
    const target_surface = typeof body?.target_surface === "string" ? body.target_surface : "staging_habitat";
    const proposal_type = typeof body?.proposal_type === "string" ? body.proposal_type : "layout";
    const proposal_role =
      typeof body?.proposal_role === "string" && body.proposal_role.trim()
        ? body.proposal_role.trim()
        : "habitat_layout";

    // Interactive user-facing habitat modules are always surface lane.
    // Medium-lane interactive capabilities should use a different role (e.g. medium_extension).
    const effectiveLane: "surface" | "system" | "medium" =
      proposal_role === "interactive_module" ? "surface" : lane_type;

    let habitat_payload_json: object | null = null;
    let summary: string = capSummaryTo200Words(artifact.summary) || artifact.title || "Concept proposal";
    const hasPayload = body?.habitat_payload != null && (target_surface === "public_habitat" || target_surface === "staging_habitat");
    if (hasPayload) {
      const result = validateHabitatPayload(body.habitat_payload);
      if (!result.success) {
        return NextResponse.json({ error: "Invalid habitat payload", details: result.error }, { status: 400 });
      }
      habitat_payload_json = result.data as object;
      summary = summaryFromHabitatPayload(result.data);
    }

    const row = {
      lane_type: effectiveLane === "medium" ? "medium" : effectiveLane === "system" ? "system" : "surface",
      target_type: "concept",
      target_id: artifactId,
      artifact_id: artifactId,
      title: artifact.title,
      summary,
      proposal_state: "pending_review",
      target_surface,
      proposal_type,
      proposal_role,
      habitat_payload_json,
      preview_uri: null,
      review_note: null,
      created_by: user?.email ?? "harvey",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("proposal_record")
      .insert(row)
      .select("proposal_record_id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      proposal_record_id: data?.proposal_record_id,
      proposal_state: "pending_review",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
