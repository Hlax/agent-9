import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { computeStyleProfile, evaluateProposalStyle, type StyleAnalysisInput } from "@/lib/style-profile";

/**
 * GET /api/staging/proposals — proposals for staging habitat (approved_for_staging, staged).
 * No auth required so habitat-staging app can load from Studio API (same-origin or NEXT_PUBLIC_STUDIO_URL).
 * In production you may restrict by network or add a shared secret.
 */
export async function GET() {
  try {
    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ proposals: [] });

    const { data, error } = await supabase
      .from("proposal_record")
      .select("proposal_record_id, lane_type, target_type, proposal_role, title, summary, proposal_state, target_surface, proposal_type, preview_uri, artifact_id, habitat_payload_json, created_at, updated_at")
      .eq("lane_type", "surface")
      .in("proposal_state", ["approved_for_staging", "staged", "approved_for_publication", "published"])
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const proposals = (data ?? []) as Array<{
      proposal_record_id: string;
      title: string | null;
      summary: string | null;
      habitat_payload_json: unknown;
    }>;

    const styleWindowSize = 40;
    const [artifactRes, proposalRes] = await Promise.all([
      supabase
        .from("artifact")
        .select("title, summary, content_text")
        .order("created_at", { ascending: false })
        .limit(styleWindowSize),
      supabase
        .from("proposal_record")
        .select("title, summary")
        .order("created_at", { ascending: false })
        .limit(styleWindowSize),
    ]);

    const styleInputs: StyleAnalysisInput[] = [];
    for (const a of (artifactRes.data ?? []) as Array<{
      title?: string | null;
      summary?: string | null;
      content_text?: string | null;
    }>) {
      styleInputs.push({
        title: a.title ?? null,
        summary: a.summary ?? null,
        text: a.content_text ?? null,
      });
    }
    for (const p of (proposalRes.data ?? []) as Array<{
      title?: string | null;
      summary?: string | null;
    }>) {
      styleInputs.push({
        title: p.title ?? null,
        summary: p.summary ?? null,
        text: null,
      });
    }
    const { profile, repeatedTitles } = computeStyleProfile(styleInputs);

    const scored = proposals.map((p) => {
      const text =
        p.habitat_payload_json && typeof p.habitat_payload_json === "object"
          ? JSON.stringify(p.habitat_payload_json).slice(0, 800)
          : null;
      const evalResult = evaluateProposalStyle({
        proposal: { title: p.title ?? "", summary: p.summary ?? null, text },
        styleProfile: profile,
        repeatedTitles,
      });
      return {
        ...p,
        ...evalResult,
      };
    });

    scored.sort((a, b) => b.style_score - a.style_score);

    return NextResponse.json({ proposals: scored });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
