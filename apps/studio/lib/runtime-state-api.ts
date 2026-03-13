/**
 * Shared runtime API payload builders. Used by GET /api/runtime/* routes and by
 * server-rendered pages (e.g. runtime debug page) to avoid server-side fetch of
 * relative URLs, which causes ERR_INVALID_URL in production.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRuntimeConfig, getSessionsRunInLastHour } from "@/lib/runtime-config";
import { getSynthesisPressure, computeSynthesisPressure } from "@/lib/synthesis-pressure";
import { buildContinuityRows, buildContinuityAggregate } from "@/lib/runtime-continuity";
import { getActiveIntent } from "@/lib/session-intent";
import { computeStyleProfile, type StyleAnalysisInput } from "@/lib/style-profile";
import { PLATFORM_DEFAULT_TWIN_SEED } from "@/lib/twin-seed-config";
import { deriveRuntimeTrajectory, type RuntimeRelationshipSummary } from "@/lib/runtime-trajectory";
import {
  evaluateProposalRelationship,
  type ProposalForRelationship,
  type ProposalRelationshipKind,
} from "@/lib/proposal-relationship";
import { buildConceptFamilies, type ConceptFamilyRuntimeSummary } from "@/lib/proposal-families";
import {
  buildAdvisoryLog,
  type TrajectoryAdvisoryLog,
  type TrajectoryFeedbackContext,
} from "@/lib/trajectory-feedback-adapter";
import type { ThoughtMapSummary } from "@/lib/runtime-thought-map";

export async function getRuntimeStatePayload(supabase: SupabaseClient | null) {
  if (!supabase) {
    const emptySynthesisPressure = computeSynthesisPressure({
      recurrence_pull_signal: 0.5,
      unfinished_pull_signal: 0,
      archive_candidate_pressure: 0,
      return_success_trend: 0.5,
      repetition_without_movement_penalty: 0,
      momentum: 0.5,
    });
    return {
      snapshot: null,
      backlog: { artifacts: {} as Record<string, number>, proposals: {} as Record<string, number> },
      artifact_breakdown: { total: 0, internal: 0, reviewable: 0, approval_candidates: 0 },
      artifact_breakdown_hour: { sessions: 0, total: 0, internal: 0, reviewable: 0, approval_candidates: 0 },
      style_profile: { dominant: [], emerging: [], suppressed: [], pressure: "coherent" as const },
      style_profile_pressure_explanation: "Runtime offline; no style signals available.",
      style_profile_repeated_titles: [] as string[],
      runtime: { mode: "default", always_on: false, tokens_used_today: 0, last_run_at: null },
      return_candidates: 0,
      creative_state: null,
      active_project: null,
      active_thread: null,
      synthesis_pressure: emptySynthesisPressure,
      trajectory: deriveRuntimeTrajectory({
        seed: PLATFORM_DEFAULT_TWIN_SEED,
        styleProfile: { dominant: [], emerging: [], suppressed: [], pressure: "coherent" },
        stylePressureExplanation: "Runtime offline; no style signals available.",
        repeatedTitles: [],
        backlogArtifacts: { total: 0, reviewable: 0, approval_candidates: 0 },
        synthesisPressure: emptySynthesisPressure,
      }),
      seed_config: PLATFORM_DEFAULT_TWIN_SEED,
      active_intent: null,
    };
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const styleWindowSize = 40;
  const relationshipWindowSize = 40;

  const [
    stateRes,
    artifactBacklogRes,
    artifactHourRes,
    proposalBacklogRes,
    styleArtifactsRes,
    styleProposalsRes,
    archiveCountRes,
    runtimeConfig,
    latestSessionRes,
    synthesisPressurePayload,
    sessionsLastHour,
    recentProposalsRes,
    activeIntent,
  ] =
    await Promise.all([
      supabase
        .from("creative_state_snapshot")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("artifact")
        .select("medium, artifact_role, current_approval_state", { count: "exact", head: false }),
      supabase
        .from("artifact")
        .select("medium, artifact_role, current_approval_state", { count: "exact", head: false })
        .gte("created_at", oneHourAgo),
      supabase
        .from("proposal_record")
        .select("proposal_role, proposal_state, lane_type, target_surface", {
          count: "exact",
          head: false,
        }),
      supabase
        .from("artifact")
        .select("title, summary, content_text")
        .order("created_at", { ascending: false })
        .limit(styleWindowSize),
      supabase
        .from("proposal_record")
        .select("title, summary")
        .order("created_at", { ascending: false })
        .limit(styleWindowSize),
      supabase.from("archive_entry").select("archive_entry_id", { count: "exact", head: true }),
      getRuntimeConfig(supabase),
      supabase
        .from("creative_session")
        .select("trace")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getSynthesisPressure(supabase),
      getSessionsRunInLastHour(supabase),
      supabase
        .from("proposal_record")
        .select(
          "proposal_record_id, title, summary, habitat_payload_json, target_surface, proposal_role, target_type, lane_type, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(relationshipWindowSize),
      getActiveIntent(supabase),
    ]);

  const { data: snapshot, error: stateError } = stateRes;

  const artifactRows = artifactBacklogRes.data ?? [];

  const artifactBacklog = artifactRows.reduce(
    (acc: Record<string, number>, row: Record<string, unknown>) => {
      const role = (row.artifact_role as string) ?? "none";
      const key = `${row.current_approval_state ?? "none"}__${role}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const REVIEWABLE_STATES = ["pending_review", "needs_revision", "approved", "approved_for_publication"];
  const APPROVAL_CANDIDATE_STATES = ["approved", "approved_for_publication"];
  const artifact_breakdown = {
    total: artifactRows.length,
    internal: artifactRows.filter((r) => (r.artifact_role as string) === "reflection_note").length,
    reviewable: artifactRows.filter((r) => {
      const role = r.artifact_role as string;
      const state = (r.current_approval_state as string) ?? "";
      return role !== "reflection_note" && REVIEWABLE_STATES.includes(state);
    }).length,
    approval_candidates: artifactRows.filter((r) =>
      APPROVAL_CANDIDATE_STATES.includes((r.current_approval_state as string) ?? "")
    ).length,
  };

  const artifactHourRows = artifactHourRes.data ?? [];
  const artifact_breakdown_hour = {
    sessions: sessionsLastHour,
    total: artifactHourRows.length,
    internal: artifactHourRows.filter((r) => (r.artifact_role as string) === "reflection_note").length,
    reviewable: artifactHourRows.filter((r) => {
      const role = r.artifact_role as string;
      const state = (r.current_approval_state as string) ?? "";
      return role !== "reflection_note" && REVIEWABLE_STATES.includes(state);
    }).length,
    approval_candidates: artifactHourRows.filter((r) =>
      APPROVAL_CANDIDATE_STATES.includes((r.current_approval_state as string) ?? "")
    ).length,
  };

  const styleInputs: StyleAnalysisInput[] = [];
  for (const a of (styleArtifactsRes.data ?? []) as Array<{
    title?: string | null;
    summary?: string | null;
    content_text?: string | null;
  }>) {
    styleInputs.push({
      title: a.title ?? null,
      summary: a.summary ?? null,
      text: a.content_text ?? null,
    });
  }
  for (const p of (styleProposalsRes.data ?? []) as Array<{
    title?: string | null;
    summary?: string | null;
  }>) {
    styleInputs.push({
      title: p.title ?? null,
      summary: p.summary ?? null,
      text: null,
    });
  }
  const {
    profile: style_profile,
    pressureExplanation: style_profile_pressure_explanation,
    repeatedTitles: style_profile_repeated_titles,
  } = computeStyleProfile(styleInputs);

  const proposalBacklog =
    proposalBacklogRes.data?.reduce(
      (acc: Record<string, number>, row: Record<string, unknown>) => {
        const role = (row.proposal_role as string) ?? "none";
        const key = `${row.lane_type ?? "none"}__${row.proposal_state ?? "none"}__${role}__${(row.target_surface as string) ?? "none"}`;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ) ?? {};

  const returnCandidatesCount = archiveCountRes.count ?? 0;
  const latestTrace = (latestSessionRes.data as { trace?: Record<string, unknown> } | null)?.trace ?? null;
  const active_project =
    (latestTrace && typeof latestTrace === "object" && "project_name" in latestTrace)
      ? (latestTrace.project_name as string)
      : null;
  const active_thread =
    (latestTrace && typeof latestTrace === "object" && "thread_name" in latestTrace)
      ? (latestTrace.thread_name as string)
      : null;

  const creative_state =
    snapshot && typeof snapshot === "object" && "creative_tension" in snapshot
      ? {
          tension: (snapshot as Record<string, unknown>).creative_tension ?? null,
          reflection_need: (snapshot as Record<string, unknown>).reflection_need ?? null,
          momentum: (snapshot as Record<string, unknown>).recent_exploration_rate ?? null,
        }
      : null;

  const runtime = {
    mode: runtimeConfig.mode,
    always_on: runtimeConfig.always_on,
    tokens_used_today: runtimeConfig.tokens_used_today,
    last_run_at: runtimeConfig.last_run_at,
  };

  const recentProposals = (recentProposalsRes.data ?? []) as Array<{
    proposal_record_id: string;
    title: string | null;
    summary: string | null;
    habitat_payload_json: unknown;
    target_surface: string | null;
    proposal_role: string | null;
    target_type: string | null;
    lane_type: string | null;
    created_at: string | null;
  }>;

  let relationship_summary: RuntimeRelationshipSummary = {
    duplicates_recent: 0,
    refinements_recent: 0,
    alternatives_recent: 0,
    successors_recent: 0,
    unrelated_recent: 0,
    dominant_relationship_pattern: null,
  };

  let concept_family_summary: ConceptFamilyRuntimeSummary = {
    family_count_recent: 0,
    largest_family_size: 0,
    families_with_successors: 0,
    families_with_many_alternatives: 0,
    families_with_duplicate_pressure: 0,
    families_needing_consolidation: 0,
    families_with_contested_representatives: 0,
    families_with_clear_heads: 0,
    families_recommended_for_reinforcement: 0,
    families_recommended_for_consolidation: 0,
    families_recommended_for_human_selection: 0,
    families_holding_multiple_branches: 0,
    stable_families: 0,
  };

  if (recentProposals.length > 0) {
    const relInputs: ProposalForRelationship[] = recentProposals.map((p) => ({
      id: p.proposal_record_id,
      title: p.title ?? "",
      summary: p.summary ?? null,
      payloadText:
        p.habitat_payload_json && typeof p.habitat_payload_json === "object"
          ? JSON.stringify(p.habitat_payload_json).slice(0, 800)
          : null,
      targetSurface: p.target_surface ?? null,
      proposalRole: p.proposal_role ?? null,
      targetType: p.target_type ?? null,
      laneType: p.lane_type ?? "surface",
      createdAt: p.created_at ?? null,
    }));

    const counts: Record<ProposalRelationshipKind, number> = {
      duplicate: 0,
      refinement: 0,
      alternative: 0,
      successor: 0,
      unrelated: 0,
    };

    for (const current of relInputs) {
      const rel = evaluateProposalRelationship(current, relInputs);
      counts[rel.kind] = (counts[rel.kind] ?? 0) + 1;
    }

    const total =
      counts.duplicate + counts.refinement + counts.alternative + counts.successor + counts.unrelated;

    let dominant: string | null = null;
    if (total > 0) {
      const entries = Object.entries(counts) as [ProposalRelationshipKind, number][];
      const [kind, value] = entries.reduce(
        (best, cur) => (cur[1] > best[1] ? cur : best),
        ["unrelated", 0] as [ProposalRelationshipKind, number]
      );
      if (value / total >= 0.4) {
        dominant = kind;
      }
    }

    relationship_summary = {
      duplicates_recent: counts.duplicate,
      refinements_recent: counts.refinement,
      alternatives_recent: counts.alternative,
      successors_recent: counts.successor,
      unrelated_recent: counts.unrelated,
      dominant_relationship_pattern: dominant,
    };

    // Build concept families and derive runtime summary (advisory only).
    const { summary: familySummary } = buildConceptFamilies(relInputs, (current, all) => {
      const rel = evaluateProposalRelationship(current, all);
      return { kind: rel.kind, relatedProposalId: rel.relatedProposalId };
    });
    concept_family_summary = familySummary;
  }

  const trajectory = deriveRuntimeTrajectory({
    seed: PLATFORM_DEFAULT_TWIN_SEED,
    styleProfile: style_profile,
    stylePressureExplanation: style_profile_pressure_explanation,
    repeatedTitles: style_profile_repeated_titles,
    backlogArtifacts: {
      total: artifactRows.length,
      reviewable: artifact_breakdown.reviewable,
      approval_candidates: artifact_breakdown.approval_candidates,
    },
    synthesisPressure: synthesisPressurePayload,
    relationshipSummary: relationship_summary,
    conceptFamilySummary: concept_family_summary,
  });

  return {
    snapshot: stateError || !snapshot ? null : snapshot,
    backlog: { artifacts: artifactBacklog, proposals: proposalBacklog },
    artifact_breakdown,
    artifact_breakdown_hour,
    style_profile,
    style_profile_pressure_explanation,
    style_profile_repeated_titles,
    runtime,
    return_candidates: returnCandidatesCount,
    creative_state,
    active_project,
    active_thread,
    synthesis_pressure: synthesisPressurePayload,
    relationship_summary,
    concept_family_summary,
    trajectory,
    seed_config: PLATFORM_DEFAULT_TWIN_SEED,
    active_intent: activeIntent ?? null,
  };
}

/**
 * Maps a raw creative_session row (with its trace JSON) to the shape returned by
 * getRuntimeTracePayload. Exported so it can be unit-tested independently of
 * the Supabase client.
 */
