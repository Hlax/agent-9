import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isProposalEligible } from "@/lib/proposal-eligibility";

/**
 * GET /api/artifacts/[id]/proposal-eligibility — whether this concept artifact is proposal-eligible
 * and whether a proposal already exists for it.
 */
export async function GET(
  _request: Request,
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
      .select("artifact_id, medium, alignment_score, fertility_score, pull_score")
      .eq("artifact_id", artifactId)
      .single();
    if (artError || !artifact) return NextResponse.json({ error: "Artifact not found" }, { status: 404 });

    const { data: critique } = await supabase
      .from("critique_record")
      .select("critique_outcome")
      .eq("artifact_id", artifactId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const eligibility = isProposalEligible({
      medium: artifact.medium,
      alignment_score: artifact.alignment_score,
      fertility_score: artifact.fertility_score,
      pull_score: artifact.pull_score,
      critique_outcome: critique?.critique_outcome ?? null,
    });

    const { data: existingProposal } = await supabase
      .from("proposal_record")
      .select("proposal_record_id, proposal_state")
      .eq("target_type", "concept")
      .eq("target_id", artifactId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      eligible: eligibility.eligible,
      reason: eligibility.reason,
      existingProposalId: existingProposal?.proposal_record_id ?? null,
      existingProposalState: existingProposal?.proposal_state ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
