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
  const [tagsStr, setTagsStr] = useState("");
  const [ontologyNotes, setOntologyNotes] = useState("");
  const [identityRelevance, setIdentityRelevance] = useState("");
  const [identityWeight, setIdentityWeight] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setMessage("");
    const tags = tagsStr.trim() ? tagsStr.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean) : undefined;
    const weight = identityWeight.trim() ? parseFloat(identityWeight) : undefined;
    try {
      const res = await fetch("/api/source-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          source_type: sourceType,
          summary: summary.trim() || undefined,
          content_text: contentText.trim() || undefined,
          tags: tags?.length ? tags : undefined,
          ontology_notes: ontologyNotes.trim() || undefined,
          identity_relevance_notes: identityRelevance.trim() || undefined,
          identity_weight: weight != null && Number.isFinite(weight) ? weight : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add");
      setMessage("Added. It will be used as context in the next session.");
      setTitle("");
      setSummary("");
      setContentText("");
      setTagsStr("");
      setOntologyNotes("");
      setIdentityRelevance("");
      setIdentityWeight("");
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
      <div>
        <label htmlFor="tags" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
          Tags (optional)
        </label>
        <input
          id="tags"
          type="text"
          value={tagsStr}
          onChange={(e) => setTagsStr(e.target.value)}
          placeholder="Comma- or space-separated, e.g. cinematic, melancholy"
          style={{ width: "100%", padding: "0.5rem" }}
        />
      </div>
      <div>
        <label htmlFor="identity_relevance" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
          Identity relevance (optional)
        </label>
        <textarea
          id="identity_relevance"
          value={identityRelevance}
          onChange={(e) => setIdentityRelevance(e.target.value)}
          rows={2}
          placeholder="Why this source matters to identity formation"
          style={{ width: "100%", padding: "0.5rem" }}
        />
      </div>
      <div>
        <label htmlFor="ontology_notes" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
          Ontology / definitions (optional)
        </label>
        <input
          id="ontology_notes"
          type="text"
          value={ontologyNotes}
          onChange={(e) => setOntologyNotes(e.target.value)}
          placeholder="What terms mean in this system"
          style={{ width: "100%", padding: "0.5rem" }}
        />
      </div>
      <div>
        <label htmlFor="identity_weight" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
          Identity weight (optional, 0–1)
        </label>
        <input
          id="identity_weight"
          type="text"
          value={identityWeight}
          onChange={(e) => setIdentityWeight(e.target.value)}
          placeholder="e.g. 0.7"
          style={{ width: "100%", padding: "0.5rem", maxWidth: 80 }}
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
