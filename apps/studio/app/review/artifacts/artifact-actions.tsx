"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ACTIONS: { state: string; label: string }[] = [
  { state: "approved", label: "Approve" },
  { state: "approved_with_annotation", label: "Approve + note" },
  { state: "needs_revision", label: "Needs revision" },
  { state: "rejected", label: "Reject" },
  { state: "archived", label: "Archive" },
  { state: "approved_for_publication", label: "Approve for publication" },
];

export function ArtifactActions({
  artifactId,
  currentState,
  publicationState,
}: {
  artifactId: string;
  currentState: string | null;
  publicationState?: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleAction(state: string) {
    setLoading(state);
    try {
      const res = await fetch(`/api/artifacts/${artifactId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approval_state: state }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || res.statusText);
        return;
      }
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function handlePublish() {
    setLoading("publish");
    try {
      const res = await fetch(`/api/artifacts/${artifactId}/publish`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || res.statusText);
        return;
      }
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  const canPublish =
    currentState === "approved_for_publication" &&
    publicationState !== "published";

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
      {ACTIONS.map(({ state, label }) => (
        <button
          key={state}
          type="button"
          disabled={loading !== null || currentState === state}
          onClick={() => handleAction(state)}
          style={{ fontSize: "0.85rem" }}
        >
          {loading === state ? "…" : label}
        </button>
      ))}
      {canPublish && (
        <button
          type="button"
          disabled={loading !== null}
          onClick={handlePublish}
          style={{ fontSize: "0.85rem", marginLeft: "0.5rem" }}
        >
          {loading === "publish" ? "…" : "Publish"}
        </button>
      )}
    </div>
  );
}
