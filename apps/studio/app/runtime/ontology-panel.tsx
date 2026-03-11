interface OntologySummaryProps {
  trace: {
    observations_json: Record<string, unknown> | null;
    tensions_json: Record<string, unknown> | null;
    hypotheses_json: Record<string, unknown> | null;
    evidence_checked_json: Record<string, unknown> | null;
    confidence: number | null;
  } | null;
}

function buildSummaryLine(trace: OntologySummaryProps["trace"]): string {
  if (!trace) return "No recent session summary available yet.";
  const obs = (trace.observations_json ?? {}) as Record<string, unknown>;
  const tens = (trace.tensions_json ?? {}) as Record<string, unknown>;
  const hyp = (trace.hypotheses_json ?? {}) as Record<string, unknown>;
  const ev = (trace.evidence_checked_json ?? {}) as Record<string, unknown>;

  const narrativeState = (obs.narrative_state as string) ?? "unknown posture";
  const tensionKinds = (tens.tension_kinds as unknown[]) ?? [];
  const actionKind = (hyp.action_kind as string) ?? "an action";
  const confidenceBand = (hyp.confidence_band as string) ?? "unknown";
  const evidenceKinds = (ev.evidence_kinds as unknown[]) ?? [];

  const tensionPart =
    Array.isArray(tensionKinds) && tensionKinds.length > 0
      ? `saw ${tensionKinds.join(" and ")}`
      : "saw no major named tensions";

  const evidencePart =
    Array.isArray(evidenceKinds) && evidenceKinds.length > 0
      ? `relied on ${evidenceKinds.join(" and ")}`
      : "relied on internal creative state";

  return `Twin stayed in ${narrativeState}, ${tensionPart}, and chose ${actionKind} with ${confidenceBand} confidence while it ${evidencePart}.`;
}

function readableList(values: unknown[] | undefined | null): string {
  if (!values || !Array.isArray(values) || values.length === 0) return "—";
  return values.join(", ");
}

export function OntologyPanel({ trace }: OntologySummaryProps) {
  const obs = (trace?.observations_json ?? {}) as Record<string, unknown>;
  const tens = (trace?.tensions_json ?? {}) as Record<string, unknown>;
  const hyp = (trace?.hypotheses_json ?? {}) as Record<string, unknown>;
  const ev = (trace?.evidence_checked_json ?? {}) as Record<string, unknown>;

  const sessionMode = (obs.session_mode as string) ?? "—";
  const selectedDrive = (obs.selected_drive as string) ?? "—";
  const selectionSource = (obs.selection_source as string) ?? "—";
  const narrativeState = (obs.narrative_state as string) ?? "—";

  const tensionKinds = (tens.tension_kinds as unknown[]) ?? [];
  const actionKind = (hyp.action_kind as string) ?? "—";
  const confidenceBand = (hyp.confidence_band as string) ?? "—";
  const selectionReason = (hyp.selection_reason as string) ?? "—";

  const evidenceKinds = (ev.evidence_kinds as unknown[]) ?? [];

  const confidenceNumeric =
    trace?.confidence != null && Number.isFinite(trace.confidence)
      ? (trace.confidence as number)
      : null;

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
      <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Ontology summary (latest session)</h2>
      {!trace && (
        <p style={{ fontSize: "0.85rem", color: "#666", margin: 0 }}>
          <em>No deliberation_trace rows yet. Run a session to see ontology signals.</em>
        </p>
      )}
      {trace && (
        <>
          <p style={{ fontSize: "0.85rem", color: "#444", margin: "0 0 0.5rem" }}>
            {buildSummaryLine(trace)}
          </p>
          <div style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <div>
              <strong>Narrative posture</strong>: {narrativeState}
            </div>
            <div>
              <strong>Main tensions</strong>: {readableList(tensionKinds)}
            </div>
            <div>
              <strong>Chosen action kind</strong>: {actionKind}
            </div>
            <div>
              <strong>Confidence</strong>:{" "}
              {confidenceBand}{" "}
              {confidenceNumeric != null && (
                <span style={{ color: "#666" }}>({confidenceNumeric.toFixed(2)})</span>
              )}
            </div>
            <div>
              <strong>Focus reason</strong>: {selectionReason}
            </div>
            <div>
              <strong>Session mode</strong>: {sessionMode} · <strong>Drive</strong>: {selectedDrive} ·{" "}
              <strong>Source</strong>: {selectionSource}
            </div>
            <div>
              <strong>Evidence kinds</strong>: {readableList(evidenceKinds)}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

