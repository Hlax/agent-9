"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Proposal {
  proposal_record_id: string;
  proposal_role: string | null;
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

export function MediumProposalTabs({ view }: { view: "pending_review" | "approved" | "archived" }) {
  return (
    <nav style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
      {VIEWS.map((v) => (
        <a
          key={v.view}
          href={`/review/medium${v.view === "pending_review" ? "" : `?view=${v.view}`}`}
          style={{ fontWeight: view === v.view ? 600 : 400 }}
        >
          {v.label}
        </a>
      ))}
    </nav>
  );
}

export function MediumProposalList({ view }: { view: "pending_review" | "approved" | "archived" }) {
  const router = useRouter();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/proposals?lane_type=medium&proposal_state=${view}`)
      .then((r) => r.json())
      .then((d) => setProposals(d.proposals ?? []))
      .finally(() => setLoading(false));
  }, [view]);

  const handleApproveForRoadmap = async (id: string) => {
    setApproving(id);
    try {
      const res = await fetch(`/api/proposals/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (res.ok) {
        setProposals((p) => p.filter((x) => x.proposal_record_id !== id));
        router.refresh();
      }
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (id: string) => {
    setArchiving(id);
    try {
      const res = await fetch(`/api/proposals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_state: "rejected" }),
      });
      if (res.ok) {
        setProposals((p) => p.filter((x) => x.proposal_record_id !== id));
        router.refresh();
      }
    } finally {
      setArchiving(null);
    }
  };

  const handleArchive = async (id: string) => {
    setArchiving(id);
    try {
      const res = await fetch(`/api/proposals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_state: "archived" }),
      });
      if (res.ok) {
        setProposals((p) => p.filter((x) => x.proposal_record_id !== id));
        router.refresh();
      }
    } finally {
      setArchiving(null);
    }
  };

  const btn = { padding: "0.5rem 0.75rem", fontSize: "0.85rem", borderRadius: 4 } as const;

  /** Map backend role to operator-friendly label; extend as more medium roles are added. */
  function mediumRoleLabel(role: string | null): string {
    if (!role) return "Capability";
    if (role === "medium_extension") return "Extension";
    return "Capability";
  }

  if (loading) return <p>Loading…</p>;
  if (proposals.length === 0) return <p>No medium proposals in this view.</p>;

  return (
    <ul style={{ listStyle: "none", padding: 0 }}>
      {proposals.map((p) => (
        <li key={p.proposal_record_id} style={{ border: "1px solid #ccc", borderRadius: 8, padding: "1rem", marginBottom: "0.75rem" }}>
          <strong>{p.title}</strong>
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "#555" }}>
            <span style={{ fontWeight: 600 }}>Lane:</span> Medium — capability proposal, not stageable.{" "}
            <span style={{ fontWeight: 600 }}>Type:</span> {mediumRoleLabel(p.proposal_role)}
          </p>
          {p.summary && <p style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>{p.summary}</p>}
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "#666" }}>
            {p.proposal_state} · {new Date(p.created_at).toLocaleDateString()}
          </p>
          <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <Link href={`/review/proposals/${p.proposal_record_id}`} style={{ ...btn, display: "inline-block", border: "1px solid #999", background: "#fff", color: "#333", textDecoration: "none" }}>
              Inspect
            </Link>
          {p.proposal_state === "pending_review" && (
            <>
              <button
                type="button"
                style={btn}
                onClick={() => handleApproveForRoadmap(p.proposal_record_id)}
                disabled={approving === p.proposal_record_id}
              >
                {approving === p.proposal_record_id ? "…" : "Approve for roadmap"}
              </button>
              <button type="button" style={btn} onClick={() => handleReject(p.proposal_record_id)} disabled={archiving === p.proposal_record_id}>
                {archiving === p.proposal_record_id ? "…" : "Reject"}
              </button>
              <button type="button" style={btn} onClick={() => handleArchive(p.proposal_record_id)} disabled={archiving === p.proposal_record_id}>
                {archiving === p.proposal_record_id ? "…" : "Archive"}
              </button>
            </>
          )}
          {p.proposal_state === "approved" && (
            <button type="button" style={btn} onClick={() => handleArchive(p.proposal_record_id)} disabled={archiving === p.proposal_record_id}>
              {archiving === p.proposal_record_id ? "…" : "Archive"}
            </button>
          )}
          </div>
        </li>
      ))}
    </ul>
  );
}

