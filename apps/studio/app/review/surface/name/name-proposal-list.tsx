"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
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

  const refetch = useCallback(() => {
    return fetch(`/api/proposals?lane_type=surface&target_type=identity_name&proposal_state=${view}`)
      .then((r) => r.json())
      .then((d) => setProposals(d.proposals ?? []));
  }, [view]);

  useEffect(() => {
    setLoading(true);
    refetch().finally(() => setLoading(false));
  }, [refetch]);

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

  const btn = { padding: "0.5rem 0.75rem", fontSize: "0.85rem", borderRadius: 4 } as const;

  if (loading) return <p>Loading…</p>;
  return (
    <>
      {view === "pending_review" && <AddNameProposalForm onAdded={refetch} />}
      {proposals.length === 0 && <p>No name proposals in this view.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {proposals.map((p) => (
          <li key={p.proposal_record_id} style={{ border: "1px solid #ccc", borderRadius: 8, padding: "1rem", marginBottom: "0.5rem" }}>
            <strong>Proposed name: {p.title}</strong>
            {p.summary && <p style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>{p.summary}</p>}
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "#555" }}>
              <span style={{ fontWeight: 600 }}>Lane:</span> Surface — user-facing change.{" "}
              <span style={{ fontWeight: 600 }}>Affects:</span> identity name.
            </p>
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "#666" }}>{p.proposal_state} · {new Date(p.created_at).toLocaleDateString()}</p>
            <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
              <Link href={`/review/proposals/${p.proposal_record_id}`} style={{ ...btn, display: "inline-block", border: "1px solid #999", background: "#fff", color: "#333", textDecoration: "none" }}>
                Inspect
              </Link>
            {p.proposal_state === "pending_review" && (
              <>
                <button type="button" style={btn} onClick={() => handleApplyName(p.proposal_record_id)} disabled={applying === p.proposal_record_id}>
                  {applying === p.proposal_record_id ? "…" : "Apply name"}
                </button>
                <button type="button" style={btn} onClick={() => handleReject(p.proposal_record_id)} disabled={archiving === p.proposal_record_id}>Reject</button>
                <button type="button" style={btn} onClick={() => handleIgnore(p.proposal_record_id)} disabled={archiving === p.proposal_record_id}>Ignore</button>
                <a href="/identity" style={{ ...btn, display: "inline-block", border: "1px solid #999", background: "#fff", color: "#333", textDecoration: "none" }}>View identity</a>
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
    </>
  );
}

function AddNameProposalForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [rationale, setRationale] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = name.trim();
    if (!title) { setError("Name is required"); return; }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lane_type: "surface", target_type: "identity_name", title, summary: rationale.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error ?? "Failed to add proposal"); return; }
      setName("");
      setRationale("");
      onAdded();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section style={{ border: "1px solid #ccc", borderRadius: 8, padding: "1rem", marginBottom: "1rem", background: "#f9f9f9" }}>
      <h3 style={{ margin: "0 0 0.5rem" }}>Twin proposed a name in chat?</h3>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.9rem", color: "#555" }}>Add it here so you can approve it and set it as the canonical identity name.</p>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 400 }}>
        <label>
          Proposed name <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Echo" required />
        </label>
        <label>
          Rationale (optional) <input type="text" value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Short reason from Twin" />
        </label>
        {error && <p style={{ margin: 0, color: "#c00", fontSize: "0.9rem" }}>{error}</p>}
        <button type="submit" disabled={submitting}>{submitting ? "Adding…" : "Add to name proposals"}</button>
      </form>
    </section>
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
