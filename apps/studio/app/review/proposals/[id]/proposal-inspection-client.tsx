"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface ProposalInspectionData {
  proposal_record_id: string;
  title: string;
  lane_type: string;
  proposal_role: string | null;
  target_type: string;
  proposal_state: string;
  created_at: string;
  artifact_id: string | null;
  target_surface: string | null;
  summary: string | null;
  habitat_payload_json: unknown;
}

function laneExplanation(lane: string): string {
  if (lane === "surface") return "Surface — user-facing change.";
  if (lane === "medium") return "Medium — capability proposal, not stageable.";
  if (lane === "system") return "System — governance and runtime change, not a content publish.";
  return `${lane} — proposal.`;
}

function affectsFromRole(lane: string, role: string | null, targetType: string): string {
  if (lane === "surface") {
    if (targetType === "identity_name") return "identity name";
    if (targetType === "avatar_candidate") return "avatar embodiment";
    if (role === "interactive_module") return "habitat (Interactive)";
    return "habitat (Layout)";
  }
  if (lane === "medium") {
    if (role === "medium_extension") return "Extension";
    return "Capability";
  }
  if (lane === "system") return "governance / runtime";
  return role ?? targetType ?? "—";
}

const btn = { padding: "0.5rem 0.75rem", fontSize: "0.85rem", borderRadius: 4 } as const;

