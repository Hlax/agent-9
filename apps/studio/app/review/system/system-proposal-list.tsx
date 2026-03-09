"use client";

import { useState, useEffect } from "react";

interface Proposal {
  proposal_record_id: string;
  target_type: string;
  title: string;
  summary: string | null;
  proposal_state: string;
  created_at: string;
}

export function SystemProposalList() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/proposals?lane_type=system")
      .then((r) => r.json())
      .then((d) => setProposals(d.proposals ?? []))
      .finally(() => setLoading(false));
  }, []);

  const handleApprove = async (id: string) => {
    setApproving(id);
    try {
      const res = await fetch(`/api/proposals/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve" }) });
      if (res.ok) setProposals((p) => p.filter((x) => x.proposal_record_id !== id));
    } finally {
      setApproving(null);
    }
  };

  if (loading) return <p>Loading…</p>;
  if (proposals.length === 0) return <p>No system proposals pending.</p>;
  return (
    <ul style={{ listStyle: "none", padding: 0 }}>
      {proposals.map((p) => (
        <li key={p.proposal_record_id} style={{ border: "1px solid #ccc", borderRadius: 8, padding: "1rem", marginBottom: "0.5rem" }}>
          <strong>{p.title}</strong>
          <span style={{ fontSize: "0.85rem", color: "#666", marginLeft: "0.5rem" }}>({p.target_type})</span>
          {p.summary && <p style={{ margin: "0.5rem 0 0", fontSize: "0.9rem" }}>{p.summary}</p>}
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#666" }}>{p.proposal_state} · {new Date(p.created_at).toLocaleDateString()}</p>
          {p.proposal_state === "pending_review" && (
            <button type="button" onClick={() => handleApprove(p.proposal_record_id)} disabled={approving === p.proposal_record_id} style={{ marginTop: "0.5rem" }}>
              {approving === p.proposal_record_id ? "Approving…" : "Approve (record only)"}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
