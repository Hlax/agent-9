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
  getSessionContinuityTimeline,
  deriveTrajectoryAdvisoryDryRun,
  type SessionTimelineRow,
  type SessionClusteringSummary,
  type SessionSelectionEvidenceDisplay,
  type TrajectoryAdvisoryLog,
} from "@/lib/runtime-state-api";
import { deriveThoughtMapSummary, type ThoughtMapSummary } from "@/lib/runtime-thought-map";

interface TraceSession {
  session_id: string;
  mode: string | null;
  metabolism_mode: string | null;
  drive: string | null;
  project: string | null;
  thread: string | null;
  idea: string | null;
  artifact_id: string | null;
  proposal_id: string | null;
  proposal_type: string | null;
  tokens_used: number | null;
  // Phase 1: medium resolution
  requested_medium: string | null;
  executed_medium: string | null;
  fallback_reason: string | null;
  resolution_source: string | null;
  // Phase 2: capability-fit
  medium_fit: string | null;
  missing_capability: string | null;
  // Phase 3: extension proposals
  extension_classification: string | null;
  confidence_truth: number | null;
  created_at: string;
}

async function fetchRuntimeState() {
  const supabase = getSupabaseServer();
  const [stateRes, traceRes, deliberationRes, continuityRes, timelineRes] = await Promise.all([
    getRuntimeStatePayload(supabase),
    getRuntimeTracePayload(supabase),
    getRuntimeDeliberationPayload(supabase),
    getRuntimeContinuityPayload(supabase),
    getSessionContinuityTimeline(supabase, 40),
  ]);
  const timelinePayload = timelineRes as { rows: SessionTimelineRow[]; clustering_summary: SessionClusteringSummary };
  return {
    state: stateRes as Record<string, unknown> | null,
    traces: traceRes as { sessions: TraceSession[] } | null,
    deliberation: deliberationRes as { trace: unknown } | null,
    continuity: continuityRes as {
      sessions: ContinuitySessionRow[];
      summary: ContinuityAggregateSummary | null;
    } | null,
    sessionTimeline: timelinePayload.rows,
    clusteringSummary: timelinePayload.clustering_summary,
  };
}

