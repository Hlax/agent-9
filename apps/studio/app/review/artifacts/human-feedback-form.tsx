"use client";

import { useState } from "react";

const fieldLabelStyle: React.CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 600,
  marginBottom: "0.15rem",
};

export function HumanFeedbackForm({ artifactId }: { artifactId: string }) {
  const [score, setScore] = useState<number | "" | null>(null);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const cleanedScore =
        score === "" || score == null ? null : Math.max(0, Math.min(1, Number(score)));
      const payload = {
        target_type: "artifact",
        target_id: artifactId,
        score: cleanedScore,
        note: note.trim() || null,
        tags:
          tags.trim().length > 0
            ? tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            : null,
      };
      const res = await fetch("/api/human-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.error || "Failed to save feedback");
        return;
      }
      setMessage("Saved");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to save feedback");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px dashed #ddd" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        <div style={{ minWidth: 160 }}>
          <label style={fieldLabelStyle}>
            Overall signal (0–1)
          </label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.1}
            value={score === null ? "" : score}
            onChange={(e) => {
              const v = e.target.value;
              setScore(v === "" ? "" : Number(v));
            }}
            style={{ width: "100%", fontSize: "0.8rem", padding: "0.15rem 0.25rem" }}
            disabled={submitting}
          />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={fieldLabelStyle}>
            Note (short)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why this works / doesn't…"
            style={{ width: "100%", fontSize: "0.8rem", padding: "0.15rem 0.25rem" }}
            disabled={submitting}
          />
        </div>
        <div style={{ minWidth: 160 }}>
          <label style={fieldLabelStyle}>
            Tags
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="comma,separated,tags"
            style={{ width: "100%", fontSize: "0.8rem", padding: "0.15rem 0.25rem" }}
            disabled={submitting}
          />
        </div>
        <div>
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "0.3rem 0.7rem",
              fontSize: "0.8rem",
              borderRadius: 4,
              border: "1px solid #333",
              background: submitting ? "#eee" : "#fff",
            }}
          >
            {submitting ? "Saving…" : "Save feedback"}
          </button>
        </div>
        {message && (
          <div style={{ fontSize: "0.75rem", color: message === "Saved" ? "#0a0" : "#c00" }}>
            {message}
          </div>
        )}
      </div>
    </form>
  );
}

