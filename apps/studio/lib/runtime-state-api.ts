/**
 * Shared runtime API payload builders. Used by GET /api/runtime/* routes and by
 * server-rendered pages (e.g. runtime debug page) to avoid server-side fetch of
 * relative URLs, which causes ERR_INVALID_URL in production.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { getSynthesisPressure, computeSynthesisPressure } from "@/lib/synthesis-pressure";
import { buildContinuityRows, buildContinuityAggregate } from "@/lib/runtime-continuity";

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
      runtime: { mode: "default", always_on: false, tokens_used_today: 0, last_run_at: null },
      return_candidates: 0,
      creative_state: null,
      active_project: null,
      active_thread: null,
      synthesis_pressure: emptySynthesisPressure,
    };
  }

  const [stateRes, artifactBacklogRes, proposalBacklogRes, archiveCountRes, runtimeConfig, latestSessionRes, synthesisPressurePayload] =
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
        .from("proposal_record")
        .select("proposal_role, proposal_state, lane_type, target_surface", {
          count: "exact",
          head: false,
        }),
      supabase.from("archive_entry").select("archive_entry_id", { count: "exact", head: true }),
      getRuntimeConfig(supabase),
      supabase
        .from("creative_session")
        .select("trace")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getSynthesisPressure(supabase),
    ]);

  const { data: snapshot, error: stateError } = stateRes;

  const artifactBacklog =
    artifactBacklogRes.data?.reduce(
      (acc: Record<string, number>, row: Record<string, unknown>) => {
        const role = (row.artifact_role as string) ?? "none";
        const key = `${row.current_approval_state ?? "none"}__${role}`;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ) ?? {};

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

  return {
    snapshot: stateError || !snapshot ? null : snapshot,
    backlog: { artifacts: artifactBacklog, proposals: proposalBacklog },
    runtime,
    return_candidates: returnCandidatesCount,
    creative_state,
    active_project,
    active_thread,
    synthesis_pressure: synthesisPressurePayload,
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
