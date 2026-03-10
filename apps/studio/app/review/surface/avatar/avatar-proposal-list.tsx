"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Proposal {
  proposal_record_id: string;
  lane_type: string;
  target_type: string;
  artifact_id: string | null;
  title: string;
  summary: string | null;
  proposal_state: string;
  preview_uri: string | null;
  created_at: string;
}

const VIEWS = [
  { view: "pending_review", label: "Pending" },
  { view: "approved", label: "Approved" },
  { view: "archived", label: "Archived" },
] as const;

export function AvatarProposalList({ view }: { view: "pending_review" | "approved" | "archived" }) {
  const router = useRouter();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const stateParam = view === "approved" ? "approved" : view;
    fetch(`/api/proposals?lane_type=surface&target_type=avatar_candidate&proposal_state=${stateParam}`)
      .then((r) => r.json())
      .then((d) => setProposals(d.proposals ?? []))
      .finally(() => setLoading(false));
  }, [view]);

  const handleApproveForStaging = async (id: string) => {
    setApproving(id);
    try {
      const res = await fetch(`/api/proposals/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve_for_staging" }) });
      if (res.ok) setProposals((p) => p.filter((x) => x.proposal_record_id !== id));
      router.refresh();
    } finally {
      setApproving(null);
    }
  };

  const handleApproveForPublication = async (id: string) => {
    setApproving(id);
    try {
      const res = await fetch(`/api/proposals/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve_for_publication" }) });
      if (res.ok) setProposals((p) => p.filter((x) => x.proposal_record_id !== id));
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
  if (proposals.length === 0) return <p>No avatar proposals in this view.</p>;
  return (
    <ul style={{ listStyle: "none", padding: 0 }}>
      {proposals.map((p) => (
        <li key={p.proposal_record_id} style={{ border: "1px solid #ccc", borderRadius: 8, padding: "1rem", marginBottom: "0.75rem" }}>
          {p.preview_uri ? (
            <div style={{ marginBottom: "0.75rem", borderRadius: 6, overflow: "hidden", background: "#f0f0f0" }}>
              <img src={p.preview_uri} alt="" style={{ display: "block", width: "100%", maxWidth: 320, maxHeight: 240, objectFit: "contain" }} />
            </div>
          ) : (
            <div style={{ marginBottom: "0.75rem", width: "100%", maxWidth: 320, height: 120, background: "#eee", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", color: "#666" }}>No preview</div>
          )}
          <strong>{p.title}</strong>
          {p.summary && <p style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>{p.summary}</p>}
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "#666" }}>{p.proposal_state} · {new Date(p.created_at).toLocaleDateString()}</p>
          {p.proposal_state === "pending_review" && (
            <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
              <button type="button" style={btn} onClick={() => handleApproveForStaging(p.proposal_record_id)} disabled={approving === p.proposal_record_id}>
                {approving === p.proposal_record_id ? "…" : "Approve for staging"}
              </button>
              <button type="button" style={btn} onClick={() => handleApproveForPublication(p.proposal_record_id)} disabled={approving === p.proposal_record_id}>
                {approving === p.proposal_record_id ? "…" : "Approve for publication"}
              </button>
              <button type="button" style={btn} onClick={() => handleReject(p.proposal_record_id)} disabled={archiving === p.proposal_record_id}>Reject</button>
              <button type="button" style={btn} onClick={() => handleIgnore(p.proposal_record_id)} disabled={archiving === p.proposal_record_id}>Ignore</button>
              {p.preview_uri && (
                <a href={p.preview_uri} target="_blank" rel="noopener noreferrer" style={{ ...btn, display: "inline-block", border: "1px solid #999", background: "#fff", color: "#333", textDecoration: "none" }}>View</a>
              )}
            </div>
          )}
          {p.proposal_state === "approved_for_staging" && (
            <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
              <button type="button" style={btn} onClick={() => handleApproveForPublication(p.proposal_record_id)} disabled={approving === p.proposal_record_id}>
                {approving === p.proposal_record_id ? "…" : "Approve for publication"}
              </button>
              <button type="button" style={btn} onClick={() => handleArchive(p.proposal_record_id)} disabled={archiving === p.proposal_record_id}>
                {archiving === p.proposal_record_id ? "…" : "Archive"}
              </button>
            </div>
          )}
          {(p.proposal_state === "approved" || p.proposal_state === "approved_for_publication") && (
            <button type="button" style={{ ...btn, marginTop: "0.5rem" }} onClick={() => handleArchive(p.proposal_record_id)} disabled={archiving === p.proposal_record_id}>
              {archiving === p.proposal_record_id ? "…" : "Archive"}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AvatarProposalTabs({ view }: { view: "pending_review" | "approved" | "archived" }) {
  return (
    <nav style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
      {VIEWS.map((v) => (
        <a
          key={v.view}
          href={`/review/surface/avatar${v.view === "pending_review" ? "" : `?view=${v.view}`}`}
          style={{ fontWeight: view === v.view ? 600 : 400 }}
        >
          {v.label}
        </a>
      ))}
    </nav>
  );
}
