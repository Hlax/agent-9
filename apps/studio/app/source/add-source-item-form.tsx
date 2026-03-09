"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SOURCE_TYPES = [
  { value: "identity_seed", label: "Identity seed" },
  { value: "reference", label: "Reference" },
  { value: "note", label: "Note" },
  { value: "prompt", label: "Prompt" },
  { value: "fragment", label: "Fragment" },
  { value: "upload", label: "Upload" },
] as const;

export function AddSourceItemForm() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState("identity_seed");
  const [summary, setSummary] = useState("");
  const [contentText, setContentText] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setMessage("");
    try {
      const res = await fetch("/api/source-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          source_type: sourceType,
          summary: summary.trim() || undefined,
          content_text: contentText.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add");
      setMessage("Added. It will be used as context in the next session.");
      setTitle("");
      setSummary("");
      setContentText("");
      setStatus("done");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 480 }}>
      <div>
        <label htmlFor="title" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
          Title *
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="e.g. Harvey creative philosophy"
          style={{ width: "100%", padding: "0.5rem" }}
        />
      </div>
      <div>
        <label htmlFor="source_type" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
          Type (used for retrieval)
        </label>
        <select
          id="source_type"
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value)}
          style={{ padding: "0.5rem", minWidth: 200 }}
        >
          {SOURCE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="summary" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
          Summary (optional)
        </label>
        <textarea
          id="summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={2}
          placeholder="Short summary for context"
          style={{ width: "100%", padding: "0.5rem" }}
        />
      </div>
      <div>
        <label htmlFor="content_text" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
          Content (optional)
        </label>
        <textarea
          id="content_text"
          value={contentText}
          onChange={(e) => setContentText(e.target.value)}
          rows={4}
          placeholder="Full text or notes — included in session context"
          style={{ width: "100%", padding: "0.5rem" }}
        />
      </div>
      <button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Adding…" : "Add source item"}
      </button>
      {message && (
        <p style={{ margin: 0, fontSize: "0.9rem", color: status === "error" ? "#c00" : "#363" }}>
          {message}
        </p>
      )}
    </form>
  );
}
