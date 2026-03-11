import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { buildContinuityRows, buildContinuityAggregate } from "@/lib/runtime-continuity";

/**
 * GET /api/runtime/continuity — recent session ontology continuity view.
 * Internal-only; returns shaped rows and aggregates for operator inspection.
 */
export async function GET() {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ sessions: [], summary: null });
  }

  const windowSize = 20;

  const { data: sessionRows, error: sessionError } = await supabase
    .from("creative_session")
    .select("session_id, trace, decision_summary, created_at")
    .order("created_at", { ascending: false })
    .limit(windowSize);

  if (sessionError) {
    return NextResponse.json({ sessions: [], summary: null, error: sessionError.message }, { status: 500 });
  }

  const sessions = (sessionRows ?? []) as {
    session_id: string;
    trace: Record<string, unknown> | null;
    decision_summary: Record<string, unknown> | null;
    created_at: string;
  }[];

  if (sessions.length === 0) {
    return NextResponse.json({ sessions: [], summary: null });
  }

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

  return NextResponse.json({ sessions: continuityRows, summary });
}

