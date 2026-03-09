import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/sessions/[id] — fetch one session with linked records for inspection.
 * Returns session, artifacts, critique_records, evaluation_signals, state_snapshot, memory_records.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authClient = await createClient().catch(() => null);
    if (authClient) {
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const { id: sessionId } = await params;
    if (!sessionId) {
      return NextResponse.json({ error: "Missing session id" }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { data: session, error: sessionError } = await supabase
      .from("creative_session")
      .select("*")
      .eq("session_id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const [artifactsRes, critiquesRes, snapshotsRes, memoriesRes] = await Promise.all([
      supabase.from("artifact").select("*").eq("session_id", sessionId),
      supabase.from("critique_record").select("*").eq("session_id", sessionId),
      supabase.from("creative_state_snapshot").select("*").eq("session_id", sessionId),
      supabase.from("memory_record").select("*").eq("source_session_id", sessionId),
    ]);

    const artifacts = artifactsRes.data ?? [];
    const artifactIds = artifacts.map((a) => a.artifact_id);
    const critiques = critiquesRes.data ?? [];
    const snapshots = snapshotsRes.data ?? [];
    const memories = memoriesRes.data ?? [];

    let signals: unknown[] = [];
    if (artifactIds.length > 0) {
      const { data: signalsData } = await supabase
        .from("evaluation_signal")
        .select("*")
        .eq("target_type", "artifact")
        .in("target_id", artifactIds);
      signals = signalsData ?? [];
    }

    return NextResponse.json({
      session,
      artifacts,
      critique_records: critiques,
      evaluation_signals: signals,
      creative_state_snapshots: snapshots,
      memory_records: memories,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