export function mapSessionTraceRow(row: {
  session_id: string;
  trace: Record<string, unknown> | null;
  decision_summary: Record<string, unknown> | null;
  created_at: string;
}) {
  const t = row.trace ?? {};
  return {
    session_id: row.session_id,
    // session_mode is the canonical trace field written by writeTraceAndDeliberation
    mode: (t as Record<string, unknown>).session_mode ?? null,
    metabolism_mode: (t as Record<string, unknown>).metabolism_mode ?? null,
    drive: (t as Record<string, unknown>).drive ?? null,
    project: (t as Record<string, unknown>).project_name ?? null,
    thread: (t as Record<string, unknown>).thread_name ?? null,
    idea: (t as Record<string, unknown>).idea_summary ?? null,
    artifact_id: (t as Record<string, unknown>).artifact_id ?? null,
    proposal_id: (t as Record<string, unknown>).proposal_id ?? null,
    proposal_type: (t as Record<string, unknown>).proposal_type ?? null,
    tokens_used: (t as Record<string, unknown>).tokens_used ?? null,
    // Phase 1: medium resolution observability
    requested_medium: (t as Record<string, unknown>).requested_medium ?? null,
    executed_medium: (t as Record<string, unknown>).executed_medium ?? null,
    fallback_reason: (t as Record<string, unknown>).fallback_reason ?? null,
    resolution_source: (t as Record<string, unknown>).resolution_source ?? null,
    // Phase 2: capability-fit classification
    medium_fit: (t as Record<string, unknown>).medium_fit ?? null,
    missing_capability: (t as Record<string, unknown>).missing_capability ?? null,
    // Phase 3: extension proposal diagnostics
    extension_classification: (t as Record<string, unknown>).extension_classification ?? null,
    confidence_truth: (t as Record<string, unknown>).confidence_truth ?? null,
    // Evidence Ledger V1: proposal and governance evidence on read path
    proposal_outcome:
      typeof (t as Record<string, unknown>).proposal_outcome === "string"
        ? ((t as Record<string, unknown>).proposal_outcome as string)
        : null,
    governance_evidence: parseGovernanceEvidence(t as Record<string, unknown>),
    created_at: row.created_at,
  };
}

