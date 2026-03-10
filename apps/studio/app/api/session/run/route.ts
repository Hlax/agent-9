import { NextResponse } from "next/server";
import { runSessionPipeline } from "@twin/agent";
import {
  runCritique,
  computeEvaluationSignals,
  updateCreativeState,
  stateToSnapshotRow,
  computeDriveWeights,
  computeSessionMode,
  selectDrive,
} from "@twin/evaluation";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getLatestCreativeState } from "@/lib/creative-state-load";
import { getBrainContext, buildWorkingContextString } from "@/lib/brain-context";
import { createClient } from "@/lib/supabase/server";
import { isProposalEligible } from "@/lib/proposal-eligibility";
import { buildMinimalHabitatPayloadFromConcept, summaryFromHabitatPayload, validateHabitatPayload, capSummaryTo200Words } from "@/lib/habitat-payload";
import { selectProjectAndThread } from "@/lib/project-thread-selection";
import { getMaxArtifactsPerSession, isOverTokenLimit } from "@/lib/stop-limits";
import { detectRepetition } from "@/lib/repetition-detection";
import { addTokenUsage } from "@/lib/runtime-config";

/** Create bucket "artifacts" in Supabase Dashboard → Storage if missing. */
const ARTIFACTS_BUCKET = "artifacts";

/**
 * Fetch image from URL and upload to Supabase Storage. Returns public URL or null.
 */
async function uploadImageToStorage(
  supabase: NonNullable<ReturnType<typeof getSupabaseServer>>,
  imageUrl: string,
  sessionId: string,
  artifactId: string
): Promise<string | null> {
  const res = await fetch(imageUrl).catch(() => null);
  if (!res?.ok) return null;
  const blob = await res.blob();
  const ext = blob.type === "image/png" ? "png" : "webp";
  const path = `${sessionId}/${artifactId}.${ext}`;
  const { error } = await supabase.storage.from(ARTIFACTS_BUCKET).upload(path, blob, {
    contentType: blob.type,
    upsert: true,
  });
  if (error) return null;
  const { data: urlData } = supabase.storage.from(ARTIFACTS_BUCKET).getPublicUrl(path);
  return urlData?.publicUrl ?? null;
}

/**
 * POST /api/session/run — run one session pipeline.
 * Requires authenticated user. Loads identity/reference source context when DB is configured.
 * Body (optional): { promptContext?: string, preferMedium?: "writing" | "concept" | "image" }.
 */
const CRON_SECRET_HEADER = "x-cron-secret";

