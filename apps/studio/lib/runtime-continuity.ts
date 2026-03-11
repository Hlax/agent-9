import { classifyConfidenceBand } from "./ontology-helpers";

export interface ContinuitySessionRow {
  session_id: string;
  created_at: string;
  session_mode: string | null;
  selected_drive: string | null;
  selection_source: string | null;
  narrative_state: string | null;
  action_kind: string | null;
  confidence_band: string | null;
  confidence: number | null;
  selection_reason: string | null;
  tension_kinds: string[];
  evidence_kinds: string[];
  proposal_created: boolean;
  proposal_type: string | null;
  proposal_role: string | null;
  artifact_role: string | null;
  summary_line: string;
}

export interface ContinuityAggregateSummary {
  narrative_counts: Record<string, number>;
  action_counts: Record<string, number>;
  tension_counts: Record<string, number>;
  average_confidence: number | null;
  proposal_session_count: number;
  total_sessions: number;
}

interface RawSessionRow {
  session_id: string;
  created_at: string;
  trace: Record<string, unknown> | null;
  decision_summary: Record<string, unknown> | null;
}

interface RawDeliberationRow {
  session_id: string;
  observations_json: Record<string, unknown> | null;
  tensions_json: Record<string, unknown> | null;
  hypotheses_json: Record<string, unknown> | null;
  evidence_checked_json: Record<string, unknown> | null;
  confidence: number | null;
  created_at: string;
}

interface RawProposalRow {
  proposal_record_id: string;
  proposal_role: string | null;
}

interface RawArtifactRow {
  artifact_id: string;
  artifact_role: string | null;
}

export function buildContinuityRows(input: {
  sessions: RawSessionRow[];
  traces: RawDeliberationRow[];
  proposals: RawProposalRow[];
  artifacts: RawArtifactRow[];
}): ContinuitySessionRow[] {
  const traceBySession = new Map<string, RawDeliberationRow>();
  for (const t of input.traces ?? []) {
    const existing = traceBySession.get(t.session_id);
    if (!existing || existing.created_at < t.created_at) {
      traceBySession.set(t.session_id, t);
    }
  }

  const proposalById = new Map<string, RawProposalRow>();
  for (const p of input.proposals ?? []) {
    proposalById.set(p.proposal_record_id, p);
  }

  const artifactById = new Map<string, RawArtifactRow>();
  for (const a of input.artifacts ?? []) {
    artifactById.set(a.artifact_id, a);
  }

  return (input.sessions ?? []).map((row) => {
    const t = (row.trace ?? {}) as Record<string, unknown>;
    const d = (row.decision_summary ?? {}) as Record<string, unknown>;
    const delib = traceBySession.get(row.session_id);
    const obs = (delib?.observations_json ?? {}) as Record<string, unknown>;
    const tens = (delib?.tensions_json ?? {}) as Record<string, unknown>;
    const hyp = (delib?.hypotheses_json ?? {}) as Record<string, unknown>;
    const ev = (delib?.evidence_checked_json ?? {}) as Record<string, unknown>;

    const artifactId = (t.artifact_id as string) ?? null;
    const proposalId = (t.proposal_id as string) ?? null;
    const proposalRole = proposalId ? proposalById.get(proposalId)?.proposal_role ?? null : null;
    const artifactRole = artifactId ? artifactById.get(artifactId)?.artifact_role ?? null : null;

    const narrative_state = (obs.narrative_state as string) ?? null;
    const action_kind = (hyp.action_kind as string) ?? null;
    const confidence =
      delib && typeof delib.confidence === "number" && Number.isFinite(delib.confidence)
        ? (delib.confidence as number)
        : ((d.confidence as number) ?? null);
    // Prefer stored confidence_band; fall back to deriving it from numeric confidence
    // so older sessions without a stored band still get a consistent label.
    const confidence_band = (hyp.confidence_band as string) ?? classifyConfidenceBand(confidence);
    const selection_reason = (hyp.selection_reason as string) ?? null;

    const tension_kinds = Array.isArray(tens.tension_kinds)
      ? (tens.tension_kinds as string[])
      : [];
    const evidence_kinds = Array.isArray(ev.evidence_kinds)
      ? (ev.evidence_kinds as string[])
      : [];

    const session_mode = (obs.session_mode as string) ?? null;
    const selected_drive = (obs.selected_drive as string) ?? ((t.drive as string) ?? null);
    const selection_source = (obs.selection_source as string) ?? null;

    const summary_line = buildSummaryLineFromParts({
      narrative_state,
      tension_kinds,
      action_kind,
      confidence_band,
      evidence_kinds,
    });

    return {
      session_id: row.session_id,
      created_at: row.created_at,
      session_mode,
      selected_drive,
      selection_source,
      narrative_state,
      action_kind,
      confidence_band,
      confidence: confidence ?? null,
      selection_reason,
      tension_kinds,
      evidence_kinds,
      proposal_created: Boolean(proposalId),
      proposal_type: (t.proposal_type as string) ?? null,
      proposal_role: proposalRole,
      artifact_role: artifactRole,
      summary_line,
    };
  });
}

export function buildContinuityAggregate(rows: ContinuitySessionRow[]): ContinuityAggregateSummary {
  const narrative_counts: Record<string, number> = {};
  const action_counts: Record<string, number> = {};
  const tension_counts: Record<string, number> = {};

  let sumConfidence = 0;
  let countConfidence = 0;
  let proposalSessions = 0;

  for (const row of rows) {
    if (row.narrative_state) {
      narrative_counts[row.narrative_state] = (narrative_counts[row.narrative_state] ?? 0) + 1;
    }
    if (row.action_kind) {
      action_counts[row.action_kind] = (action_counts[row.action_kind] ?? 0) + 1;
    }
    for (const t of row.tension_kinds ?? []) {
      if (!t) continue;
      tension_counts[t] = (tension_counts[t] ?? 0) + 1;
    }
    if (row.confidence != null && Number.isFinite(row.confidence)) {
      sumConfidence += row.confidence;
      countConfidence += 1;
    }
    if (row.proposal_created) {
      proposalSessions += 1;
    }
  }

  return {
    narrative_counts,
    action_counts,
    tension_counts,
    average_confidence: countConfidence > 0 ? sumConfidence / countConfidence : null,
    proposal_session_count: proposalSessions,
    total_sessions: rows.length,
  };
}

export function buildSummaryLineFromParts(input: {
  narrative_state: string | null;
  tension_kinds: string[];
  action_kind: string | null;
  confidence_band: string | null;
  evidence_kinds: string[];
}): string {
  const narrative = input.narrative_state || "unknown posture";
  const tensionKinds = input.tension_kinds ?? [];
  const actionKind = input.action_kind || "an action";
  const confidenceBand = input.confidence_band || "unknown";
  const evidenceKinds = input.evidence_kinds ?? [];

  const tensionPart =
    Array.isArray(tensionKinds) && tensionKinds.length > 0
      ? `saw ${tensionKinds.join(" and ")}`
      : "saw no major named tensions";

  const evidencePart =
    Array.isArray(evidenceKinds) && evidenceKinds.length > 0
      ? `relied on ${evidenceKinds.join(" and ")}`
      : "relied on internal creative state";

  return `Twin stayed in ${narrative}, ${tensionPart}, and chose ${actionKind} with ${confidenceBand} confidence while it ${evidencePart}.`;
}