export async function getRuntimeTracePayload(supabase: SupabaseClient | null) {
  if (!supabase) return { sessions: [] };
  const { data: rows, error } = await supabase
    .from("creative_session")
    .select("session_id, trace, decision_summary, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) return { sessions: [], error: error.message };
  const sessions = (rows ?? []).map(mapSessionTraceRow);
  return { sessions };
}

export async function getRuntimeDeliberationPayload(supabase: SupabaseClient | null) {
  if (!supabase) return { trace: null };
  const { data, error } = await supabase
    .from("deliberation_trace")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { trace: null, error: error.message };
  return { trace: data ?? null };
}

export async function getRuntimeContinuityPayload(supabase: SupabaseClient | null) {
  if (!supabase) return { sessions: [], summary: null };
  const windowSize = 20;
  const { data: sessionRows, error: sessionError } = await supabase
    .from("creative_session")
    .select("session_id, trace, decision_summary, created_at")
    .order("created_at", { ascending: false })
    .limit(windowSize);
  if (sessionError) return { sessions: [], summary: null, error: sessionError.message };
  const sessions = (sessionRows ?? []) as {
    session_id: string;
    trace: Record<string, unknown> | null;
    decision_summary: Record<string, unknown> | null;
    created_at: string;
  }[];
  if (sessions.length === 0) return { sessions: [], summary: null };
  const sessionIds = sessions.map((s) => s.session_id);
  const { data: traceRows } = await supabase
    .from("deliberation_trace")
    .select("session_id, observations_json, tensions_json, hypotheses_json, evidence_checked_json, confidence, created_at")
    .in("session_id", sessionIds);
  const traceData = (traceRows ?? []) as {
    session_id: string;
    observations_json: Record<string, unknown> | null;
    tensions_json: Record<string, unknown> | null;
    hypotheses_json: Record<string, unknown> | null;
    evidence_checked_json: Record<string, unknown> | null;
    confidence: number | null;
    created_at: string;
  }[];
  const proposalIds = sessions
    .map((s) => ((s.trace ?? {}) as Record<string, unknown>).proposal_id as string | null)
    .filter((id): id is string => !!id);
  const artifactIds = sessions
    .map((s) => ((s.trace ?? {}) as Record<string, unknown>).artifact_id as string | null)
    .filter((id): id is string => !!id);
  let proposals: { proposal_record_id: string; proposal_role: string | null }[] = [];
  if (proposalIds.length > 0) {
    const { data } = await supabase
      .from("proposal_record")
      .select("proposal_record_id, proposal_role")
      .in("proposal_record_id", proposalIds);
    proposals = (data ?? []) as { proposal_record_id: string; proposal_role: string | null }[];
  }
  let artifacts: { artifact_id: string; artifact_role: string | null }[] = [];
  if (artifactIds.length > 0) {
    const { data } = await supabase
      .from("artifact")
      .select("artifact_id, artifact_role")
      .in("artifact_id", artifactIds);
    artifacts = (data ?? []) as { artifact_id: string; artifact_role: string | null }[];
  }
  const continuityRows = buildContinuityRows({
    sessions,
    traces: traceData,
    proposals,
    artifacts,
  });
  const summary = buildContinuityAggregate(continuityRows);
  return { sessions: continuityRows, summary };
}

/** Thread transition relative to the adjacent older session (newest-first order). */
export type ThreadTransition = "same-thread" | "thread-switch" | "no-thread";

/** Selection evidence for display (v1 or v2 from trace.selection_evidence). */
export interface SessionSelectionEvidenceDisplay {
  decision_summary: string | null;
  selection_source: string | null;
  selected_thread_id: string | null;
  selected_mode: string | null;
  selected_drive: string | null;
  signals_present: string[];
  signals_used: string[];
  /** "full" when the session produced an artifact+critique; "minimal" for no-artifact sessions. Legacy traces will be null. */
  trace_kind: "full" | "minimal" | null;
}

/** Governance evidence for display (from trace.governance_evidence). Evidence Ledger V1: why a proposal was created or blocked. */
export interface GovernanceEvidenceDisplay {
  lane_type: "surface" | "medium" | "system";
  classification_reason: string;
  actor_authority: "runner" | "human" | "reviewer" | "unknown";
  reason_codes: string[];
}

function parseGovernanceEvidence(t: Record<string, unknown>): GovernanceEvidenceDisplay | null {
  const ge = t.governance_evidence as Record<string, unknown> | null | undefined;
  if (!ge || typeof ge !== "object") return null;
  const lane_type = ge.lane_type as string | undefined;
  if (lane_type !== "surface" && lane_type !== "medium" && lane_type !== "system") return null;
  const classification_reason = typeof ge.classification_reason === "string" ? ge.classification_reason : "";
  const actor_authority = ge.actor_authority as string | undefined;
  const auth = ["runner", "human", "reviewer", "unknown"].includes(actor_authority ?? "")
    ? (actor_authority as GovernanceEvidenceDisplay["actor_authority"])
    : "unknown";
  const reason_codes = Array.isArray(ge.reason_codes)
    ? (ge.reason_codes as unknown[]).filter((c): c is string => typeof c === "string")
    : [];
  return { lane_type, classification_reason, actor_authority: auth, reason_codes };
}

/** One row in the Session Continuity Timeline (observability only). */
export interface SessionTimelineRow {
  session_id: string;
  created_at: string;
  project_id: string | null;
  project_name: string | null;
  thread_id: string | null;
  thread_name: string | null;
  mode: string | null;
  drive: string | null;
  confidence: number | null;
  outcome_kind: string | null;
  narrative_state: string | null;
  action_kind: string | null;
  proposal_created: boolean;
  has_artifact: boolean;
  /** Selection evidence ledger (v1 or v2) for runtime panel. */
  selection_evidence: SessionSelectionEvidenceDisplay | null;
  /** Why a proposal was created, updated, or skipped this session (Evidence Ledger V1). */
  proposal_outcome: string | null;
  /** Governance evidence when proposal path ran: lane, classification, reason codes (Evidence Ledger V1). */
  governance_evidence: GovernanceEvidenceDisplay | null;
  /** Derived: how this row's thread relates to the next (older) row. */
  thread_transition: ThreadTransition;
  /** Derived: length of consecutive same thread_id run including this row (0 if no thread). */
  thread_streak_length: number;
}

/**
 * Derive thread_transition and thread_streak_length for each row (newest-first).
 * Transition: compare row i's thread_id to row i+1 (older). Last row → no-thread.
 * Streak: consecutive run of same thread_id including this row (older direction); 0 if no thread.
 */
export function attachThreadTransitionAndStreak(
  rows: Omit<SessionTimelineRow, "thread_transition" | "thread_streak_length">[]
): SessionTimelineRow[] {
  const n = rows.length;
  const streak: number[] = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    const row = rows[i]!;
    const tid = row.thread_id ?? null;

    if (tid == null) {
      streak[i] = 0;
    } else if (i + 1 < n && (rows[i + 1]!.thread_id ?? null) === tid) {
      streak[i] = (streak[i + 1] ?? 0) + 1;
    } else {
      streak[i] = 1;
    }
  }
  return rows.map((row, i) => {
    let thread_transition: ThreadTransition = "no-thread";
    if (i < n - 1) {
      const a = row.thread_id ?? null;
      const b = rows[i + 1]!.thread_id ?? null;
      if (a != null && b != null) {
        thread_transition = a === b ? "same-thread" : "thread-switch";
      }
    }
    return {
      ...row,
      thread_transition,
      thread_streak_length: streak[i] ?? 0,
    };
  });
}

