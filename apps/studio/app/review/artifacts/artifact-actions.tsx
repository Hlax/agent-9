"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const btn = { padding: "0.25rem 0.5rem", fontSize: "0.8rem", borderRadius: 4 } as const;

export function ArtifactActions({
  artifactId,
  currentState,
  publicationState,
  medium,
}: {
  artifactId: string;
  currentState: string | null;
  publicationState?: string | null;
  medium?: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [archiveNote, setArchiveNote] = useState("");

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
      const res = await fetch(`/api/artifacts/${artifactId}/publish`, { method: "POST" });
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

  async function handleUnpublish() {
    setLoading("unpublish");
    try {
      const res = await fetch(`/api/artifacts/${artifactId}/unpublish`, { method: "POST" });
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

  async function handleArchiveWithNote() {
    setLoading("archive-note");
    try {
      const res = await fetch("/api/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artifact_id: artifactId,
          unresolved_question: archiveNote || null,
          note: archiveNote || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error || res.statusText);
        return;
      }
      await handleAction("archived");
    } finally {
      setLoading(null);
    }
  }

  async function handleSetActiveAvatar() {
    setLoading("avatar");
    try {
      const res = await fetch("/api/identity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active_avatar_artifact_id: artifactId }),
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

  const canUnpublish = publicationState === "published";

  const canSetAvatar =
    medium === "image" &&
    (currentState === "approved" || currentState === "approved_for_publication");

  return (
    <div style={{ marginTop: "0.5rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
        <button type="button" style={btn} disabled={loading !== null || currentState === "approved_for_publication"} onClick={() => handleAction("approved_for_publication")}>
          {loading === "approved_for_publication" ? "…" : "Approve"}
        </button>
        <button type="button" style={btn} disabled={loading !== null || currentState === "rejected"} onClick={() => handleAction("rejected")}>
          {loading === "rejected" ? "…" : "Reject"}
        </button>
        <button type="button" style={btn} disabled={loading !== null || currentState === "archived"} onClick={() => handleAction("archived")}>
          {loading === "archived" ? "…" : "Ignore"}
        </button>
        {canPublish && (
          <button type="button" style={btn} disabled={loading !== null} onClick={handlePublish}>
            {loading === "publish" ? "…" : "Publish"}
          </button>
        )}
        {canUnpublish && (
          <button type="button" style={btn} disabled={loading !== null} onClick={handleUnpublish}>
            {loading === "unpublish" ? "…" : "Unpublish"}
          </button>
        )}
        {canSetAvatar && (
          <button type="button" style={btn} disabled={loading !== null} onClick={handleSetActiveAvatar}>
            {loading === "avatar" ? "…" : "Set as active avatar"}
          </button>
        )}
      </div>
      <div style={{ marginTop: "0.35rem", display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Archive reason / unresolved question…"
          value={archiveNote}
          onChange={(e) => setArchiveNote(e.target.value)}
          style={{ flex: 1, minWidth: 180, fontSize: "0.8rem", padding: "0.15rem 0.25rem" }}
          disabled={loading !== null}
        />
        <button
          type="button"
          style={btn}
          disabled={loading !== null || currentState === "archived"}
          onClick={handleArchiveWithNote}
        >
          {loading === "archive-note" ? "…" : "Archive + remember"}
        </button>
      </div>
    </div>
  );
}
