"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Proposal {
  proposal_record_id: string;
  lane_type: string;
  target_type: string;
  target_surface?: string | null;
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

export function HabitatProposalList({ view }: { view: "pending_review" | "approved" | "archived" }) {
  const router = useRouter();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/proposals?lane_type=surface&target_type=public_habitat_proposal,concept&proposal_state=${view}`)
      .then((r) => r.json())
      .then((d) => setProposals(d.proposals ?? []))
      .finally(() => setLoading(false));
  }, [view]);

  const handleApprove = async (id: string, p: Proposal) => {
    setApproving(id);
    try {
      const canPublishToPublic =
        p.target_surface === "public_habitat" || (p.habitat_payload_json != null && typeof p.habitat_payload_json === "object");
      const action =
        p.target_type === "concept" && !canPublishToPublic
          ? "approve_for_staging"
          : "approve_for_publication";
      const res = await fetch(`/api/proposals/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      if (res.ok) setProposals((prev) => prev.filter((x) => x.proposal_record_id !== id));
      router.refresh();
    } finally {
      setApproving(null);
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
      {proposals.map((p) => (
        <li key={p.proposal_record_id} style={{ border: "1px solid #ccc", borderRadius: 8, padding: "1rem", marginBottom: "0.75rem" }}>
          {p.preview_uri ? (
            <div style={{ marginBottom: "0.75rem", borderRadius: 6, overflow: "hidden", background: "#f0f0f0" }}>
              <img src={p.preview_uri} alt="" style={{ display: "block", width: "100%", maxWidth: 320, maxHeight: 180, objectFit: "contain" }} />
            </div>
          ) : null}
          <strong>{p.title}</strong>
          {p.summary && <p style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>{p.summary}</p>}
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "#666" }}>
            {p.target_type === "concept" ? "Concept · " : ""}{p.proposal_state} · {new Date(p.created_at).toLocaleDateString()}
          </p>
          {p.proposal_state === "pending_review" && (
            <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
              <button type="button" style={btn} onClick={() => handleApprove(p.proposal_record_id, p)} disabled={approving === p.proposal_record_id}>
                {approving === p.proposal_record_id ? "…" : (p.target_surface === "public_habitat" || p.habitat_payload_json) ? "Approve for publication" : p.target_type === "concept" ? "Approve for staging" : "Approve"}
              </button>
              <button type="button" style={btn} onClick={() => handleReject(p.proposal_record_id)} disabled={archiving === p.proposal_record_id}>Reject</button>
              <button type="button" style={btn} onClick={() => handleIgnore(p.proposal_record_id)} disabled={archiving === p.proposal_record_id}>Ignore</button>
              {p.preview_uri && (
                <a href={p.preview_uri} target="_blank" rel="noopener noreferrer" style={{ ...btn, display: "inline-block", border: "1px solid #999", background: "#fff", color: "#333", textDecoration: "none" }}>View</a>
              )}
            </div>
          )}
          {p.proposal_state === "approved" && (
            <button type="button" style={{ ...btn, marginTop: "0.5rem" }} onClick={() => handleArchive(p.proposal_record_id)} disabled={archiving === p.proposal_record_id}>
              {archiving === p.proposal_record_id ? "…" : "Archive"}
            </button>
          )}
        </li>
      ))}
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
