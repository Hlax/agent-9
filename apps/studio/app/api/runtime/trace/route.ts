import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * GET /api/runtime/trace — last 10 sessions with trace (decision chain) for Twin introspection.
 */
export async function GET() {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ sessions: [] });
  }

  const { data: rows, error } = await supabase
    .from("creative_session")
    .select("session_id, trace, decision_summary, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ sessions: [], error: error.message }, { status: 500 });
  }

  const sessions = (rows ?? []).map(
    (row: {
      session_id: string;
      trace: Record<string, unknown> | null;
      decision_summary: Record<string, unknown> | null;
      created_at: string;
    }) => {
      const t = row.trace ?? {};
      const d = row.decision_summary ?? {};
      return {
        session_id: row.session_id,
        mode: (t as Record<string, unknown>).mode ?? null,
        drive: (t as Record<string, unknown>).drive ?? null,
        project: (t as Record<string, unknown>).project_name ?? null,
        thread: (t as Record<string, unknown>).thread_name ?? null,
        idea: (t as Record<string, unknown>).idea_summary ?? null,
        artifact_id: (t as Record<string, unknown>).artifact_id ?? null,
        proposal_id: (t as Record<string, unknown>).proposal_id ?? null,
        proposal_type: (t as Record<string, unknown>).proposal_type ?? null,
        tokens_used: (t as Record<string, unknown>).tokens_used ?? null,
        decision_summary: {
          project_reason: (d as Record<string, unknown>).project_reason ?? null,
          thread_reason: (d as Record<string, unknown>).thread_reason ?? null,
          idea_reason: (d as Record<string, unknown>).idea_reason ?? null,
          rejected_alternatives: (d as Record<string, unknown>).rejected_alternatives ?? [],
          next_action: (d as Record<string, unknown>).next_action ?? null,
          confidence: (d as Record<string, unknown>).confidence ?? null,
        },
        created_at: row.created_at,
      };
    }
  );

  return NextResponse.json({ sessions });
}