export async function POST(request: Request) {
  try {
    let createdBy: string = "harvey";
    const cronSecret = request.headers.get(CRON_SECRET_HEADER);
    const isCron = !!process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET;
    if (!isCron) {
      const authClient = await createClient().catch(() => null);
      if (authClient) {
        const { data: { user } } = await authClient.auth.getUser();
        if (!user) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (user?.email) createdBy = user.email;
      }
    }
    let promptContext: string | null = null;
    let preferMedium: "writing" | "concept" | "image" | null = null;
    try {
      const body = await request.json().catch(() => ({}));
      if (typeof body?.promptContext === "string" && body.promptContext.trim()) {
        promptContext = body.promptContext.trim();
      }
      if (body?.preferMedium === "image" || body?.preferMedium === "writing" || body?.preferMedium === "concept") {
        preferMedium = body.preferMedium;
      } else if (body && Object.keys(body).length === 0) {
        // Cron or empty POST: sometimes choose image so the Twin can propose avatars over many cycles (~12% image, ~88% writing/concept from mode).
        preferMedium = Math.random() < 0.12 ? "image" : null;
      }
    } catch {
      // no body
    }
    const supabase = getSupabaseServer();
    const { state: previousState } = await getLatestCreativeState(supabase);
    const mode = computeSessionMode(previousState);
    const driveWeights = computeDriveWeights(previousState);
    const selectedDrive = selectDrive(driveWeights);
    const { projectId: selectedProjectId } = supabase
      ? await selectProjectAndThread(supabase)
      : { projectId: null };
    const brainContext = await getBrainContext(supabase);
    const workingContextString = buildWorkingContextString(brainContext);
    const effectiveMode = preferMedium === "concept" ? "reflect" : mode;
    const result = await runSessionPipeline(
      {
        mode: effectiveMode,
        selectedDrive,
        projectId: selectedProjectId ?? undefined,
        promptContext: promptContext ?? undefined,
        sourceContext: workingContextString || undefined,
        preferMedium: preferMedium ?? undefined,
      },
      { openaiApiKey: process.env.OPENAI_API_KEY ?? undefined }
    );

    const tokensUsed = "tokensUsed" in result && typeof result.tokensUsed === "number" ? result.tokensUsed : undefined;
    if (isOverTokenLimit(tokensUsed)) {
      return NextResponse.json(
        {
          error: "Token limit exceeded; session aborted.",
          session_id: result.session.session_id,
          tokens_used: tokensUsed,
        },
        { status: 400 }
      );
    }

    const maxArtifacts = getMaxArtifactsPerSession();
    const artifacts = result.artifacts.slice(0, maxArtifacts);
    let artifact = artifacts[0];
    if (!artifact) {
      return NextResponse.json({
        session_id: result.session.session_id,
        artifact_count: 0,
        requested_medium: preferMedium ?? undefined,
      });
    }

    if (artifact.medium === "image" && artifact.content_uri && supabase) {
      const storageUrl = await uploadImageToStorage(
        supabase,
        artifact.content_uri,
        result.session.session_id,
        artifact.artifact_id
      );
      if (storageUrl) {
        artifact = { ...artifact, content_uri: storageUrl, preview_uri: storageUrl };
      }
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

      const repetitionDetected = await detectRepetition(supabase, critique.critique_outcome);

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

      // Concept-to-proposal: if concept artifact is eligible, create a proposal (canon: concept_to_proposal_flow.md).
      if (artifact.medium === "concept") {
        const eligibility = isProposalEligible({
          medium: artifact.medium,
          alignment_score: evaluation.alignment_score,
          fertility_score: evaluation.fertility_score,
          pull_score: evaluation.pull_score,
          critique_outcome: critique.critique_outcome,
        });
        if (eligibility.eligible) {
          const { data: existing } = await supabase
            .from("proposal_record")
            .select("proposal_record_id")
            .eq("target_type", "concept")
            .eq("target_id", artifact.artifact_id)
            .in("proposal_state", ["rejected", "archived"])
            .limit(1)
            .maybeSingle();
          if (!existing) {
            const minimalPayload = buildMinimalHabitatPayloadFromConcept(artifact.title, artifact.summary);
            const validated = validateHabitatPayload(minimalPayload);
            const hasPayload = validated.success;
            const proposalRow = {
              lane_type: "surface",
              target_type: "concept",
              target_id: artifact.artifact_id,
              artifact_id: artifact.artifact_id,
              title: artifact.title,
              summary: hasPayload ? summaryFromHabitatPayload(validated.data) : (artifact.summary?.slice(0, 2000) ?? null),
              proposal_state: "pending_review",
              target_surface: hasPayload ? "public_habitat" : "staging_habitat",
              proposal_type: "layout",
              habitat_payload_json: hasPayload ? (validated.data as object) : null,
              preview_uri: null,
              review_note: null,
              created_by: createdBy,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            await supabase.from("proposal_record").insert(proposalRow);
          }
        }
      }

      // Avatar proposal: when image artifact is produced, create an avatar_candidate proposal (Twin proposes this image as avatar).
      if (artifact.medium === "image") {
        const { data: existingAvatar } = await supabase
          .from("proposal_record")
          .select("proposal_record_id")
          .eq("target_type", "avatar_candidate")
          .eq("artifact_id", artifact.artifact_id)
          .limit(1)
          .maybeSingle();
        if (!existingAvatar) {
          const avatarSummary = capSummaryTo200Words(artifact.summary ?? artifact.title ?? "Proposed as public avatar.");
          await supabase.from("proposal_record").insert({
            lane_type: "surface",
            target_type: "avatar_candidate",
            target_id: artifact.artifact_id,
            artifact_id: artifact.artifact_id,
            title: artifact.title ?? "Avatar candidate",
            summary: avatarSummary || null,
            proposal_state: "pending_review",
            target_surface: null,
            proposal_type: "avatar",
            preview_uri: artifact.preview_uri ?? null,
            review_note: null,
            created_by: createdBy,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }

      const generationRunRow = {
        session_id: result.session.session_id,
        artifact_id: artifact.artifact_id,
        medium: artifact.medium,
        provider_name: "openai",
        model_name:
          artifact.medium === "image"
            ? (process.env.OPENAI_MODEL_IMAGE ?? "gpt-5-nano")
            : artifact.medium === "concept"
              ? (process.env.OPENAI_MODEL_CONCEPT ?? process.env.OPENAI_MODEL_GENERATION ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini")
              : (process.env.OPENAI_MODEL_GENERATION ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
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

      const nextState = (
        updateCreativeState as (prev: Parameters<typeof updateCreativeState>[0], evalSig: Parameters<typeof updateCreativeState>[1], repetition?: boolean) => ReturnType<typeof updateCreativeState>
      )(previousState, evaluation, repetitionDetected);
      const stateSnapshotRow = stateToSnapshotRow(
        nextState,
        result.session.session_id,
        critique.overall_summary?.slice(0, 500) ?? null
      );
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
      const tokensUsedForRecord = "tokensUsed" in result && typeof result.tokensUsed === "number" ? result.tokensUsed : 0;
      if (tokensUsedForRecord > 0) await addTokenUsage(supabase, tokensUsedForRecord);
    }

    return NextResponse.json({
      session_id: result.session.session_id,
      artifact_count: result.artifacts.length,
      persisted: Boolean(supabase),
      requested_medium: preferMedium ?? undefined,
      artifact_medium: artifact.medium,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Session failed" },
      { status: 500 }
    );
  }
}
