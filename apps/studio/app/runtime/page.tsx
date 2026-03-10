"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface TraceSession {
  session_id: string;
  mode: string | null;
  drive: string | null;
  project: string | null;
  thread: string | null;
  idea: string | null;
  artifact_id: string | null;
  proposal_id: string | null;
  proposal_type: string | null;
  tokens_used: number | null;
  created_at: string;
}

export default function RuntimeDebugPage() {
  const [state, setState] = useState<Record<string, unknown> | null>(null);
  const [traces, setTraces] = useState<{ sessions: TraceSession[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetch("/api/runtime/state").then((r) => r.json()), fetch("/api/runtime/trace").then((r) => r.json())])
      .then(([stateJson, traceJson]) => {
        setState(stateJson);
        setTraces(traceJson);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  if (error) {
    return (
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "1rem" }}>
        <p><Link href="/">← Twin Studio</Link></p>
        <h1>Runtime</h1>
        <p style={{ color: "#a00" }}>{error}</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "1rem" }}>
      <p><Link href="/">← Twin Studio</Link></p>
      <h1>Runtime (debug)</h1>
      <p style={{ fontSize: "0.9rem", color: "#555" }}>
        Current state and last 10 session traces. Use this to see how the Twin is wired and why it generated what it did.
      </p>

      {state && (
        <section style={{ marginTop: "1.5rem", border: "1px solid #ddd", borderRadius: 8, padding: "1rem", background: "#fafafa" }}>
          <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Current state</h2>
          <pre style={{ margin: 0, fontSize: "0.75rem", overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {JSON.stringify(
              {
                runtime: state.runtime,
                creative_state: state.creative_state,
                active_project: state.active_project,
                active_thread: state.active_thread,
                return_candidates: state.return_candidates,
              },
              null,
              2
            )}
          </pre>
        </section>
      )}

      {traces && traces.sessions && traces.sessions.length > 0 && (
        <section style={{ marginTop: "1.5rem", border: "1px solid #ddd", borderRadius: 8, padding: "1rem", background: "#fafafa" }}>
          <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Last 10 sessions (traces)</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {traces.sessions.map((s) => (
              <li
                key={s.session_id}
                style={{
                  borderBottom: "1px solid #eee",
                  padding: "0.5rem 0",
                  fontSize: "0.85rem",
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {s.mode ?? "—"} · {s.drive ?? "—"}
                  {s.created_at && (
                    <span style={{ fontWeight: 400, color: "#666", marginLeft: "0.5rem" }}>
                      {new Date(s.created_at).toLocaleString()}
                    </span>
                  )}
                </div>
                <div style={{ color: "#444", marginTop: "0.25rem" }}>
                  Project: {s.project ?? "—"} · Thread: {s.thread ?? "—"} · Idea: {s.idea ?? "—"}
                </div>
                <div style={{ marginTop: "0.25rem" }}>
                  {s.artifact_id && (
                    <Link href={`/review/artifacts?highlight=${s.artifact_id}`} style={{ marginRight: "0.75rem" }}>
                      Artifact
                    </Link>
                  )}
                  {s.proposal_id && (
                    <span>
                      Proposal ({s.proposal_type ?? "—"})
                    </span>
                  )}
                  {s.tokens_used != null && <span style={{ marginLeft: "0.5rem", color: "#666" }}>{s.tokens_used} tokens</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {traces && traces.sessions?.length === 0 && (
        <p style={{ marginTop: "1.5rem", color: "#666" }}>No session traces yet. Run a session to see traces.</p>
      )}
    </main>
  );
}
