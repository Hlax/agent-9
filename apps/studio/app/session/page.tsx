"use client";

import Link from "next/link";
import { useState } from "react";

export default function SessionPage() {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);

  async function startSession() {
    setStatus("running");
    setMessage("");
    setSessionId(null);
    try {
      const res = await fetch("/api/session/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Session failed");
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
      <p><Link href="/">← Studio</Link> · <Link href="/sessions">Sessions</Link></p>
      <h1>Start session</h1>
      <p>Run one creative session (GPT pipeline: one artifact, critique, evaluation, state snapshot, memory).</p>
      <button
        type="button"
        onClick={startSession}
        disabled={status === "running"}
      >
        {status === "running" ? "Running…" : "Start session"}
      </button>
      {message && <p style={{ marginTop: "1rem" }}>{message}</p>}
      {sessionId && status === "done" && (
        <p style={{ marginTop: "0.5rem" }}>
          <Link href={`/sessions/${sessionId}`}>View session</Link>
        </p>
      )}
    </main>
  );
}
