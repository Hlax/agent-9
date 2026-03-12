import Link from "next/link";
import { OntologyPanel, type OntologySummaryProps } from "./ontology-panel";

export const dynamic = "force-dynamic";
import { ContinuityHistory } from "./continuity-history";
import { HealthPanel } from "./health-panel";
import { buildRuntimeHealthSummary } from "@/lib/runtime-health";
import type { ContinuitySessionRow, ContinuityAggregateSummary } from "@/lib/runtime-continuity";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  getRuntimeStatePayload,
  getRuntimeTracePayload,
  getRuntimeDeliberationPayload,
  getRuntimeContinuityPayload,
} from "@/lib/runtime-state-api";

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

async function fetchRuntimeState() {
  const supabase = getSupabaseServer();
  const [stateRes, traceRes, deliberationRes, continuityRes] = await Promise.all([
    getRuntimeStatePayload(supabase),
    getRuntimeTracePayload(supabase),
    getRuntimeDeliberationPayload(supabase),
    getRuntimeContinuityPayload(supabase),
  ]);
  return {
    state: stateRes as Record<string, unknown> | null,
    traces: traceRes as { sessions: TraceSession[] } | null,
    deliberation: deliberationRes as { trace: unknown } | null,
    continuity: continuityRes as {
      sessions: ContinuitySessionRow[];
      summary: ContinuityAggregateSummary | null;
    } | null,
  };
}

export default async function RuntimeDebugPage() {
  const { state, traces, deliberation, continuity } = await fetchRuntimeState();
  const latestDeliberation = deliberation?.trace ?? null;
  const health = continuity ? buildRuntimeHealthSummary(continuity.sessions ?? []) : null;

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "1rem" }}>
      <p>
        <Link href="/">← Twin Studio</Link>
      </p>
      <h1>Runtime (debug)</h1>
      <p style={{ fontSize: "0.9rem", color: "#555" }}>
        Current state, recent sessions, and ontology signals. Use this to see how the Twin is wired and how its posture
        is evolving over time.
      </p>

      {state && (
        <section
          style={{
            marginTop: "1.5rem",
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: "1rem",
            background: "#fafafa",
          }}
        >
          <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Current state</h2>
          <pre
            style={{
              margin: 0,
              fontSize: "0.75rem",
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
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

      <OntologyPanel trace={latestDeliberation as OntologySummaryProps["trace"]} />

      <HealthPanel health={health} />

      {continuity && (
        <ContinuityHistory
          sessions={continuity.sessions ?? []}
          summary={continuity.summary}
        />
      )}

      {traces && traces.sessions && traces.sessions.length > 0 && (
        <section
          style={{
            marginTop: "1.5rem",
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: "1rem",
            background: "#fafafa",
          }}
        >
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
                  {s.tokens_used != null && (
                    <span style={{ marginLeft: "0.5rem", color: "#666" }}>{s.tokens_used} tokens</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {traces && traces.sessions?.length === 0 && (
        <p style={{ marginTop: "1.5rem", color: "#666" }}>
          No session traces yet. Run a session to see traces.
        </p>
      )}
    </main>
  );
}