/** Session clustering summary derived from timeline rows (observability only). */
export interface SessionClusteringSummary {
  /** (# adjacent pairs with same thread_id) / (# comparable pairs); null if no comparable pairs. */
  thread_repeat_rate: number | null;
  /** Distinct thread_ids in window (excludes null). */
  unique_thread_count: number;
  /** Max consecutive sessions with same thread_id. */
  longest_same_thread_streak: number;
  /** Count per mode in window (optional). */
  mode_mix: Record<string, number>;
  /** Heuristic label from thread_repeat_rate; not a hard rule. */
  interpretation: "chaotic exploration" | "light exploration" | "healthy clustering" | "possible stickiness" | null;
  /** Number of comparable adjacent pairs used for repeat rate (for transparency). */
  comparable_pairs: number;
}

/**
 * Derive session clustering summary from timeline rows (newest first).
 * Excludes pairs where either session has null thread_id from repeat-rate denominator.
 */
export function computeSessionClusteringSummary(rows: SessionTimelineRow[]): SessionClusteringSummary {
  const mode_mix: Record<string, number> = {};
  const threadIds = new Set<string>();
  for (const r of rows) {
    const mode = r.mode?.trim() || "unknown";
    mode_mix[mode] = (mode_mix[mode] ?? 0) + 1;
    if (r.thread_id) threadIds.add(r.thread_id);
  }

  let comparable_pairs = 0;
  let repeat_count = 0;
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i]!.thread_id;
    const b = rows[i + 1]!.thread_id;
    if (a != null && b != null) {
      comparable_pairs++;
      if (a === b) repeat_count++;
    }
  }

  const thread_repeat_rate =
    comparable_pairs > 0 ? Math.round((repeat_count / comparable_pairs) * 100) / 100 : null;

  let longest_same_thread_streak = 0;
  let current_streak = 0;
  let prev: string | null = null;
  for (const r of rows) {
    const tid = r.thread_id ?? null;
    if (tid == null) {
      current_streak = 0;
      prev = null;
    } else if (tid === prev) {
      current_streak++;
      longest_same_thread_streak = Math.max(longest_same_thread_streak, current_streak);
    } else {
      current_streak = 1;
      prev = tid;
      longest_same_thread_streak = Math.max(longest_same_thread_streak, 1);
    }
  }

  let interpretation: SessionClusteringSummary["interpretation"] = null;
  if (thread_repeat_rate != null) {
    if (thread_repeat_rate < 0.2) interpretation = "chaotic exploration";
    else if (thread_repeat_rate < 0.4) interpretation = "light exploration";
    else if (thread_repeat_rate <= 0.7) interpretation = "healthy clustering";
    else interpretation = "possible stickiness";
  }

  return {
    thread_repeat_rate,
    unique_thread_count: threadIds.size,
    longest_same_thread_streak,
    mode_mix,
    interpretation,
    comparable_pairs,
  };
}

