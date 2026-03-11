import type { ContinuitySessionRow, ContinuityAggregateSummary } from "@/lib/runtime-continuity";

interface ContinuityHistoryProps {
  sessions: ContinuitySessionRow[];
  summary: ContinuityAggregateSummary | null;
}

function renderCounts(title: string, counts: Record<string, number>) {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return (
      <div style={{ fontSize: "0.85rem", color: "#666" }}>
        <strong>{title}</strong>: —
      </div>
    );
  }
  return (
    <div style={{ fontSize: "0.85rem", color: "#444" }}>
      <strong>{title}</strong>:{" "}
      {entries
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ")}
    </div>
  );
}

export function ContinuityHistory({ sessions, summary }: ContinuityHistoryProps) {
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
      <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Recent sessions (ontology continuity)</h2>
      <p style={{ fontSize: "0.8rem", color: "#666", margin: "0 0 0.75rem" }}>
        Last {sessions.length} sessions, newest first. This is a visibility layer only; it does not change governance or
        behavior.
      </p>

      {summary && (
        <div style={{ marginBottom: "0.75rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          {renderCounts("Narrative states", summary.narrative_counts)}
          {renderCounts("Action kinds", summary.action_counts)}
          {renderCounts("Tensions", summary.tension_counts)}
          <div style={{ fontSize: "0.85rem", color: "#444" }}>
            <strong>Average confidence</strong>:{" "}
            {summary.average_confidence != null ? summary.average_confidence.toFixed(2) : "—"}
          </div>
          <div style={{ fontSize: "0.85rem", color: "#444" }}>
            <strong>Sessions with proposals</strong>: {summary.proposal_session_count} / {summary.total_sessions}
          </div>
        </div>
      )}

      {sessions.length === 0 && (
        <p style={{ fontSize: "0.85rem", color: "#666", margin: 0 }}>
          <em>No recent sessions found.</em>
        </p>
      )}

      {sessions.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {sessions.map((s) => (
            <li
              key={s.session_id}
              style={{
                borderTop: "1px solid #eee",
                padding: "0.5rem 0",
                fontSize: "0.8rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                <div style={{ fontWeight: 600 }}>
                  {new Date(s.created_at).toLocaleString()}
                </div>
                <div style={{ color: "#666" }}>
                  {s.session_mode ?? "—"} · {s.selected_drive ?? "—"} · {s.selection_source ?? "—"}
                </div>
              </div>
              <div style={{ marginTop: "0.25rem", color: "#444" }}>{s.summary_line}</div>
              <div style={{ marginTop: "0.25rem", color: "#444" }}>
                <strong>Posture</strong>: {s.narrative_state ?? "—"} ·{" "}
                <strong>Action</strong>: {s.action_kind ?? "—"} ·{" "}
                <strong>Confidence</strong>: {s.confidence_band ?? "—"}
                {s.confidence != null && (
                  <span style={{ color: "#666" }}> ({s.confidence.toFixed(2)})</span>
                )}
              </div>
              <div style={{ marginTop: "0.25rem", color: "#444" }}>
                <strong>Focus reason</strong>: {s.selection_reason ?? "—"}
              </div>
              <div style={{ marginTop: "0.25rem", color: "#444" }}>
                <strong>Tensions</strong>: {s.tension_kinds.length ? s.tension_kinds.join(", ") : "—"}
              </div>
              <div style={{ marginTop: "0.25rem", color: "#444" }}>
                <strong>Evidence kinds</strong>: {s.evidence_kinds.length ? s.evidence_kinds.join(", ") : "—"}
              </div>
              <div style={{ marginTop: "0.25rem", color: "#444" }}>
                <strong>Proposals</strong>:{" "}
                {s.proposal_created
                  ? `${s.proposal_type ?? "proposal"} ${s.proposal_role ? `(${s.proposal_role})` : ""}`
                  : "none"}
              </div>
              <div style={{ marginTop: "0.25rem", color: "#444" }}>
                <strong>Artifact role</strong>: {s.artifact_role ?? "—"}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

