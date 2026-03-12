import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase-server";
import { computeStyleProfile, evaluateProposalStyle, type StyleAnalysisInput } from "@/lib/style-profile";
import { evaluateProposalRelationship, type ProposalForRelationship } from "@/lib/proposal-relationship";
import { buildConceptFamilies } from "@/lib/proposal-families";
import { ProposalInspectionClient, type ProposalInspectionData } from "./proposal-inspection-client";

export default async function ProposalInspectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServer();
  if (!supabase) notFound();

  const { data: proposal, error } = await supabase
    .from("proposal_record")
    .select("*")
    .eq("proposal_record_id", id)
    .single();

  if (error || !proposal) notFound();

  let sourceConceptTitle: string | null = null;
  if (proposal.artifact_id) {
    const { data: art } = await supabase
      .from("artifact")
      .select("title")
      .eq("artifact_id", proposal.artifact_id)
      .single();
    sourceConceptTitle = art?.title ?? null;
  }

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
  const { profile: styleProfile, repeatedTitles } = computeStyleProfile(styleInputs);
  const proposalText =
    proposal.habitat_payload_json && typeof proposal.habitat_payload_json === "object"
      ? JSON.stringify(proposal.habitat_payload_json).slice(0, 800)
      : null;
  const styleEval = evaluateProposalStyle({
    proposal: {
      title: proposal.title ?? "",
      summary: proposal.summary ?? null,
      text: proposalText,
    },
    styleProfile,
    repeatedTitles,
  });

  // Relationship vs recent proposals in the same lane/role/target surface.
  const { data: relatedRows } = await supabase
    .from("proposal_record")
    .select(
      "proposal_record_id, title, summary, habitat_payload_json, target_surface, proposal_role, target_type, lane_type, created_at"
    )
    .eq("lane_type", proposal.lane_type ?? "surface")
    .eq("target_surface", proposal.target_surface ?? null)
    .eq("proposal_role", proposal.proposal_role ?? null)
    .order("created_at", { ascending: false })
    .limit(30);

  const currentForRel: ProposalForRelationship = {
    id: proposal.proposal_record_id as string,
    title: proposal.title ?? "",
    summary: proposal.summary ?? null,
    payloadText:
      proposal.habitat_payload_json && typeof proposal.habitat_payload_json === "object"
        ? JSON.stringify(proposal.habitat_payload_json).slice(0, 800)
        : null,
    targetSurface: proposal.target_surface ?? null,
    proposalRole: proposal.proposal_role ?? null,
    targetType: proposal.target_type ?? null,
    laneType: proposal.lane_type ?? null,
    createdAt: proposal.created_at ?? null,
  };

  const recentForRel: ProposalForRelationship[] = (relatedRows ?? []).map((r) => ({
    id: r.proposal_record_id as string,
    title: (r.title as string | null) ?? "",
    summary: (r.summary as string | null) ?? null,
    payloadText:
      r.habitat_payload_json && typeof r.habitat_payload_json === "object"
        ? JSON.stringify(r.habitat_payload_json).slice(0, 800)
        : null,
    targetSurface: (r.target_surface as string | null) ?? null,
    proposalRole: (r.proposal_role as string | null) ?? null,
    targetType: (r.target_type as string | null) ?? null,
    laneType: (r.lane_type as string | null) ?? null,
    createdAt: (r.created_at as string | null) ?? null,
  }));

  const relationship = evaluateProposalRelationship(currentForRel, recentForRel);

  let familyId: string | null = null;
  let familyMemberCount = 0;
  let familyIsRepresentative = false;
  let familyIsContested = false;
  let familyNeedsConsolidation = false;
  let familyRecommendation: string | null = null;
  let familyRecommendationReason: string | null = null;

  if (recentForRel.length > 0) {
    const { families } = buildConceptFamilies(recentForRel, (current, all) => {
      const rel = evaluateProposalRelationship(current, all);
      return { kind: rel.kind, relatedProposalId: rel.relatedProposalId };
    });
    const family = families.find((f) => f.member_ids.includes(currentForRel.id));
    if (family) {
      familyId = family.family_id;
      familyMemberCount = family.member_ids.length;
      familyIsRepresentative = family.representative_proposal_id === currentForRel.id;
      familyIsContested = family.is_contested;
      familyNeedsConsolidation = family.needs_consolidation;
      familyRecommendation = family.recommendation;
      familyRecommendationReason = family.recommendation_reason;
    }
  }

  const inspectionData: ProposalInspectionData = {
    proposal_record_id: proposal.proposal_record_id,
    title: proposal.title ?? "",
    lane_type: proposal.lane_type ?? "surface",
    proposal_role: proposal.proposal_role ?? null,
    target_type: proposal.target_type ?? "",
    proposal_state: proposal.proposal_state ?? "pending_review",
    created_at: proposal.created_at ?? new Date().toISOString(),
    artifact_id: proposal.artifact_id ?? null,
    target_surface: proposal.target_surface ?? null,
    summary: proposal.summary ?? null,
    habitat_payload_json: proposal.habitat_payload_json ?? null,
    style_tags: styleEval.style_tags,
    style_fit: styleEval.style_fit,
    style_novelty: styleEval.style_novelty,
    style_fit_reason: styleEval.style_fit_reason,
    relationship_kind: relationship.kind,
    relationship_ref_proposal_id: relationship.relatedProposalId,
    relationship_reason: relationship.reason,
    concept_family_id: familyId,
    concept_family_member_count: familyMemberCount,
    concept_family_is_representative: familyIsRepresentative,
    concept_family_is_contested: familyIsContested,
    concept_family_needs_consolidation: familyNeedsConsolidation,
    concept_family_recommendation: familyRecommendation,
    concept_family_recommendation_reason: familyRecommendationReason,
  };

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "1rem" }}>
      <p>
        <Link href="/review">← Review</Link>
      </p>
      <h1 style={{ marginBottom: "0.5rem" }}>{inspectionData.title}</h1>
      <p style={{ margin: 0, fontSize: "0.9rem", color: "#555" }}>
        <span style={{ fontWeight: 600 }}>Lane:</span> {inspectionData.lane_type} ·{" "}
        <span style={{ fontWeight: 600 }}>Role:</span> {inspectionData.proposal_role ?? "—"} ·{" "}
        <span style={{ fontWeight: 600 }}>State:</span> {inspectionData.proposal_state.replace(/_/g, " ")} ·{" "}
        <span style={{ fontWeight: 600 }}>Created:</span> {new Date(inspectionData.created_at).toLocaleString()}
      </p>
      {inspectionData.summary && (
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.9rem", color: "#444" }}>{inspectionData.summary}</p>
      )}
      <ProposalInspectionClient proposal={inspectionData} sourceConceptTitle={sourceConceptTitle} />
    </main>
  );
}
