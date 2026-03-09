import { NextResponse } from "next/server";
import { runSessionPipeline } from "@twin/agent";
import { runCritique, computeEvaluationSignals } from "@twin/evaluation";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getSourceContextForSession } from "@/lib/source-context";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/session/run — run one session pipeline.
 * Requires authenticated user. Loads identity/reference source context when DB is configured.
 */
export async function POST() {
  try {
    const authClient = await createClient().catch(() => null);
    if (authClient) {
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
    const supabase = getSupabaseServer();
    const sourceContext = supabase ? await getSourceContextForSession(supabase) : null;
    const result = await runSessionPipeline(
      {
        mode: "explore",
        projectId: undefined,
        sourceContext: sourceContext ?? undefined,
      },
      { openaiApiKey: process.env.OPENAI_API_KEY ?? undefined }
    );

    const artifact = result.artifacts[0];
    if (!artifact) {
      return NextResponse.json({
        session_id: result.session.session_id,
        artifact_count: 0,
      });
    }

    const critique = await runCritique(
      {
        artifact_id: artifact.artifact_id,
        session_id: result.session.session_id,
        content_preview: artifact.content_text,
        title: artifact.title,
        summary: artifact.summary,
      },
      { apiKey: process.env.OPENAI_API_KEY ?? undefined }
    );
    const evaluation = computeEvaluationSignals({
      target_type: "artifact",
      target_id: artifact.artifact_id,
      critique,
    });

    if (supabase) {
      const sessionRow = {
        session_id: result.session.session_id,
        project_id: result.session.project_id,
        mode: result.session.mode,
        selected_drive: result.session.selected_drive,
        title: result.session.title,
        prompt_context: result.session.prompt_context,
        reflection_notes: result.session.reflection_notes,
        started_at: result.session.started_at,
        ended_at: result.session.ended_at,
        created_at: result.session.created_at,
        updated_at: result.session.updated_at,
      };
      const { error: sessionError } = await supabase
        .from("creative_session")
        .insert(sessionRow);
      if (sessionError) {
        return NextResponse.json(
          { error: `Session insert failed: ${sessionError.message}` },
          { status: 500 }
        );
      }

      const artifactRow = {
        artifact_id: artifact.artifact_id,
        project_id: artifact.project_id,
        session_id: artifact.session_id,
        primary_idea_id: artifact.primary_idea_id,
        primary_thread_id: artifact.primary_thread_id,
        title: artifact.title,
        summary: artifact.summary,
        medium: artifact.medium,
        lifecycle_status: artifact.lifecycle_status,
        current_approval_state: artifact.current_approval_state,
        current_publication_state: artifact.current_publication_state,
        content_text: artifact.content_text,
        content_uri: artifact.content_uri,
        preview_uri: artifact.preview_uri,
        notes: artifact.notes,
        alignment_score: artifact.alignment_score,
        emergence_score: artifact.emergence_score,
        fertility_score: artifact.fertility_score,
        pull_score: artifact.pull_score,
        recurrence_score: artifact.recurrence_score,
        created_at: artifact.created_at,
        updated_at: artifact.updated_at,
      };
      const { error: artifactError } = await supabase
        .from("artifact")
        .insert(artifactRow);
      if (artifactError) {
        return NextResponse.json(
          { error: `Artifact insert failed: ${artifactError.message}` },
          { status: 500 }
        );
      }

      const critiqueRow = {
        critique_record_id: critique.critique_record_id,
        artifact_id: critique.artifact_id,
        session_id: critique.session_id,
        intent_note: critique.intent_note,
        strength_note: critique.strength_note,
        originality_note: critique.originality_note,
        energy_note: critique.energy_note,
        potential_note: critique.potential_note,
        medium_fit_note: critique.medium_fit_note,
        coherence_note: critique.coherence_note,
        fertility_note: critique.fertility_note,
        overall_summary: critique.overall_summary,
        critique_outcome: critique.critique_outcome,
        created_at: critique.created_at,
        updated_at: critique.updated_at,
      };
      const { error: critiqueError } = await supabase
        .from("critique_record")
        .insert(critiqueRow);
      if (critiqueError) {
        return NextResponse.json(
          { error: `Critique insert failed: ${critiqueError.message}` },
          { status: 500 }
        );
      }

      const evaluationRow = {
        evaluation_signal_id: evaluation.evaluation_signal_id,
        target_type: evaluation.target_type,
        target_id: evaluation.target_id,
        alignment_score: evaluation.alignment_score,
        emergence_score: evaluation.emergence_score,
        fertility_score: evaluation.fertility_score,
        pull_score: evaluation.pull_score,
        recurrence_score: evaluation.recurrence_score,
        resonance_score: evaluation.resonance_score,
        rationale: evaluation.rationale,
        created_at: evaluation.created_at,
        updated_at: evaluation.updated_at,
      };
      const { error: evalError } = await supabase
        .from("evaluation_signal")
        .insert(evaluationRow);
      if (evalError) {
        return NextResponse.json(
          { error: `Evaluation insert failed: ${evalError.message}` },
          { status: 500 }
        );
      }

      const { error: artifactUpdateError } = await supabase
        .from("artifact")
        .update({
          alignment_score: evaluation.alignment_score,
          emergence_score: evaluation.emergence_score,
          fertility_score: evaluation.fertility_score,
          pull_score: evaluation.pull_score,
          recurrence_score: evaluation.recurrence_score,
          updated_at: new Date().toISOString(),
        })
        .eq("artifact_id", artifact.artifact_id);
      if (artifactUpdateError) {
        return NextResponse.json(
          { error: `Artifact update failed: ${artifactUpdateError.message}` },
          { status: 500 }
        );
      }

      const generationRunRow = {
        session_id: result.session.session_id,
        artifact_id: artifact.artifact_id,
        medium: artifact.medium,
        provider_name: "openai",
        model_name: "gpt-4o-mini",
        prompt_snapshot: null,
        context_snapshot: null,
        run_status: "completed",
        started_at: result.session.started_at,
        ended_at: result.session.ended_at,
        created_at: result.session.updated_at,
        updated_at: result.session.updated_at,
      };
      const { error: genError } = await supabase
        .from("generation_run")
        .insert(generationRunRow);
      if (genError) {
        return NextResponse.json(
          { error: `Generation run insert failed: ${genError.message}` },
          { status: 500 }
        );
      }

      const stateSnapshotRow = {
        state_snapshot_id: crypto.randomUUID(),
        session_id: result.session.session_id,
        identity_stability: evaluation.alignment_score,
        avatar_alignment: evaluation.alignment_score,
        expression_diversity: evaluation.emergence_score,
        unfinished_projects: null,
        recent_exploration_rate: 0.5,
        creative_tension: evaluation.pull_score,
        curiosity_level: evaluation.emergence_score,
        reflection_need: evaluation.recurrence_score ?? 0.3,
        idea_recurrence: evaluation.recurrence_score,
        public_curation_backlog: null,
        notes: critique.overall_summary?.slice(0, 500) ?? null,
      };
      const { error: stateError } = await supabase
        .from("creative_state_snapshot")
        .insert(stateSnapshotRow);
      if (stateError) {
        return NextResponse.json(
          { error: `State snapshot insert failed: ${stateError.message}` },
          { status: 500 }
        );
      }

      const memorySummary = [
        artifact.title,
        artifact.summary?.slice(0, 200),
        critique.overall_summary?.slice(0, 300),
      ]
        .filter(Boolean)
        .join(" | ");
      const memoryRow = {
        memory_record_id: crypto.randomUUID(),
        project_id: result.session.project_id,
        memory_type: "session_reflection",
        summary: memorySummary.slice(0, 2000) || "Session completed.",
        details: critique.overall_summary ?? null,
        source_session_id: result.session.session_id,
        source_artifact_id: artifact.artifact_id,
        importance_score: evaluation.pull_score,
        recurrence_score: evaluation.recurrence_score,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { error: memError } = await supabase
        .from("memory_record")
        .insert(memoryRow);
      if (memError) {
        return NextResponse.json(
          { error: `Memory record insert failed: ${memError.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      session_id: result.session.session_id,
      artifact_count: result.artifacts.length,
      persisted: Boolean(supabase),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Session failed" },
      { status: 500 }
    );
  }
}
