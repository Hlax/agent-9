import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { createClient } from "@/lib/supabase/server";

import { APPROVAL_ACTIONS } from "@/lib/governance-rules";

const ALLOWED_STATES = APPROVAL_ACTIONS;

/**
 * POST /api/artifacts/[id]/approve — set artifact approval state and record.
 * Requires auth. Approval is not publication.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: artifactId } = await params;
    if (!artifactId) {
      return NextResponse.json(
        { error: "Missing artifact id" },
        { status: 400 }
      );
    }

    let body: { approval_state: string; review_note?: string; annotation_note?: string };
    try {
      body = await _request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const approval_state = body.approval_state;
    if (
      !approval_state ||
      !ALLOWED_STATES.includes(approval_state as (typeof ALLOWED_STATES)[number])
    ) {
      return NextResponse.json(
        {
          error: `approval_state must be one of: ${ALLOWED_STATES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { error: updateError } = await supabase
      .from("artifact")
      .update({
        current_approval_state: approval_state,
        updated_at: new Date().toISOString(),
      })
      .eq("artifact_id", artifactId);

    if (updateError) {
      return NextResponse.json(
        { error: `Artifact update failed: ${updateError.message}` },
        { status: 500 }
      );
    }

    // When archiving, create an archive_entry so return sessions can resurface this artifact's lineage.
    if (approval_state === "archived") {
      const { data: artifact } = await supabase
        .from("artifact")
        .select("project_id, primary_idea_id, primary_thread_id, recurrence_score, pull_score")
        .eq("artifact_id", artifactId)
        .single();
      const { data: existing } = await supabase
        .from("archive_entry")
        .select("archive_entry_id")
        .eq("artifact_id", artifactId)
        .limit(1)
        .maybeSingle();
      if (artifact && !existing) {
        const { data: lastSession } = await supabase
          .from("creative_session")
          .select("session_id")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        await supabase.from("archive_entry").insert({
          project_id: artifact.project_id,
          artifact_id: artifactId,
          idea_id: artifact.primary_idea_id,
          idea_thread_id: artifact.primary_thread_id,
          reason_paused: "archived_artifact",
          creative_pull: artifact.pull_score,
          recurrence_score: artifact.recurrence_score,
          last_session_id: lastSession?.session_id ?? null,
        });
      }
    }

    const reviewer =
      (authClient && (await authClient.auth.getUser()).data.user?.email) ?? null;

    const { error: recordError } = await supabase.from("approval_record").insert({
      artifact_id: artifactId,
      approval_state,
      reviewer,
      review_note: body.review_note ?? null,
      annotation_note: body.annotation_note ?? null,
    });

    if (recordError) {
      return NextResponse.json(
        { error: `Approval record failed: ${recordError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, approval_state });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Approve failed" },
      { status: 500 }
    );
  }
}
