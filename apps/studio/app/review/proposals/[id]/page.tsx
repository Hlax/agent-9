import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase-server";
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