export function ProposalInspectionClient({
  proposal,
  sourceConceptTitle,
}: {
  proposal: ProposalInspectionData;
  sourceConceptTitle: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const lane = (proposal.lane_type ?? "surface") as string;
  const laneText = laneExplanation(lane);
  const affects = affectsFromRole(lane, proposal.proposal_role, proposal.target_type);

  const payload =
    proposal.habitat_payload_json != null && typeof proposal.habitat_payload_json === "object"
      ? proposal.habitat_payload_json
      : null;
  const payloadStr = payload ? JSON.stringify(payload, null, 2) : "";
  const isPayloadLarge = payloadStr.length > 800;

  const handleApprove = async (action: string) => {
    setBusy(action);
    try {
      const res = await fetch(`/api/proposals/${proposal.proposal_record_id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        router.refresh();
        router.push("/review");
      } else {
        const j = await res.json().catch(() => ({}));
        alert(j.error || res.statusText);
      }
    } finally {
      setBusy(null);
    }
  };

  const handlePatch = async (proposal_state: string) => {
    setBusy(proposal_state);
    try {
      const res = await fetch(`/api/proposals/${proposal.proposal_record_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_state }),
      });
      if (res.ok) {
        router.refresh();
        router.push("/review");
      } else {
        const j = await res.json().catch(() => ({}));
        alert(j.error || res.statusText);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {/* Meta block */}
      <section style={{ marginBottom: "1.25rem", padding: "1rem", background: "#f8f8f8", borderRadius: 8, border: "1px solid #ddd" }}>
        <p style={{ margin: 0, fontSize: "0.9rem" }}>
          <span style={{ fontWeight: 600 }}>ID:</span> {proposal.proposal_record_id}
        </p>
        <p style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>
          <span style={{ fontWeight: 600 }}>State:</span> {proposal.proposal_state.replace(/_/g, " ")} ·{" "}
          <span style={{ fontWeight: 600 }}>Created:</span> {new Date(proposal.created_at).toLocaleString()}
        </p>
      </section>

      {/* Lane */}
      <section style={{ marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.35rem" }}>Lane</h2>
        <p style={{ margin: 0, fontSize: "0.9rem", color: "#444" }}>
          <span style={{ fontWeight: 600 }}>Lane:</span> {laneText}
        </p>
      </section>

      {/* Affects */}
      <section style={{ marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.35rem" }}>Affects</h2>
        <p style={{ margin: 0, fontSize: "0.9rem", color: "#444" }}>
          <span style={{ fontWeight: 600 }}>Affects:</span> {affects}
        </p>
        {proposal.target_type && (
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#666" }}>
            Target type: {proposal.target_type}
            {proposal.target_surface ? ` · Target surface: ${proposal.target_surface}` : ""}
          </p>
        )}
      </section>

      {/* Source */}
      <section style={{ marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.35rem" }}>Source</h2>
        {proposal.artifact_id ? (
          <p style={{ margin: 0, fontSize: "0.9rem" }}>
            <Link href={`/concepts`} style={{ color: "#06c" }}>
              {sourceConceptTitle ?? proposal.artifact_id}
            </Link>
            <span style={{ marginLeft: "0.35rem", fontSize: "0.8rem", color: "#666" }}>({proposal.artifact_id})</span>
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: "0.9rem", color: "#666" }}>—</p>
        )}
      </section>

      {/* Payload preview */}
      <section style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.35rem" }}>Payload preview</h2>
        {payload ? (
          isPayloadLarge ? (
            <details style={{ border: "1px solid #ccc", borderRadius: 6, overflow: "hidden" }}>
              <summary style={{ padding: "0.5rem 0.75rem", background: "#f0f0f0", cursor: "pointer", fontSize: "0.9rem" }}>
                View payload ({payloadStr.length} chars)
              </summary>
              <pre style={{ margin: 0, padding: "0.75rem", fontSize: "0.8rem", overflow: "auto", maxHeight: "20rem", background: "#fff" }}>
                {payloadStr}
              </pre>
            </details>
          ) : (
            <pre style={{ margin: 0, padding: "0.75rem", fontSize: "0.8rem", background: "#f9f9f9", borderRadius: 6, border: "1px solid #ddd", overflow: "auto" }}>
              {payloadStr}
            </pre>
          )
        ) : (
          <p style={{ margin: 0, fontSize: "0.9rem", color: "#666" }}>No payload.</p>
        )}
      </section>

      {/* Actions */}
      <section>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Actions</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {lane === "surface" && proposal.proposal_state === "pending_review" && (
            <>
              {proposal.target_type === "identity_name" && (
                <button type="button" style={btn} disabled={!!busy} onClick={() => handleApprove("apply_name")}>
                  {busy === "apply_name" ? "…" : "Apply name"}
                </button>
              )}
              {proposal.target_type === "avatar_candidate" && (
                <>
                  <button type="button" style={btn} disabled={!!busy} onClick={() => handleApprove("approve_for_staging")}>
                    {busy === "approve_for_staging" ? "…" : "Approve for staging"}
                  </button>
                  <button type="button" style={btn} disabled={!!busy} onClick={() => handleApprove("approve_for_publication")}>
                    {busy === "approve_for_publication" ? "…" : "Approve for publication"}
                  </button>
                </>
              )}
              {(proposal.target_type === "concept" || proposal.target_type === "public_habitat_proposal") && (
                <button type="button" style={btn} disabled={!!busy} onClick={() => handleApprove("approve_for_staging")}>
                  {busy === "approve_for_staging" ? "…" : "Approve for staging"}
                </button>
              )}
            </>
          )}
          {lane === "surface" && (proposal.proposal_state === "approved_for_staging" || proposal.proposal_state === "staged") && (
            <button type="button" style={btn} disabled={!!busy} onClick={() => handleApprove("approve_for_publication")}>
              {busy === "approve_for_publication" ? "…" : "Approve for publication"}
            </button>
          )}
          {lane === "medium" && proposal.proposal_state === "pending_review" && (
            <button type="button" style={btn} disabled={!!busy} onClick={() => handleApprove("approve")}>
              {busy === "approve" ? "…" : "Approve for roadmap"}
            </button>
          )}
          {lane === "system" && proposal.proposal_state === "pending_review" && (
            <button type="button" style={btn} disabled={!!busy} onClick={() => handleApprove("approve")}>
              {busy === "approve" ? "…" : "Approve"}
            </button>
          )}
          {["pending_review", "needs_revision"].includes(proposal.proposal_state) && (
            <>
              <button type="button" style={{ ...btn, background: "#fff", border: "1px solid #999" }} disabled={!!busy} onClick={() => handlePatch("rejected")}>
                {busy === "rejected" ? "…" : "Reject"}
              </button>
              <button type="button" style={{ ...btn, background: "#fff", border: "1px solid #999" }} disabled={!!busy} onClick={() => handlePatch("archived")}>
                {busy === "archived" ? "…" : "Archive"}
              </button>
            </>
          )}
          {lane === "medium" && proposal.proposal_state === "approved" && (
            <button type="button" style={{ ...btn, background: "#fff", border: "1px solid #999" }} disabled={!!busy} onClick={() => handlePatch("archived")}>
              {busy === "archived" ? "…" : "Archive"}
            </button>
          )}
          {lane === "system" && proposal.proposal_state === "approved" && (
            <button type="button" style={{ ...btn, background: "#fff", border: "1px solid #999" }} disabled={!!busy} onClick={() => handlePatch("archived")}>
              {busy === "archived" ? "…" : "Archive"}
            </button>
          )}
        </div>
      </section>
    </>
  );
}
