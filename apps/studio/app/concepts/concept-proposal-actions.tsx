"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

type Eligibility = {
  eligible: boolean;
  reason: string;
  existingProposalId: string | null;
  existingProposalState: string | null;
};

export function ConceptProposalActions({ artifactId }: { artifactId: string }) {
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/artifacts/${encodeURIComponent(artifactId)}/proposal-eligibility`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && !data.error) setEligibility(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [artifactId]);

  const handleCreateProposal = async () => {
    setCreating(true);
    try {
      const res = await fetch(`/api/artifacts/${encodeURIComponent(artifactId)}/create-proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.proposal_record_id) {
        setCreatedId(data.proposal_record_id);
        setEligibility((prev) =>
          prev ? { ...prev, existingProposalId: data.proposal_record_id, existingProposalState: "pending_review" } : null
        );
      }
    } finally {
      setCreating(false);
    }
  };

  if (eligibility === null) return <span style={{ fontSize: "0.85rem", color: "#888" }}>…</span>;

  const hasProposal = createdId ?? eligibility.existingProposalId;

  return (
    <span style={{ fontSize: "0.85rem", marginTop: "0.35rem", display: "block" }}>
      {hasProposal ? (
        <>
          <Link href="/review/surface">View proposal</Link>
          {eligibility.existingProposalState && ` · ${eligibility.existingProposalState}`}
        </>
      ) : (
        <>
          {eligibility.eligible ? (
            <>
              <span style={{ color: "#2a7" }}>Eligible for proposal</span>
              {" · "}
              <button
                type="button"
                onClick={handleCreateProposal}
                disabled={creating}
                style={{ padding: "0.15rem 0.4rem", fontSize: "0.85rem", cursor: creating ? "wait" : "pointer" }}
              >
                {creating ? "Creating…" : "Turn into proposal"}
              </button>
            </>
          ) : (
            <span style={{ color: "#666" }} title={eligibility.reason}>
              Not proposal-eligible
            </span>
          )}
        </>
      )}
    </span>
  );
}