export default async function RuntimeDebugPage() {
  const { state, traces, deliberation, continuity, sessionTimeline, clusteringSummary } = await fetchRuntimeState();
  const latestDeliberation = deliberation?.trace ?? null;
  const health = continuity ? buildRuntimeHealthSummary(continuity.sessions ?? []) : null;
  const thoughtMapSummary: ThoughtMapSummary | null =
    sessionTimeline && sessionTimeline.length > 0 && clusteringSummary
      ? deriveThoughtMapSummary(sessionTimeline, clusteringSummary)
      : null;
  /** Stage-2 advisory dry run (observability only — does NOT influence any selector). */
  const advisoryDryRun: TrajectoryAdvisoryLog | null = thoughtMapSummary
    ? deriveTrajectoryAdvisoryDryRun(thoughtMapSummary)
    : null;
  const activeIntent = (state as Record<string, unknown> | null)?.active_intent as {
    target_project_id?: string | null;
    target_thread_id?: string | null;
    intent_kind?: string;
  } | null | undefined;

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
        <>
          <section
            style={{
              marginTop: "1.5rem",
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: "1rem",
              background: "#fafafa",
            }}
          >
            <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Artifact breakdown</h2>
            <p style={{ fontSize: "0.85rem", color: "#555", margin: "0 0 0.5rem" }}>
              Persisted vs approval-worthy: total artifacts, internal (reflection) only, reviewable (queue + approved), and approval candidates.
            </p>
            {(() => {
              const breakdown = (state as Record<string, { total: number; internal: number; reviewable: number; approval_candidates: number } | undefined>).artifact_breakdown;
              if (!breakdown) return null;
              return (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.9rem" }}>
                  <li><strong>Total artifacts:</strong> {breakdown.total}</li>
                  <li><strong>Internal (reflection notes):</strong> {breakdown.internal}</li>
                  <li><strong>Reviewable (queue + approved):</strong> {breakdown.reviewable}</li>
                  <li><strong>Approval candidates:</strong> {breakdown.approval_candidates}</li>
                </ul>
              );
            })()}
            {(() => {
              const hour = (state as Record<string, { sessions: number; total: number; internal: number; reviewable: number; approval_candidates: number } | undefined>).artifact_breakdown_hour;
              if (!hour) return null;
              return (
                <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #ddd" }}>
                  <h3 style={{ fontSize: "0.9rem", margin: "0 0 0.5rem" }}>Last rolling hour</h3>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.9rem" }}>
                    <li><strong>Sessions:</strong> {hour.sessions}</li>
                    <li><strong>Total artifacts:</strong> {hour.total}</li>
                    <li><strong>Internal (reflection notes):</strong> {hour.internal}</li>
                    <li><strong>Reviewable (queue + approved):</strong> {hour.reviewable}</li>
                    <li><strong>Approval candidates:</strong> {hour.approval_candidates}</li>
                  </ul>
                </div>
              );
            })()}
          </section>
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
                  relationship_summary: (state as Record<string, unknown>).relationship_summary,
                  concept_family_summary: (state as Record<string, unknown>).concept_family_summary,
                  trajectory: (state as Record<string, unknown>).trajectory,
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
          {(() => {
            const activeIntent = (state as Record<string, unknown>).active_intent as {
              intent_id: string;
              intent_kind: string;
              target_project_id: string | null;
              target_thread_id: string | null;
              reason_summary: string | null;
              confidence: number | null;
              source_session_id: string | null;
              last_reinforced_session_id: string | null;
            } | null;
            return (
              <section
                style={{
                  marginTop: "1.5rem",
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  padding: "1rem",
                  background: "#fafafa",
                }}
              >
                <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Active session intent</h2>
                <p style={{ fontSize: "0.85rem", color: "#555", margin: "0 0 0.5rem" }}>
                  Continuity layer: what the runtime is currently trying to do next (explore, refine, consolidate, reflect, return). Soft bias only — intent is revisable each session.
                </p>
                {activeIntent ? (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.9rem" }}>
                    <li><strong>Kind:</strong> {activeIntent.intent_kind}</li>
                    {activeIntent.reason_summary && <li><strong>Reason:</strong> {activeIntent.reason_summary}</li>}
                    {activeIntent.confidence != null && <li><strong>Confidence:</strong> {activeIntent.confidence}</li>}
                    {(activeIntent.target_project_id || activeIntent.target_thread_id) && (
                      <li>
                        <strong>Target:</strong>{" "}
                        {activeIntent.target_project_id && <span>project {activeIntent.target_project_id.slice(0, 8)}…</span>}
                        {activeIntent.target_project_id && activeIntent.target_thread_id && " · "}
                        {activeIntent.target_thread_id && <span>thread {activeIntent.target_thread_id.slice(0, 8)}…</span>}
                      </li>
                    )}
                    {activeIntent.last_reinforced_session_id && (
                      <li><strong>Last reinforced:</strong> session {activeIntent.last_reinforced_session_id.slice(0, 8)}…</li>
                    )}
                  </ul>
                ) : (
                  <p style={{ fontSize: "0.9rem", color: "#666" }}>No active intent. Next session will create one from its mode and focus.</p>
                )}
              </section>
            );
          })()}
          <section
            style={{
              marginTop: "1.5rem",
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: "1rem",
              background: "#fafafa",
            }}
          >
            <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Session clustering summary</h2>
            <p style={{ fontSize: "0.85rem", color: "#555", margin: "0 0 0.5rem" }}>
              Lightweight metrics from the same session window as the timeline below. Heuristic only — not a hard rule.
            </p>
            {clusteringSummary && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginBottom: "0.75rem" }}>
                <div>
                  <strong>Thread repeat rate:</strong>{" "}
                  {clusteringSummary.thread_repeat_rate != null
                    ? clusteringSummary.thread_repeat_rate.toFixed(2)
                    : "—"}
                  {clusteringSummary.comparable_pairs > 0 && (
                    <span style={{ fontSize: "0.8rem", color: "#666" }}>
                      {" "}({clusteringSummary.comparable_pairs} pairs)
                    </span>
                  )}
                </div>
                <div>
                  <strong>Unique threads:</strong> {clusteringSummary.unique_thread_count}
                </div>
                <div>
                  <strong>Longest same-thread streak:</strong> {clusteringSummary.longest_same_thread_streak}
                </div>
                {clusteringSummary.interpretation && (
                  <div style={{ width: "100%", fontSize: "0.85rem", color: "#555" }}>
                    <strong>Interpretation (heuristic):</strong> {clusteringSummary.interpretation}{" "}
                    <span style={{ fontStyle: "italic" }}>
                      (&lt;0.2 chaotic · 0.2–0.4 light exploration · 0.4–0.7 healthy clustering · &gt;0.7 possible stickiness)
                    </span>
                  </div>
                )}
                {Object.keys(clusteringSummary.mode_mix).length > 0 && (
                  <div style={{ width: "100%" }}>
                    <strong>Mode mix:</strong>{" "}
                    {Object.entries(clusteringSummary.mode_mix)
                      .sort((a, b) => b[1] - a[1])
                      .map(([mode, count]) => `${mode}: ${count}`)
                      .join(" · ")}
                  </div>
                )}
              </div>
            )}
          </section>
          {thoughtMapSummary && (
            <section
              style={{
                marginTop: "1rem",
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: "1rem",
                background: "#f5f9f5",
              }}
            >
              <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Session thought map</h2>
              <p style={{ fontSize: "0.85rem", color: "#555", margin: "0 0 0.75rem" }}>
                Interpreted summary of recent trajectory (observability only — does not feed any selector). Per governance: Stage 1.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", fontSize: "0.9rem" }}>
                <div>
                  <strong>Session posture:</strong>{" "}
                  <span
                    style={{
                      padding: "0.1rem 0.4rem",
                      borderRadius: 4,
                      background:
                        thoughtMapSummary.session_posture === "exploratory"
                          ? "#e8f4e8"
                          : thoughtMapSummary.session_posture === "consolidating"
                            ? "#e8eef8"
                            : thoughtMapSummary.session_posture === "reflective"
                              ? "#f0e8f8"
                              : "#f0f0f0",
                    }}
                  >
                    {thoughtMapSummary.session_posture}
                  </span>
                </div>
                <div>
                  <strong>Thread repeat rate:</strong>{" "}
                  {thoughtMapSummary.thread_repeat_rate != null
                    ? thoughtMapSummary.thread_repeat_rate.toFixed(2)
                    : "—"}
                </div>
                <div>
                  <strong>Longest thread streak:</strong> {thoughtMapSummary.longest_thread_streak}
                </div>
                <div>
                  <strong>Trajectory shape:</strong> {thoughtMapSummary.trajectory_shape}
                </div>
                <div>
                  <strong>Exploration vs consolidation:</strong> {thoughtMapSummary.exploration_vs_consolidation}
                </div>
                <div>
                  <strong>Interpretation confidence:</strong>{" "}
                  <span
                    style={{
                      color:
                        thoughtMapSummary.interpretation_confidence === "high"
                          ? "#282"
                          : thoughtMapSummary.interpretation_confidence === "medium"
                            ? "#666"
                            : "#888",
                    }}
                  >
                    {thoughtMapSummary.interpretation_confidence}
                  </span>
                  {" "}(&lt;5 low · 5–10 medium · &gt;10 high)
                </div>
                <div>
                  <strong>Window sessions:</strong> {thoughtMapSummary.window_sessions}
                </div>
                <div style={{ width: "100%" }}>
                  <strong>Proposal activity (last 10 sessions):</strong>{" "}
                  {thoughtMapSummary.proposal_activity_summary.proposals_last_10_sessions} proposals
                  {thoughtMapSummary.proposal_activity_summary.acceptance_rate != null
                    ? ` · acceptance rate ${(thoughtMapSummary.proposal_activity_summary.acceptance_rate * 100).toFixed(0)}%`
                    : ""}
                </div>
              </div>
            </section>
          )}
          {advisoryDryRun && (
            <section
              style={{
                marginTop: "1rem",
                border: "1px solid #c8e0c8",
                borderRadius: 8,
                padding: "1rem",
                background: "#f0f7f0",
              }}
            >
              <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>
                Stage-2 trajectory adapter{" "}
                <span
                  style={{
                    display: "inline-block",
                    padding: "0.1rem 0.4rem",
                    borderRadius: 4,
                    fontSize: "0.7rem",
                    background: "#d4edda",
                    color: "#155724",
                    fontWeight: 600,
                    verticalAlign: "middle",
                  }}
                >
                  DRY RUN
                </span>
              </h2>
              <p style={{ fontSize: "0.85rem", color: "#555", margin: "0 0 0.75rem" }}>
                Advisory output from the trajectory feedback adapter (observability only). This output does{" "}
                <strong>not</strong> influence any selection path. Stage-1 contract is preserved.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1.5rem", fontSize: "0.9rem" }}>
                <span>
                  <strong>Reduce repetition:</strong>{" "}
                  <span
                    style={{
                      color: advisoryDryRun.feedback.gently_reduce_repetition ? "#a60" : "#555",
                      fontWeight: advisoryDryRun.feedback.gently_reduce_repetition ? 600 : 400,
                    }}
                  >
                    {advisoryDryRun.feedback.gently_reduce_repetition ? "yes" : "no"}
                  </span>
                </span>
                <span>
                  <strong>Favor consolidation:</strong>{" "}
                  <span
                    style={{
                      color: advisoryDryRun.feedback.favor_consolidation !== "none" ? "#228" : "#555",
                      fontWeight: advisoryDryRun.feedback.favor_consolidation !== "none" ? 600 : 400,
                    }}
                  >
                    {advisoryDryRun.feedback.favor_consolidation}
                  </span>
                </span>
                <span>
                  <strong>Proposal pressure adjustment:</strong>{" "}
                  {advisoryDryRun.feedback.proposal_pressure_adjustment > 0 ? "+" : ""}
                  {advisoryDryRun.feedback.proposal_pressure_adjustment}
                </span>
              </div>
              <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "#444" }}>
                <strong>Reason:</strong> {advisoryDryRun.feedback.reason}
              </div>
              <div style={{ marginTop: "0.35rem", fontSize: "0.75rem", color: "#888", fontStyle: "italic" }}>
                {advisoryDryRun.note}
              </div>
            </section>
          )}
          <section
            style={{
              marginTop: "1rem",
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: "1rem",
              background: "#fafafa",
            }}
          >
            <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Session selection evidence</h2>
            <p style={{ fontSize: "0.85rem", color: "#555", margin: "0 0 0.75rem" }}>
              Selection Evidence Ledger for the most recent sessions (observability only). Decision, mode, drive, selection source, and which signals were present vs used.
            </p>
            {sessionTimeline && sessionTimeline.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {sessionTimeline.slice(0, 10).map((s) => {
                  const ev = s.selection_evidence;
                  if (!ev) {
                    return (
                      <div
                        key={s.session_id}
                        style={{
                          padding: "0.5rem 0.75rem",
                          background: "#f0f0f0",
                          borderRadius: 6,
                          fontSize: "0.85rem",
                          color: "#666",
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {new Date(s.created_at).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {" — "}
                        No selection evidence (legacy session or minimal trace).
                      </div>
                    );
                  }
                  return (
                    <div
                      key={s.session_id}
                      style={{
                        padding: "0.5rem 0.75rem",
                        background: "#fff",
                        border: "1px solid #eee",
                        borderRadius: 6,
                        fontSize: "0.85rem",
                      }}
                    >
                      <div style={{ marginBottom: "0.35rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontWeight: 600, color: "#333" }}>
                          {new Date(s.created_at).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {ev.trace_kind && (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "0.1rem 0.35rem",
                              borderRadius: 4,
                              fontSize: "0.7rem",
                              background: ev.trace_kind === "full" ? "#e8f4e8" : "#f0f0f0",
                              color: ev.trace_kind === "full" ? "#282" : "#666",
                            }}
                            title={ev.trace_kind === "full" ? "Full trace: session produced an artifact and critique" : "Minimal trace: no-artifact session"}
                          >
                            {ev.trace_kind}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem" }}>
                        <span><strong>Decision:</strong> {ev.decision_summary ?? "—"}</span>
                        <span><strong>Mode:</strong> {ev.selected_mode ?? "—"}</span>
                        <span><strong>Drive:</strong> {ev.selected_drive ?? "—"}</span>
                        <span><strong>Selection source:</strong> {ev.selection_source ?? "—"}</span>
                        <span><strong>Selected thread:</strong> {ev.selected_thread_id ? `${String(ev.selected_thread_id).slice(0, 8)}…` : "—"}</span>
                      </div>
                      <div style={{ marginTop: "0.35rem", color: "#555" }}>
                        <strong>Signals present:</strong> {ev.signals_present.length > 0 ? ev.signals_present.join(", ") : "—"}
                      </div>
                      <div style={{ color: "#555" }}>
                        <strong>Signals used:</strong> {ev.signals_used.length > 0 ? ev.signals_used.join(", ") : "—"}
                      </div>
                      {(s.proposal_outcome != null || s.governance_evidence != null) && (
                        <div style={{ marginTop: "0.35rem", color: "#444", borderTop: "1px solid #eee", paddingTop: "0.35rem" }}>
                          <strong>Proposal outcome:</strong> {s.proposal_outcome ?? "—"}
                          {s.governance_evidence && (
                            <span style={{ marginLeft: "0.5rem" }}>
                              · <strong>Governance:</strong> {s.governance_evidence.lane_type}
                              {s.governance_evidence.reason_codes.length > 0 && (
                                <> (codes: {s.governance_evidence.reason_codes.join(", ")})</>
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: "0.9rem", color: "#666" }}>No session timeline data yet. Run sessions to see selection evidence.</p>
            )}
          </section>
          <section
            style={{
              marginTop: "1rem",
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: "1rem",
              background: "#fafafa",
            }}
          >
            <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Session continuity timeline</h2>
            <p style={{ fontSize: "0.85rem", color: "#555", margin: "0 0 0.75rem" }}>
              Last 40 sessions: mode, drive, focus (project/thread), confidence, trajectory outcome. Use this to see clustering, intent persistence, reflect recovery, and drift.
            </p>
            {sessionTimeline && sessionTimeline.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
                      <th style={{ padding: "0.35rem 0.5rem", whiteSpace: "nowrap" }}>Date</th>
                      <th style={{ padding: "0.35rem 0.5rem" }}>Transition</th>
                      <th style={{ padding: "0.35rem 0.5rem" }}>Mode</th>
                      <th style={{ padding: "0.35rem 0.5rem" }}>Drive</th>
                      <th style={{ padding: "0.35rem 0.5rem", maxWidth: 120 }}>Project</th>
                      <th style={{ padding: "0.35rem 0.5rem", maxWidth: 120 }}>Thread</th>
                      <th style={{ padding: "0.35rem 0.5rem" }}>Conf</th>
                      <th style={{ padding: "0.35rem 0.5rem" }}>Outcome</th>
                      <th style={{ padding: "0.35rem 0.5rem", maxWidth: 140 }}>Proposal</th>
                      <th style={{ padding: "0.35rem 0.5rem" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionTimeline.map((s) => {
                      const intentMatch =
                        activeIntent &&
                        ((activeIntent.target_project_id && activeIntent.target_project_id === s.project_id) ||
                          (activeIntent.target_thread_id && activeIntent.target_thread_id === s.thread_id));
                      return (
                        <tr key={s.session_id} style={{ borderBottom: "1px solid #eee" }}>
                          <td style={{ padding: "0.35rem 0.5rem", whiteSpace: "nowrap" }}>
                            {new Date(s.created_at).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td style={{ padding: "0.35rem 0.5rem" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "0.1rem 0.35rem",
                                borderRadius: 4,
                                fontSize: "0.7rem",
                                background:
                                  s.thread_transition === "same-thread"
                                    ? "#e0f0e0"
                                    : s.thread_transition === "thread-switch"
                                      ? "#ffe8cc"
                                      : "#f0f0f0",
                                color:
                                  s.thread_transition === "same-thread"
                                    ? "#282"
                                    : s.thread_transition === "thread-switch"
                                      ? "#a60"
                                      : "#666",
                              }}
                              title={
                                s.thread_transition === "same-thread"
                                  ? "Same thread as next (older) session"
                                  : s.thread_transition === "thread-switch"
                                    ? "Switched thread vs next (older) session"
                                    : "No comparable thread (missing or last in window)"
                              }
                            >
                              {s.thread_transition === "same-thread"
                                ? "same"
                                : s.thread_transition === "thread-switch"
                                  ? "switch"
                                  : "—"}
                            </span>
                            {s.thread_streak_length > 0 && (
                              <span style={{ marginLeft: "0.25rem", fontSize: "0.7rem", color: "#666" }}>
                                ×{s.thread_streak_length}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "0.35rem 0.5rem" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "0.1rem 0.35rem",
                                borderRadius: 4,
                                background: s.mode === "reflect" ? "#f0e6ff" : s.mode === "return" ? "#e6f3ff" : "#eee",
                                fontSize: "0.75rem",
                              }}
                            >
                              {s.mode ?? "—"}
                            </span>
                          </td>
                          <td style={{ padding: "0.35rem 0.5rem" }}>{s.drive ?? "—"}</td>
                          <td style={{ padding: "0.35rem 0.5rem", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }} title={s.project_name ?? s.project_id ?? ""}>
                            {s.project_name || (s.project_id ? `${String(s.project_id).slice(0, 8)}…` : "—")}
                          </td>
                          <td style={{ padding: "0.35rem 0.5rem", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }} title={s.thread_name ?? s.thread_id ?? ""}>
                            {s.thread_name || (s.thread_id ? `${String(s.thread_id).slice(0, 8)}…` : "—")}
                          </td>
                          <td style={{ padding: "0.35rem 0.5rem" }}>
                            {s.confidence != null ? Number(s.confidence).toFixed(2) : "—"}
                          </td>
                          <td style={{ padding: "0.35rem 0.5rem" }}>
                            {s.outcome_kind ? (
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  color: s.outcome_kind === "repetition_without_movement" || s.outcome_kind === "low_signal_continuation" ? "#b33" : "#555",
                                }}
                              >
                                {s.outcome_kind}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td style={{ padding: "0.35rem 0.5rem", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }} title={s.proposal_outcome ?? undefined}>
                            {s.proposal_outcome ? (
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  color: s.proposal_outcome === "created" || s.proposal_outcome === "updated" ? "#282" : "#666",
                                }}
                              >
                                {s.proposal_outcome}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td style={{ padding: "0.35rem 0.5rem" }}>
                            {!s.has_artifact && <span style={{ marginRight: "0.35rem", fontSize: "0.7rem", color: "#888" }}>no-artifact</span>}
                            {s.proposal_created && <span style={{ marginRight: "0.35rem", fontSize: "0.7rem", color: "#282" }}>proposal</span>}
                            {intentMatch && <span style={{ fontSize: "0.7rem", color: "#228" }}>intent</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ fontSize: "0.9rem", color: "#666" }}>No session timeline data yet. Run sessions to see continuity.</p>
            )}
          </section>
          <section
            style={{
              marginTop: "1.5rem",
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: "1rem",
              background: "#fafafa",
            }}
          >
            <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Style profile</h2>
            <p style={{ fontSize: "0.85rem", color: "#555", margin: "0 0 0.5rem" }}>
              Derived from recent artifact and proposal titles/summaries using a small lexical style lexicon.
            </p>
            {(() => {
              const styleProfile = (state as Record<string, { dominant: string[]; emerging: string[]; suppressed: string[]; pressure: string } | undefined>).style_profile;
              const pressureExplanation = (state as Record<string, string | undefined>).style_profile_pressure_explanation;
              const repeated = (state as Record<string, string[] | undefined>).style_profile_repeated_titles;
              if (!styleProfile) return null;
              return (
                <div style={{ fontSize: "0.9rem" }}>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    <li><strong>Dominant:</strong> {styleProfile.dominant.length > 0 ? styleProfile.dominant.join(", ") : "—"}</li>
                    <li><strong>Emerging:</strong> {styleProfile.emerging.length > 0 ? styleProfile.emerging.join(", ") : "—"}</li>
                    <li><strong>Suppressed:</strong> {styleProfile.suppressed.length > 0 ? styleProfile.suppressed.join(", ") : "—"}</li>
                    <li><strong>Pressure:</strong> {styleProfile.pressure}</li>
                  </ul>
                  {pressureExplanation && (
                    <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: "#555" }}>
                      {pressureExplanation}
                    </p>
                  )}
                  {repeated && repeated.length > 0 && (
                    <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", color: "#555" }}>
                      Repeated recent titles (soft penalty):{" "}
                      {repeated.slice(0, 5).map((t, idx) => (
                        <span key={idx}>
                          {idx > 0 ? ", " : ""}
                          “{t}”
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              );
            })()}
          </section>
        </>
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
                  {s.metabolism_mode != null && (
                    <span style={{ fontWeight: 400, color: "#888", marginLeft: "0.5rem" }}>
                      [{s.metabolism_mode}]
                    </span>
                  )}
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
                {(s.requested_medium != null || s.executed_medium != null || s.fallback_reason != null || s.resolution_source != null || s.medium_fit != null || s.missing_capability != null || s.extension_classification != null || s.confidence_truth != null) && (
                  <div style={{ marginTop: "0.25rem", fontSize: "0.8rem", color: "#555" }}>
                    {s.requested_medium != null && (
                      <span style={{ marginRight: "0.5rem" }}>req: {s.requested_medium}</span>
                    )}
                    {s.executed_medium != null && (
                      <span style={{ marginRight: "0.5rem" }}>exec: {s.executed_medium}</span>
                    )}
                    {s.fallback_reason != null && (
                      <span style={{ marginRight: "0.5rem" }}>fallback: {s.fallback_reason}</span>
                    )}
                    {s.resolution_source != null && (
                      <span style={{ marginRight: "0.5rem" }}>src: {s.resolution_source}</span>
                    )}
                    {s.medium_fit != null && (
                      <span style={{ marginRight: "0.5rem" }}>fit: {s.medium_fit}</span>
                    )}
                    {s.missing_capability != null && (
                      <span style={{ marginRight: "0.5rem" }}>missing: {s.missing_capability}</span>
                    )}
                    {s.extension_classification != null && (
                      <span style={{ marginRight: "0.5rem" }}>ext: {s.extension_classification}</span>
                    )}
                    {s.confidence_truth != null && (
                      <span>conf: {s.confidence_truth}</span>
                    )}
                  </div>
                )}
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
