"use client";

import { useState, useEffect } from "react";

interface Proposal {
  proposal_record_id: string;
  title: string;
  summary: string | null;
  proposal_state: string;
  created_at: string;
}

export function NameProposalList() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/proposals?lane_type=surface&target_type=identity_name")
      .then((r) => r.json())
      .then((d) => setProposals(d.proposals ?? []))
      .finally(() => setLoading(false));
  }, []);

  const handleApplyName = async (id: string) => {
    setApplying(id);
    try {
      const res = await fetch(`/api/proposals/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply_name" }) });
      if (res.ok) setProposals((p) => p.filter((x) => x.proposal_record_id !== id));
    } finally {
      setApplying(null);
    }
  };

  if (loading) return <p>Loading…</p>;
  if (proposals.length === 0) return <p>No name proposals pending.</p>;
  return (
    <ul style={{ listStyle: "none", padding: 0 }}>
      {proposals.map((p) => (
        <li key={p.proposal_record_id} style={{ border: "1px solid #ccc", borderRadius: 8, padding: "1rem", marginBottom: "0.5rem" }}>
          <strong>Proposed name: {p.title}</strong>
          {p.summary && <p style={{ margin: "0.5rem 0 0", fontSize: "0.9rem" }}>{p.summary}</p>}
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#666" }}>{p.proposal_state} · {new Date(p.created_at).toLocaleDateString()}</p>
          {p.proposal_state === "pending_review" && (
            <button type="button" onClick={() => handleApplyName(p.proposal_record_id)} disabled={applying === p.proposal_record_id} style={{ marginTop: "0.5rem" }}>
              {applying === p.proposal_record_id ? "Applying…" : "Apply name to identity"}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
