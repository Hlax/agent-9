"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SOURCE_TYPES = [
  { value: "reference", label: "Reference" },
  { value: "identity_seed", label: "Identity seed" },
  { value: "research", label: "Research" },
  { value: "note", label: "Note" },
] as const;

const SOURCE_ROLES = [
  { value: "", label: "(default)" },
  { value: "reference", label: "Reference" },
  { value: "identity_seed", label: "Identity seed" },
  { value: "inspiration", label: "Inspiration" },
  { value: "contextual", label: "Contextual" },
  { value: "archive_only", label: "Archive only" },
] as const;

export function ImportFromUrlForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [sourceType, setSourceType] = useState("reference");
  const [sourceRole, setSourceRole] = useState("");
  const [status, setStatus] = useState<"idle" | "importing" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("importing");
    setMessage("");
    try {
      const res = await fetch("/api/source-items/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          source_type: sourceType,
          source_role: sourceRole || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setMessage("Imported. The page was fetched and stored as one source item. You can add tags and identity relevance in the list or by editing the item.");
      setUrl("");
      setStatus("done");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Import failed");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 520 }}>
      <p style={{ fontSize: "0.9rem", color: "#555" }}>
        The crawl runs when you click Import (one request: fetch → extract text → create source item). Slow sites may take a few seconds.
      </p>
      <div>
        <label htmlFor="ingest-url" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
          URL *
        </label>
        <input
          id="ingest-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          placeholder="https://example.com/article"
          style={{ width: "100%", padding: "0.5rem" }}
        />
      </div>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <label htmlFor="ingest-source-type" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
            Type
          </label>
          <select
            id="ingest-source-type"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            style={{ padding: "0.5rem", minWidth: 160 }}
          >
            {SOURCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ingest-source-role" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
            Role (optional)
          </label>
          <select
            id="ingest-source-role"
            value={sourceRole}
            onChange={(e) => setSourceRole(e.target.value)}
            style={{ padding: "0.5rem", minWidth: 160 }}
          >
            {SOURCE_ROLES.map((r) => (
              <option key={r.value || "default"} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button type="submit" disabled={status === "importing"}>
        {status === "importing" ? "Importing…" : "Import from URL"}
      </button>
      {message && (
        <p style={{ margin: 0, fontSize: "0.9rem", color: status === "error" ? "#c00" : "#363" }}>
          {message}
        </p>
      )}
    </form>
  );
}
