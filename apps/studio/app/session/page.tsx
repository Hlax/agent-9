"use client";

import Link from "next/link";
import { useState } from "react";

type PreferredMedium = "writing" | "concept" | "image";

export default function SessionPage() {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastMedium, setLastMedium] = useState<{ requested?: string; generated?: string } | null>(null);
  const [preferMedium, setPreferMedium] = useState<PreferredMedium>("writing");
  const [promptContext, setPromptContext] = useState<string>("");

  async function startSession() {
    setStatus("running");
    setMessage("");
    setSessionId(null);
    setLastMedium(null);
    try {
      const res = await fetch("/api/session/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferMedium,
          promptContext: promptContext.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Session failed");
      setLastMedium({
        requested: data.requested_medium,
        generated: data.artifact_medium,
      });
      setMessage("Session completed. Check artifact review queue.");
      if (data.session_id) setSessionId(data.session_id);
      setStatus("done");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "1rem" }}>
      <p><Link href="/">← Twin</Link> · <Link href="/sessions">Sessions</Link></p>
      <h1>Start session</h1>
      <p>Run one creative session (identity + sources seed the context; optional prompt below). One artifact, then critique and evaluation.</p>
      <p>
        <label>
          Generate:{" "}
          <select
            value={preferMedium}
            onChange={(e) => setPreferMedium(e.target.value as PreferredMedium)}
            disabled={status === "running"}
          >
            <option value="writing">Writing (text)</option>
            <option value="concept">Concept (reflect)</option>
            <option value="image">Image (DALL·E)</option>
          </select>
        </label>
      </p>
      <p>
        <label style={{ display: "block", marginBottom: "0.25rem" }}>
          Optional prompt (seed is always included):
        </label>
        <textarea
          value={promptContext}
          onChange={(e) => setPromptContext(e.target.value)}
          disabled={status === "running"}
          placeholder="e.g. a mood, a theme, or leave blank to use only identity + sources"
          rows={3}
          style={{ width: "100%", maxWidth: 480, padding: "0.5rem", fontSize: "0.95rem" }}
        />
      </p>
      <button
        type="button"
        onClick={startSession}
        disabled={status === "running"}
      >
        {status === "running" ? "Running…" : "Start session"}
      </button>
      {message && <p style={{ marginTop: "1rem" }}>{message}</p>}
      {lastMedium && status === "done" && (
        <p style={{ marginTop: "0.25rem", fontSize: "0.9rem", color: "#555" }}>
          Requested: {lastMedium.requested ?? "—"} → Generated: {lastMedium.generated ?? "—"}
        </p>
      )}
      {sessionId && status === "done" && (
        <p style={{ marginTop: "0.5rem" }}>
          <Link href={`/sessions/${sessionId}`}>View session</Link>
        </p>
      )}
    </main>
  );
}
