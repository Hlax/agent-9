"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Proposal {
  proposal_record_id: string;
  title: string;
  summary: string | null;
  proposal_state: string;
  created_at: string;
}

const VIEWS = [
  { view: "pending_review", label: "Pending" },
  { view: "approved", label: "Approved" },
  { view: "archived", label: "Archived" },
] as const;

export function NameProposalList({ view }: { view: "pending_review" | "approved" | "archived" }) {
  const router = useRouter();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/proposals?lane_type=surface&target_type=identity_name&proposal_state=${view}`)
      .then((r) => r.json())
      .then((d) => setProposals(d.proposals ?? []))
      .finally(() => setLoading(false));
  }, [view]);

  const handleApplyName = async (id: string) => {
    setApplying(id);
    try {
      const res = await fetch(`/api/proposals/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply_name" }) });
      if (res.ok) setProposals((p) => p.filter((x) => x.proposal_record_id !== id));
      router.refresh();
    } finally {
      setApplying(null);
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
  if (proposals.length === 0) return <p>No name proposals in this view.</p>;
  return (
    <ul style={{ listStyle: "none", padding: 0 }}>
      {proposals.map((p) => (
        <li key={p.proposal_record_id} style={{ border: "1px solid #ccc", borderRadius: 8, padding: "1rem", marginBottom: "0.5rem" }}>
          <strong>Proposed name: {p.title}</strong>
          {p.summary && <p style={{ margin: "0.5rem 0 0", fontSize: "0.9rem" }}>{p.summary}</p>}
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#666" }}>{p.proposal_state} · {new Date(p.created_at).toLocaleDateString()}</p>
          {p.proposal_state === "pending_review" && (
            <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
              <button type="button" onClick={() => handleApplyName(p.proposal_record_id)} disabled={applying === p.proposal_record_id}>
                {applying === p.proposal_record_id ? "Applying…" : "Apply name to identity"}
              </button>
              <button type="button" onClick={() => handleArchive(p.proposal_record_id)} disabled={archiving === p.proposal_record_id}>
                {archiving === p.proposal_record_id ? "…" : "Archive"}
              </button>
            </div>
          )}
          {p.proposal_state === "approved" && (
            <button type="button" onClick={() => handleArchive(p.proposal_record_id)} disabled={archiving === p.proposal_record_id} style={{ marginTop: "0.5rem" }}>
              {archiving === p.proposal_record_id ? "…" : "Archive"}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function NameProposalTabs({ view }: { view: "pending_review" | "approved" | "archived" }) {
  return (
    <nav style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
      {VIEWS.map((v) => (
        <a
          key={v.view}
          href={`/review/surface/name${v.view === "pending_review" ? "" : `?view=${v.view}`}`}
          style={{ fontWeight: view === v.view ? 600 : 400 }}
        >
          {v.label}
        </a>
      ))}
    </nav>
  );
}