/**
 * Session Continuity Timeline: last N sessions with trace + trajectory review for debug.
 * Read-only; no new tables. Returns rows plus a clustering summary derived from the same rows.
 */
export async function getSessionContinuityTimeline(
  supabase: SupabaseClient | null,
  limit: number = 40
): Promise<{ rows: SessionTimelineRow[]; clustering_summary: SessionClusteringSummary }> {
  const empty: { rows: SessionTimelineRow[]; clustering_summary: SessionClusteringSummary } = {
    rows: [],
    clustering_summary: {
      thread_repeat_rate: null,
      unique_thread_count: 0,
      longest_same_thread_streak: 0,
      mode_mix: {},
      interpretation: null,
      comparable_pairs: 0,
    },
  };
  if (!supabase) return empty;
  const { data: sessionRows, error: sessionError } = await supabase
    .from("creative_session")
    .select("session_id, trace, decision_summary, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (sessionError || !sessionRows?.length) return empty;
  const sessionIds = sessionRows.map((r) => r.session_id);
  const { data: reviewRows } = await supabase
    .from("trajectory_review")
    .select("session_id, outcome_kind, narrative_state, action_kind")
    .in("session_id", sessionIds);
  const reviewBySession = new Map<string, { outcome_kind: string | null; narrative_state: string | null; action_kind: string | null }>();
  for (const r of reviewRows ?? []) {
    const row = r as { session_id: string; outcome_kind: string | null; narrative_state: string | null; action_kind: string | null };
    reviewBySession.set(row.session_id, {
      outcome_kind: row.outcome_kind ?? null,
      narrative_state: row.narrative_state ?? null,
      action_kind: row.action_kind ?? null,
    });
  }
  const rowsBase: Omit<SessionTimelineRow, "thread_transition" | "thread_streak_length">[] = sessionRows.map((row) => {
    const t = (row.trace ?? {}) as Record<string, unknown>;
    const d = (row.decision_summary ?? {}) as Record<string, unknown>;
    const rev = reviewBySession.get(row.session_id);
    const confidence =
      typeof d.confidence === "number" && Number.isFinite(d.confidence) ? (d.confidence as number) : null;
    const se = t.selection_evidence as Record<string, unknown> | null | undefined;
    let traceKind: "full" | "minimal" | null = null;
    if (t.trace_kind === "full") traceKind = "full";
    else if (t.trace_kind === "minimal") traceKind = "minimal";
    const selection_evidence: SessionSelectionEvidenceDisplay | null = se
      ? {
          decision_summary:
            (typeof se.decision_summary === "string" ? se.decision_summary : null) ??
            (typeof d.next_action === "string" ? d.next_action : null),
          selection_source:
            typeof se.selection_source === "string" ? se.selection_source : null,
          selected_thread_id:
            typeof se.selected_thread_id === "string" ? se.selected_thread_id : se.selected_thread_id === null ? null : null,
          selected_mode: typeof se.selected_mode === "string" ? se.selected_mode : se.selected_mode === null ? null : null,
          selected_drive: typeof se.selected_drive === "string" ? se.selected_drive : se.selected_drive === null ? null : null,
          signals_present: Array.isArray(se.signals_present) ? (se.signals_present as string[]) : [],
          signals_used: Array.isArray(se.signals_used) ? (se.signals_used as string[]) : [],
          trace_kind: traceKind,
        }
      : null;
    const proposal_outcome =
      typeof t.proposal_outcome === "string" ? t.proposal_outcome : null;
    const governance_evidence = parseGovernanceEvidence(t);

    return {
      session_id: row.session_id,
      created_at: row.created_at,
      project_id: (t.project_id as string) ?? null,
      project_name: (t.project_name as string) ?? null,
      thread_id: (t.idea_thread_id as string) ?? null,
      thread_name: (t.thread_name as string) ?? null,
      mode: (t.session_mode as string) ?? null,
      drive: (t.drive as string) ?? null,
      confidence,
      outcome_kind: rev?.outcome_kind ?? null,
      narrative_state: rev?.narrative_state ?? null,
      action_kind: rev?.action_kind ?? null,
      proposal_created: Boolean(t.proposal_id),
      has_artifact: Boolean(t.artifact_id),
      selection_evidence,
      proposal_outcome,
      governance_evidence,
    };
  });
  const rows = attachThreadTransitionAndStreak(rowsBase);
  const clustering_summary = computeSessionClusteringSummary(rows);
  return { rows, clustering_summary };
}

/**
 * Derive the Stage-2 trajectory advisory dry-run output from a thought map summary.
 *
 * Safe insertion point: call this in the runtime debug page or observability API only.
 * MUST NOT be called from session-runner or any selection path.
 *
 * Stage-1 contract preserved: this function only reads thought map data (already
 * computed from historical traces) and calls the adapter's dry-run function.
 * Its output is observability-only and does not influence any selector.
 */
export function deriveTrajectoryAdvisoryDryRun(thoughtMap: ThoughtMapSummary): TrajectoryAdvisoryLog {
  const context: TrajectoryFeedbackContext = {
    session_posture: thoughtMap.session_posture,
    thread_repeat_rate: thoughtMap.thread_repeat_rate,
    longest_thread_streak: thoughtMap.longest_thread_streak,
    trajectory_shape: thoughtMap.trajectory_shape,
    exploration_vs_consolidation: thoughtMap.exploration_vs_consolidation,
    interpretation_confidence: thoughtMap.interpretation_confidence,
    window_sessions: thoughtMap.window_sessions,
    proposals_last_10_sessions: thoughtMap.proposal_activity_summary.proposals_last_10_sessions,
  };
  return buildAdvisoryLog(context);
}

export type { TrajectoryAdvisoryLog };
