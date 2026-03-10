"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SOURCE_TYPES = [
  { value: "reference", label: "Reference" },
  { value: "identity_seed", label: "Identity seed" },
  { value: "note", label: "Note" },
  { value: "upload", label: "Upload" },
] as const;

const SOURCE_ROLES = [
  { value: "", label: "(default)" },
  { value: "reference", label: "Reference" },
  { value: "identity_seed", label: "Identity seed" },
  { value: "inspiration", label: "Inspiration" },
  { value: "contextual", label: "Contextual" },
  { value: "archive_only", label: "Archive only" },
] as const;

export function UploadDocForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [titleOverride, setTitleOverride] = useState("");
  const [sourceType, setSourceType] = useState("reference");
  const [sourceRole, setSourceRole] = useState("");
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setMessage("Choose a .md or .txt file");
      setStatus("error");
      return;
    }
    setStatus("uploading");
    setMessage("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      if (titleOverride.trim()) formData.set("title", titleOverride.trim());
      formData.set("source_type", sourceType);
      if (sourceRole) formData.set("source_role", sourceRole);

      const res = await fetch("/api/source-items/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setMessage("Document uploaded. It will be used as context in the next session.");
      setFile(null);
      setTitleOverride("");
      setStatus("done");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 520 }}>
      <p style={{ fontSize: "0.9rem", color: "#555" }}>
        Upload a .md or .txt file (max 2MB). Contents are stored as one source item and included in session/chat context.
      </p>
      <div>
        <label htmlFor="upload-doc-file" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
          File *
        </label>
        <input
          id="upload-doc-file"
          type="file"
          accept=".md,.txt"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ width: "100%" }}
        />
      </div>
      <div>
        <label htmlFor="upload-doc-title" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
          Title (optional)
        </label>
        <input
          id="upload-doc-title"
          type="text"
          value={titleOverride}
          onChange={(e) => setTitleOverride(e.target.value)}
          placeholder="Uses filename if blank"
          style={{ width: "100%", padding: "0.5rem" }}
        />
      </div>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <label htmlFor="upload-doc-type" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
            Type
          </label>
          <select
            id="upload-doc-type"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            style={{ padding: "0.5rem", minWidth: 140 }}
          >
            {SOURCE_TYPES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="upload-doc-role" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 600 }}>
            Role
          </label>
          <select
            id="upload-doc-role"
            value={sourceRole}
            onChange={(e) => setSourceRole(e.target.value)}
            style={{ padding: "0.5rem", minWidth: 140 }}
          >
            {SOURCE_ROLES.map((o) => (
              <option key={o.value || "default"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <button
          type="submit"
          disabled={status === "uploading"}
          style={{ padding: "0.5rem 1rem", cursor: status === "uploading" ? "wait" : "pointer" }}
        >
          {status === "uploading" ? "Uploading…" : "Upload document"}
        </button>
      </div>
      {message && (
        <p style={{ fontSize: "0.9rem", color: status === "error" ? "#c00" : "#363" }}>
          {message}
        </p>
      )}
    </form>
  );
}
