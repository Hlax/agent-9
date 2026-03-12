"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getNextLegalProposalActions } from "@/lib/governance-rules";

interface Proposal {
  proposal_record_id: string;
  lane_type: string;
  target_type: string;
  target_surface?: string | null;
  proposal_role?: string | null;
  title: string;
  summary: string | null;
  proposal_state: string;
  preview_uri?: string | null;
  habitat_payload_json?: unknown;
  created_at: string;
}

const VIEWS = [
  { view: "pending_review", label: "Pending" },
  { view: "approved", label: "Approved" },
  { view: "archived", label: "Archived" },
] as const;

/** Human-readable label for proposal state. */
function stateLabel(s: string): string {
  return s.replace(/_/g, " ");
}

/** Whether the proposal payload is visible in staging (approved_for_staging or staged; staging API returns it). */
function isPayloadInStaging(state: string): boolean {
  return state === "approved_for_staging" || state === "staged";
}

/** Whether the proposal payload has been applied to the public surface (published). */
function isPayloadPublished(state: string): boolean {
  return state === "published";
}

export function HabitatProposalList({ view }: { view: "pending_review" | "approved" | "archived" }) {
  const router = useRouter();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [patching, setPatching] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(
      `/api/proposals?lane_type=surface&target_type=public_habitat_proposal,concept&proposal_role=habitat_layout&proposal_state=${view}`
    )
      .then((r) => r.json())
      .then((d) => setProposals(d.proposals ?? []))
      .finally(() => setLoading(false));
  }, [view]);

  const handleApprove = async (id: string, p: Proposal) => {
    setApproving(id);
    try {
      const isConcept = p.target_type === "concept";
      const canPublishToPublic =
        p.target_surface === "public_habitat" || (p.habitat_payload_json != null && typeof p.habitat_payload_json === "object");
      const action = isConcept
        ? "approve_for_staging"
        : canPublishToPublic
          ? "approve_for_publication"
          : "approve";
      const res = await fetch(`/api/proposals/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      if (res.ok) setProposals((prev) => prev.filter((x) => x.proposal_record_id !== id));
      router.refresh();
    } finally {
      setApproving(null);
    }
  };

  const handlePatchState = async (id: string, newState: string) => {
    setPatching(id);
    try {
      const res = await fetch(`/api/proposals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_state: newState }),
      });
      if (res.ok) {
        setProposals((prev) => prev.map((x) => (x.proposal_record_id === id ? { ...x, proposal_state: newState } : x)));
        router.refresh();
      }
    } finally {
      setPatching(null);
    }
  };

  const handleApproveForPublication = async (id: string) => {
    setApproving(id);
    try {
      const res = await fetch(`/api/proposals/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_for_publication" }),
      });
      if (res.ok) {
        setProposals((prev) => prev.map((x) => (x.proposal_record_id === id ? { ...x, proposal_state: "approved_for_publication" } : x)));
        router.refresh();
      }
    } finally {
      setApproving(null);
    }
  };

  const handleUnpublish = async (id: string, archive: boolean) => {
    setArchiving(id);
    try {
      const res = await fetch(`/api/proposals/${id}/unpublish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive }),
      });
      if (res.ok) setProposals((p) => p.filter((x) => x.proposal_record_id !== id));
      router.refresh();
    } finally {
      setArchiving(null);
    }
  };

  const handleReject = async (id: string) => {
    setArchiving(id);
    try {
      const res = await fetch(`/api/proposals/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposal_state: "rejected" }) });
      if (res.ok) setProposals((p) => p.filter((x) => x.proposal_record_id !== id));
      router.refresh();
    } finally {
      setArchiving(null);
    }
  };

  const handleIgnore = async (id: string) => {
    setArchiving(id);
    try {
      const res = await fetch(`/api/proposals/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposal_state: "archived" }) });
      if (res.ok) setProposals((p) => p.filter((x) => x.proposal_record_id !== id));
      router.refresh();
    } finally {
      setArchiving(null);
    }
  };

  const handleArchive = async (id: string) => {
    setArchiving(id);
    try {
      const res = await fetch(`/api/proposals/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposal_state: "archived" }) });
      if (res.ok) setProposals((p) => p.filter((x) => x.proposal_record_id !== id));
      router.refresh();
    } finally {
      setArchiving(null);
    }
  };

  const btn = { padding: "0.25rem 0.5rem", fontSize: "0.8rem", borderRadius: 4 } as const;

  if (loading) return <p>Loading…</p>;
  if (proposals.length === 0) return <p>No habitat or concept proposals in this view.</p>;
  return (
    <ul style={{ listStyle: "none", padding: 0 }}>
      {proposals.map((p) => {
        const nextActions = getNextLegalProposalActions(p.proposal_state);
        const payloadInStaging = isPayloadInStaging(p.proposal_state);
        const payloadPublished = isPayloadPublished(p.proposal_state);
        const hasPayload = p.habitat_payload_json != null && typeof p.habitat_payload_json === "object";

        return (
          <li key={p.proposal_record_id} style={{ border: "1px solid #ccc", borderRadius: 8, padding: "1rem", marginBottom: "0.75rem" }}>
            {p.preview_uri ? (
              <div style={{ marginBottom: "0.75rem", borderRadius: 6, overflow: "hidden", background: "#f0f0f0" }}>
                <img src={p.preview_uri} alt="" style={{ display: "block", width: "100%", maxWidth: 320, maxHeight: 180, objectFit: "contain" }} />
              </div>
            ) : null}
            <strong>{p.title}</strong>
            {p.summary && <p style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>{p.summary}</p>}

            {/* Proposal role, target surface, current state */}
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#444" }}>
              <span style={{ fontWeight: 600 }}>Role:</span> {p.proposal_role ?? "—"} ·{" "}
              <span style={{ fontWeight: 600 }}>Target:</span> {p.target_surface ?? "—"} ·{" "}
              <span style={{ fontWeight: 600 }}>State:</span> {stateLabel(p.proposal_state)}
            </p>
            <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#666" }}>
              {hasPayload ? "Payload: present" : "Payload: none"} ·{" "}
              {payloadInStaging ? "Visible in staging" : payloadPublished ? "Applied to public" : "Not yet applied"}
            </p>
            <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#888" }}>
              {new Date(p.created_at).toLocaleDateString()}
            </p>

            {/* Pending: primary approve actions */}
            {p.proposal_state === "pending_review" && (
              <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                <button type="button" style={btn} onClick={() => handleApprove(p.proposal_record_id, p)} disabled={approving === p.proposal_record_id}>
                  {approving === p.proposal_record_id
                    ? "…"
                    : p.target_type === "concept"
                      ? "Approve for staging"
                      : (p.target_surface === "public_habitat" || p.habitat_payload_json)
                        ? "Approve for publication"
                        : "Approve"}
                </button>
                <button type="button" style={btn} onClick={() => handleReject(p.proposal_record_id)} disabled={archiving === p.proposal_record_id}>Reject</button>
                <button type="button" style={btn} onClick={() => handleIgnore(p.proposal_record_id)} disabled={archiving === p.proposal_record_id}>Ignore</button>
                {p.preview_uri && (
                  <a href={p.preview_uri} target="_blank" rel="noopener noreferrer" style={{ ...btn, display: "inline-block", border: "1px solid #999", background: "#fff", color: "#333", textDecoration: "none" }}>View</a>
                )}
              </div>
            )}

            {/* approved_for_staging / staged: next legal actions */}
            {(p.proposal_state === "approved_for_staging" || p.proposal_state === "staged") && (
              <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                <span style={{ fontSize: "0.8rem", color: "#666", marginRight: "0.35rem" }}>Next:</span>
                {nextActions.includes("staged") && (
                  <button
                    type="button"
                    style={btn}
                    onClick={() => handlePatchState(p.proposal_record_id, "staged")}
                    disabled={patching === p.proposal_record_id}
                  >
                    {patching === p.proposal_record_id ? "…" : "Mark as staged"}
                  </button>
                )}
                {nextActions.includes("approved_for_publication") && (
                  <button
                    type="button"
                    style={btn}
                    onClick={() => handleApproveForPublication(p.proposal_record_id)}
                    disabled={approving === p.proposal_record_id}
                  >
                    {approving === p.proposal_record_id ? "…" : "Approve for publication"}
                  </button>
                )}
                {nextActions.includes("archived") && (
                  <button type="button" style={btn} onClick={() => handleArchive(p.proposal_record_id)} disabled={archiving === p.proposal_record_id}>Archive</button>
                )}
                {nextActions.includes("rejected") && (
                  <button type="button" style={btn} onClick={() => handleReject(p.proposal_record_id)} disabled={archiving === p.proposal_record_id}>Reject</button>
                )}
              </div>
            )}

            {/* approved_for_publication: unpublish */}
            {p.proposal_state === "approved_for_publication" && (
              <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                <span style={{ fontSize: "0.8rem", color: "#666", marginRight: "0.35rem" }}>Next:</span>
                {nextActions.includes("published") && (
                  <span style={{ fontSize: "0.8rem", color: "#666" }}>Publish via separate publish action.</span>
                )}
                <button
                  type="button"
                  style={btn}
                  onClick={() => handleUnpublish(p.proposal_record_id, false)}
                  disabled={archiving === p.proposal_record_id}
                >
                  {archiving === p.proposal_record_id ? "…" : "Unpublish to staging"}
                </button>
                <button
                  type="button"
                  style={btn}
                  onClick={() => handleUnpublish(p.proposal_record_id, true)}
                  disabled={archiving === p.proposal_record_id}
                >
                  {archiving === p.proposal_record_id ? "…" : "Unpublish + archive"}
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function HabitatProposalTabs({ view }: { view: "pending_review" | "approved" | "archived" }) {
  return (
    <nav style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
      {VIEWS.map((v) => (
        <a
          key={v.view}
          href={`/review/surface/habitat${v.view === "pending_review" ? "" : `?view=${v.view}`}`}
          style={{ fontWeight: view === v.view ? 600 : 400 }}
        >
          {v.label}
        </a>
      ))}
    </nav>
  );
}
