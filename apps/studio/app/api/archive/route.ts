import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * POST /api/archive — create an archive_entry from an artifact.
 *
 * Body:
 * {
 *   artifact_id: string;
 *   unresolved_question?: string;
 *   note?: string;
 * }
 */
export async function POST(request: Request) {
  try {
    const authClient = await createClient().catch(() => null);
    if (authClient) {
      const {
        data: { user },
      } = await authClient.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    let body: { artifact_id?: string; unresolved_question?: string; note?: string } = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const artifactId = body.artifact_id?.trim();
    if (!artifactId) {
      return NextResponse.json({ error: "Missing artifact_id" }, { status: 400 });
    }

    const { data: artifact, error: fetchError } = await supabase
      .from("artifact")
      .select("artifact_id, project_id, primary_idea_id, primary_thread_id, recurrence_score, pull_score")
      .eq("artifact_id", artifactId)
      .single();

    if (fetchError || !artifact) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
    }

    const { data: lastSession } = await supabase
      .from("creative_session")
      .select("session_id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase.from("archive_entry").insert({
      project_id: artifact.project_id,
      artifact_id: artifact.artifact_id,
      idea_id: artifact.primary_idea_id,
      idea_thread_id: artifact.primary_thread_id,
      reason_paused: "archived_artifact",
      unresolved_question: body.unresolved_question?.trim() || null,
      creative_pull: artifact.pull_score,
      recurrence_score: artifact.recurrence_score,
      notes_from_harvey: body.note?.trim() || null,
      last_session_id: lastSession?.session_id ?? null,
    });

    if (error) {
      return NextResponse.json({ error: `Archive insert failed: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Archive failed" },
      { status: 500 }
    );
  }
}

