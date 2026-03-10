"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Proposal {
  proposal_record_id: string;
  lane_type: string;
  target_type: string;
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
    fetch(`/api/proposals?lane_type=surface&target_type=avatar_candidate&proposal_state=${view}`)
      .then((r) => r.json())
      .then((d) => setProposals(d.proposals ?? []))
      .finally(() => setLoading(false));
  }, [view]);

  const handleApprove = async (id: string) => {
    setApproving(id);
    try {
      const res = await fetch(`/api/proposals/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve_avatar" }) });
      if (res.ok) setProposals((p) => p.filter((x) => x.proposal_record_id !== id));
      router.refresh();
    } finally {
      setApproving(null);
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

  if (loading) return <p>Loading…</p>;
  if (proposals.length === 0) return <p>No avatar proposals in this view.</p>;
  return (
    <ul style={{ listStyle: "none", padding: 0 }}>
      {proposals.map((p) => (
        <li key={p.proposal_record_id} style={{ border: "1px solid #ccc", borderRadius: 8, padding: "1rem", marginBottom: "0.5rem" }}>
          <strong>{p.title}</strong>
          {p.summary && <p style={{ margin: "0.5rem 0 0", fontSize: "0.9rem" }}>{p.summary}</p>}
          {p.preview_uri && <img src={p.preview_uri} alt="" style={{ maxWidth: 120, marginTop: "0.5rem" }} />}
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#666" }}>{p.proposal_state} · {new Date(p.created_at).toLocaleDateString()}</p>
          {p.proposal_state === "pending_review" && (
            <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
              <button type="button" onClick={() => handleApprove(p.proposal_record_id)} disabled={approving === p.proposal_record_id}>
                {approving === p.proposal_record_id ? "Approving…" : "Approve avatar"}
              </button>
              <button type="button" onClick={() => handleArchive(p.proposal_record_id)} disabled={archiving === p.proposal_record_id}>
                {archiving === p.proposal_record_id ? "…" : "Archive"}
              </button>
            </div>
          )}
          {(p.proposal_state === "approved") && (
            <button type="button" onClick={() => handleArchive(p.proposal_record_id)} disabled={archiving === p.proposal_record_id} style={{ marginTop: "0.5rem" }}>
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
