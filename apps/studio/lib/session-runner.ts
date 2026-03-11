import { runSessionPipeline } from "@twin/agent";
import {
  runCritique,
  computeEvaluationSignals,
  updateCreativeState,
  stateToSnapshotRow,
  computeDriveWeights,
  computeSessionMode,
  selectDrive,
  type CreativeStateFields,
  type CreativeStateSignals,
} from "@twin/evaluation";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getLatestCreativeState } from "@/lib/creative-state-load";
import { computePublicCurationBacklog } from "@/lib/curation-backlog";
import { getBrainContext, buildWorkingContextString } from "@/lib/brain-context";
import { isProposalEligible } from "@/lib/proposal-eligibility";
import {
  buildMinimalHabitatPayloadFromConcept,
  summaryFromHabitatPayload,
  validateHabitatPayload,
  capSummaryTo200Words,
} from "@/lib/habitat-payload";
import {
  selectProjectAndThread,
  getProjectThreadIdeaContext,
  getProjectThreadIdeaTraceLabels,
} from "@/lib/project-thread-selection";
import {
  getMaxArtifactsPerSession,
  getMaxPendingAvatarProposals,
  getMaxPendingHabitatLayoutProposals,
  isOverTokenLimit,
  getArchiveDecayHalfLifeDays,
} from "@/lib/stop-limits";
import { detectRepetition } from "@/lib/repetition-detection";
import { addTokenUsage, getRuntimeConfig } from "@/lib/runtime-config";
import { createArchiveEntry } from "@twin/memory";

/** Create bucket "artifacts" in Supabase Dashboard → Storage if missing. */
const ARTIFACTS_BUCKET = "artifacts";

export type PreferredMedium = "writing" | "concept" | "image";

export interface SessionRunOptions {
  createdBy: string;
  isCron: boolean;
  promptContext?: string | null;
  preferMedium?: PreferredMedium | null;
}

export interface SessionRunSuccessPayload {
  session_id: string;
  artifact_count: number;
  persisted: boolean;
  requested_medium?: PreferredMedium;
  artifact_medium: PreferredMedium | "other" | null;
}

export class SessionRunError extends Error {
  status: number;
  payload: any;

  constructor(status: number, payload: any) {
    super(typeof payload === "string" ? payload : payload?.error ?? "Session run failed");
    this.status = status;
    this.payload = payload;
  }
}

/**
 * Lightweight classification for artifact role.
 * This is intentionally narrow for now and can be evolved as metabolism improves.
 */
function inferArtifactRole(
  medium: string | null | undefined,
  isCron: boolean
): string | null {
  if (medium === "concept" && isCron) {
    return "layout_concept";
  }
  if (medium === "image" && isCron) {
    return "image_concept";
  }
  return null;
}

/**
 * Derive a preferred medium from creative state when not explicitly set.
 * Explicit preferMedium from the caller always wins; this is used primarily
 * for cron / autonomous sessions to nudge the Twin toward different media.
 */
function derivePreferredMedium(
  state: CreativeStateFields,
  explicit: PreferredMedium | null | undefined,
  isCron: boolean
): PreferredMedium | null {
  if (explicit) return explicit;

  const {
    expression_diversity,
    creative_tension,
    reflection_need,
    unfinished_projects,
    avatar_alignment,
    public_curation_backlog,
  } = state;

  // High reflection need or many unfinished projects → concept artifacts.
  if (reflection_need > 0.65 || unfinished_projects > 0.55) {
    return "concept";
  }

  // Low avatar alignment with growing public backlog or low expression diversity under tension → image.
  if (
    (avatar_alignment < 0.4 && public_curation_backlog > 0.4) ||
    (expression_diversity < 0.35 && creative_tension > 0.5)
  ) {
    return "image";
  }

  // For cron runs, keep a small chance of images to propose avatars over time.
  if (isCron && Math.random() < 0.12) {
    return "image";
  }

  // Default: writing (by leaving null, pipeline treats this as writing/concept path).
  return null;
}

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
 * Shared internal runner used by both manual POST /api/session/run and cron.
 * Throws SessionRunError on handled failures so callers can map to HTTP.
 */
export async function runSessionInternal(options: SessionRunOptions): Promise<SessionRunSuccessPayload> {
  const { createdBy, isCron, promptContext, preferMedium } = options;
  const supabase = getSupabaseServer();

  const { state: previousState } = await getLatestCreativeState(supabase);

  // C-4: Override public_curation_backlog with a live proposal count before session-mode
  // computation so the mode selection reflects current review queue pressure, not stale
  // snapshot data from the previous session.
  const liveBacklog = await computePublicCurationBacklog(supabase);
  const sessionState = { ...previousState, public_curation_backlog: liveBacklog };

  const mode = computeSessionMode(sessionState);
  const driveWeights = computeDriveWeights(sessionState);
  const selectedDrive = selectDrive(driveWeights);
  let selectedProjectId: string | null = null;
  let selectedThreadId: string | null = null;
  let selectedIdeaId: string | null = null;
  let selectionSource: "archive" | "project_thread" | null = null;

  if (supabase) {
    // For return sessions, prefer resurfacing from archive entries when available.
    if (mode === "return") {
      const { data: archives } = await supabase
        .from("archive_entry")
        .select("project_id, idea_thread_id, idea_id, recurrence_score, creative_pull, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (archives && archives.length > 0) {
        const nowMs = Date.now();
        // Configurable half-life for archive recency decay. Canon: archive_and_return.md §6.
        const decayHalfLifeDays = getArchiveDecayHalfLifeDays();
        const weights = archives.map((row) => {
          const r = (row.recurrence_score as number | null) ?? 0.5;
          const p = (row.creative_pull as number | null) ?? 0.5;
          const base = r * 0.6 + p * 0.4;
          const created = row.created_at ? new Date(row.created_at as string).getTime() : nowMs;
          const daysSince = (nowMs - created) / (24 * 60 * 60 * 1000);
          const recency = 1 / (1 + daysSince / decayHalfLifeDays);
          return base * recency;
        });
        const total = weights.reduce((a, b) => a + b, 0) || 1;
        let acc = 0;
        const r = Math.random();
        let chosenIndex = 0;
        for (let i = 0; i < archives.length; i++) {
          acc += weights[i]! / total;
          if (r <= acc) {
            chosenIndex = i;
            break;
          }
          chosenIndex = i;
        }
        const chosen = archives[chosenIndex];
        if (chosen) {
          selectedProjectId = (chosen.project_id as string | null) ?? null;
          selectedThreadId = (chosen.idea_thread_id as string | null) ?? null;
          selectedIdeaId = (chosen.idea_id as string | null) ?? null;
          selectionSource = "archive";
          console.log("[session] selection: return_from_archive", {
            archive_project: selectedProjectId,
            archive_thread: selectedThreadId,
            archive_idea: selectedIdeaId,
          });
        }
      }
    }

    // Fallback (or non-return modes): regular project/thread/idea selection.
    if (!selectedProjectId && !selectedThreadId && !selectedIdeaId) {
      const selection = await selectProjectAndThread(supabase);
      selectedProjectId = selection.projectId;
      selectedThreadId = selection.ideaThreadId;
      selectedIdeaId = selection.ideaId;
      selectionSource = "project_thread";
      if (selectedProjectId || selectedThreadId || selectedIdeaId) {
        console.log("[session] selection: project_thread_idea", {
          project: selectedProjectId,
          thread: selectedThreadId,
          idea: selectedIdeaId,
        });
      }
    }
  }
  const brainContext = await getBrainContext(supabase, {
    project_id: selectedProjectId ?? null,
  });
  let workingContextString = buildWorkingContextString(brainContext);
  if (supabase && (selectedProjectId || selectedThreadId || selectedIdeaId)) {
    const focusContext = await getProjectThreadIdeaContext(
      supabase,
      selectedProjectId,
      selectedThreadId,
      selectedIdeaId
    );
    if (focusContext) {
      workingContextString = [workingContextString, focusContext].filter(Boolean).join("\n\n");
    }
  }
  const derivedPreferMedium = derivePreferredMedium(sessionState, preferMedium, isCron);

  const result = await runSessionPipeline(
    {
      mode,
      selectedDrive,
      projectId: selectedProjectId ?? undefined,
      ideaThreadId: selectedThreadId ?? undefined,
      ideaId: selectedIdeaId ?? undefined,
      promptContext: promptContext ?? undefined,
      sourceContext: workingContextString || undefined,
      preferMedium: derivedPreferMedium ?? undefined,
    },
    { openaiApiKey: process.env.OPENAI_API_KEY ?? undefined }
  );

  const tokensUsed = "tokensUsed" in result && typeof result.tokensUsed === "number" ? result.tokensUsed : undefined;
  if (isOverTokenLimit(tokensUsed)) {
    throw new SessionRunError(400, {
      error: "Token limit exceeded; session aborted.",
      session_id: result.session.session_id,
      tokens_used: tokensUsed,
    });
  }

  const maxArtifacts = getMaxArtifactsPerSession();
  const artifacts = result.artifacts.slice(0, maxArtifacts);
  let artifact = artifacts[0];
  if (!artifact) {
    return {
      session_id: result.session.session_id,
      artifact_count: 0,
      persisted: Boolean(supabase),
      requested_medium: derivedPreferMedium ?? undefined,
      artifact_medium: null,
    };
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
    let traceProposalId: string | null = null;
    let traceProposalType: string | null = null;
    const decisionSummary: {
      project_reason: string | null;
      thread_reason: string | null;
      idea_reason: string | null;
      rejected_alternatives: string[];
      next_action: string | null;
      confidence: number;
    } = {
      project_reason:
        selectionSource === "archive"
          ? "Return session: selected project from archive entries weighted by recurrence, pull, and recency."
          : "Selected active project via project/thread selection (weighted by thread recurrence and creative pull).",
      thread_reason:
        selectionSource === "archive"
          ? "Thread comes from chosen archive entry with unresolved or paused work."
          : "Selected active thread for the project, weighted by recurrence_score and creative_pull.",
      idea_reason: selectedIdeaId
        ? "Selected idea linked to the chosen thread, biased toward higher recurrence and pull when available."
        : "No specific idea was selected; session used project/thread and identity/context only.",
      rejected_alternatives:
        selectionSource === "archive"
          ? ["Other archive entries had lower combined recurrence, pull, or were older."]
          : ["Other active threads or ideas scored lower on recurrence and creative pull."],
      next_action: null,
      confidence: 0.7,
    };

    const sessionRow = {
      session_id: result.session.session_id,
      project_id: selectedProjectId ?? result.session.project_id,
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
    const { error: sessionError } = await supabase.from("creative_session").insert(sessionRow);
    if (sessionError) {
      throw new SessionRunError(500, { error: `Session insert failed: ${sessionError.message}` });
    }

    const artifactRole = inferArtifactRole(artifact.medium, options.isCron);

    const artifactRow = {
      artifact_id: artifact.artifact_id,
      project_id: selectedProjectId ?? artifact.project_id,
      session_id: artifact.session_id,
      primary_idea_id: selectedIdeaId ?? artifact.primary_idea_id,
      primary_thread_id: selectedThreadId ?? artifact.primary_thread_id,
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
      artifact_role: artifactRole,
      created_at: artifact.created_at,
      updated_at: artifact.updated_at,
    };
    const { error: artifactError } = await supabase.from("artifact").insert(artifactRow);
    if (artifactError) {
      throw new SessionRunError(500, { error: `Artifact insert failed: ${artifactError.message}` });
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
    const { error: critiqueError } = await supabase.from("critique_record").insert(critiqueRow);
    if (critiqueError) {
      throw new SessionRunError(500, { error: `Critique insert failed: ${critiqueError.message}` });
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
    const { error: evalError } = await supabase.from("evaluation_signal").insert(evaluationRow);
    if (evalError) {
      throw new SessionRunError(500, { error: `Evaluation insert failed: ${evalError.message}` });
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
      throw new SessionRunError(500, { error: `Artifact update failed: ${artifactUpdateError.message}` });
    }

    // A-3: Archive loop — when critique marks this artifact as an archive candidate, create an archive_entry
    // so future return-mode sessions can select from autonomously generated archive history.
    if (critique.critique_outcome === "archive_candidate") {
      const archiveEntry = createArchiveEntry({
        project_id: selectedProjectId ?? artifact.project_id,
        artifact_id: artifact.artifact_id,
        idea_id: selectedIdeaId ?? artifact.primary_idea_id,
        idea_thread_id: selectedThreadId ?? artifact.primary_thread_id,
        reason_paused: critique.overall_summary?.slice(0, 500) ?? "archive_candidate",
        creative_pull: evaluation.pull_score,
        recurrence_score: evaluation.recurrence_score,
        last_session_id: result.session.session_id,
      });
      const { error: archiveError } = await supabase.from("archive_entry").insert(archiveEntry);
      if (archiveError) {
        console.warn("[session] archive_entry insert failed", {
          artifact_id: artifact.artifact_id,
          error: archiveError.message,
        });
      }
    }

    // Concept-to-proposal: if concept artifact is eligible, create or refresh a habitat layout proposal
    // only when backlog is under cap (agent focuses on publishing or other lanes when backlog is full).
    if (artifact.medium === "concept") {
      const eligibility = isProposalEligible({
        medium: artifact.medium,
        alignment_score: evaluation.alignment_score,
        fertility_score: evaluation.fertility_score,
        pull_score: evaluation.pull_score,
        critique_outcome: critique.critique_outcome,
      });
      if (eligibility.eligible) {
        const cap = getMaxPendingHabitatLayoutProposals();
        const { data: existingActive } = await supabase
          .from("proposal_record")
          .select("proposal_record_id, created_at")
          .eq("lane_type", "surface")
          .eq("proposal_role", "habitat_layout")
          .eq("target_surface", "staging_habitat")
          .in("proposal_state", ["pending_review", "approved_for_staging", "staged"]);

        const count = Array.isArray(existingActive) ? existingActive.length : 0;
        if (cap > 0 && count >= cap) {
          console.log("[session] skipping habitat_layout proposal: backlog at cap", {
            count,
            cap,
            role: "habitat_layout",
          });
          if (!decisionSummary.next_action) {
            decisionSummary.next_action =
              "Focus on reviewing existing habitat layout proposals before creating new ones (backlog at cap).";
          }
        } else {
          const minimalPayload = buildMinimalHabitatPayloadFromConcept(artifact.title, artifact.summary);
          const validated = validateHabitatPayload(minimalPayload);
          const hasPayload = validated.success;
          const summary = hasPayload ? summaryFromHabitatPayload(validated.data) : (artifact.summary?.slice(0, 2000) ?? null);

          if (Array.isArray(existingActive) && existingActive.length > 0) {
            const sorted = [...existingActive].sort(
              (a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
            );
            const newest = sorted[0];
            const older = sorted.slice(1);
            if (newest) {
              traceProposalId = newest.proposal_record_id as string;
              traceProposalType = "surface";
              await supabase
                .from("proposal_record")
                .update({
                  title: artifact.title,
                  summary,
                  habitat_payload_json: hasPayload ? (validated.data as object) : null,
                  updated_at: new Date().toISOString(),
                })
                .eq("proposal_record_id", newest.proposal_record_id);

              if (older.length > 0) {
                await supabase
                  .from("proposal_record")
                  .update({
                    proposal_state: "archived",
                    updated_at: new Date().toISOString(),
                  })
                  .in(
                    "proposal_record_id",
                    older.map((o) => o.proposal_record_id)
                  );
              }
            }
          } else {
            const proposalRow = {
              lane_type: "surface",
              target_type: "concept",
              target_id: artifact.artifact_id,
              artifact_id: artifact.artifact_id,
              title: artifact.title,
              summary,
              proposal_state: "pending_review",
              target_surface: "staging_habitat",
              proposal_type: "layout",
              proposal_role: "habitat_layout",
              habitat_payload_json: hasPayload ? (validated.data as object) : null,
              preview_uri: null,
              review_note: null,
              created_by: createdBy,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            const { data: insertedHabitat } = await supabase
              .from("proposal_record")
              .insert(proposalRow)
              .select("proposal_record_id")
              .single();
            if (insertedHabitat?.proposal_record_id) {
              traceProposalId = insertedHabitat.proposal_record_id as string;
              traceProposalType = "surface";
              decisionSummary.next_action =
                decisionSummary.next_action ??
                "Create or refine a habitat layout proposal for the staging habitat from this concept.";
            }
          }
        }
      }
    }

    // Avatar proposal: when image artifact is produced, create an avatar_candidate proposal only if under cap.
    if (artifact.medium === "image") {
      const { data: existingAvatar } = await supabase
        .from("proposal_record")
        .select("proposal_record_id")
        .eq("target_type", "avatar_candidate")
        .eq("artifact_id", artifact.artifact_id)
        .limit(1)
        .maybeSingle();
      if (existingAvatar) {
        // Already proposed this artifact.
      } else {
        const avatarCap = getMaxPendingAvatarProposals();
        const { count: pendingAvatarCount } = await supabase
          .from("proposal_record")
          .select("proposal_record_id", { count: "exact", head: true })
          .eq("target_type", "avatar_candidate")
          .eq("proposal_state", "pending_review");
        const pending = pendingAvatarCount ?? 0;
        if (avatarCap > 0 && pending >= avatarCap) {
          console.log("[session] skipping avatar_candidate proposal: backlog at cap", {
            pending,
            cap: avatarCap,
            role: "avatar_candidate",
          });
        } else {
          const avatarSummary = capSummaryTo200Words(artifact.summary ?? artifact.title ?? "Proposed as public avatar.");
          const { data: insertedAvatar } = await supabase
            .from("proposal_record")
            .insert({
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
            })
            .select("proposal_record_id")
            .single();
          if (insertedAvatar?.proposal_record_id) {
            traceProposalId = insertedAvatar.proposal_record_id as string;
            traceProposalType = "avatar";
            decisionSummary.next_action =
              decisionSummary.next_action ?? "Propose a new avatar candidate for review based on this image.";
          }
        }
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
            ? (process.env.OPENAI_MODEL_CONCEPT ??
              process.env.OPENAI_MODEL_GENERATION ??
              process.env.OPENAI_MODEL ??
              "gpt-4o-mini")
            : (process.env.OPENAI_MODEL_GENERATION ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
      prompt_snapshot: null,
      context_snapshot: null,
      run_status: "completed",
      started_at: result.session.started_at,
      ended_at: result.session.ended_at,
      created_at: result.session.updated_at,
      updated_at: result.session.updated_at,
    };
    const { error: genError } = await supabase.from("generation_run").insert(generationRunRow);
    if (genError) {
      throw new SessionRunError(500, { error: `Generation run insert failed: ${genError.message}` });
    }

    // A-6: Derive creative-state signals from session context.
    // exploredNewMedium: true when this artifact's medium was absent from the last 5 prior artifacts.
    // addedUnfinishedWork: true when critique marks the artifact as an archive candidate.
    // isReflection: true when the session mode was "reflect".
    // Medium history is queried globally (not per-project) because expression_diversity
    // is a system-level creative-state field for a single-identity Twin, not per-project.
    const { data: recentArtifactRows } = await supabase
      .from("artifact")
      .select("medium")
      .neq("artifact_id", artifact.artifact_id)
      .order("created_at", { ascending: false })
      .limit(5);
    const recentMediums = (recentArtifactRows ?? [])
      .map((a: { medium: string | null }) => a.medium)
      .filter(Boolean) as string[];
    const sessionSignals: CreativeStateSignals = {
      isReflection: mode === "reflect",
      exploredNewMedium:
        !!artifact.medium && recentMediums.length > 0 && !recentMediums.includes(artifact.medium),
      addedUnfinishedWork: critique.critique_outcome === "archive_candidate",
    };

    const nextState = updateCreativeState(previousState, evaluation, repetitionDetected, sessionSignals);
    const stateSnapshotRow = stateToSnapshotRow(
      nextState,
      result.session.session_id,
      critique.overall_summary?.slice(0, 500) ?? null
    );
    const { error: stateError } = await supabase.from("creative_state_snapshot").insert(stateSnapshotRow);
    if (stateError) {
      throw new SessionRunError(500, { error: `State snapshot insert failed: ${stateError.message}` });
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
    const { error: memError } = await supabase.from("memory_record").insert(memoryRow);
    if (memError) {
      throw new SessionRunError(500, { error: `Memory record insert failed: ${memError.message}` });
    }

    // A-2: Recurrence writeback — propagate evaluation.recurrence_score to the selected idea and thread.
    // Uses direct overwrite (smaller scope than EWA for this PR). Failures are soft-logged and do not abort the session.
    if (selectedIdeaId) {
      const { error: ideaRecurrenceError } = await supabase
        .from("idea")
        .update({ recurrence_score: evaluation.recurrence_score, updated_at: new Date().toISOString() })
        .eq("idea_id", selectedIdeaId);
      if (ideaRecurrenceError) {
        console.warn("[session] recurrence writeback failed for idea", {
          idea_id: selectedIdeaId,
          error: ideaRecurrenceError.message,
        });
      }
    }
    if (selectedThreadId) {
      const { error: threadRecurrenceError } = await supabase
        .from("idea_thread")
        .update({ recurrence_score: evaluation.recurrence_score, updated_at: new Date().toISOString() })
        .eq("idea_thread_id", selectedThreadId);
      if (threadRecurrenceError) {
        console.warn("[session] recurrence writeback failed for idea_thread", {
          idea_thread_id: selectedThreadId,
          error: threadRecurrenceError.message,
        });
      }
    }

    const tokensUsedForRecord = "tokensUsed" in result && typeof result.tokensUsed === "number" ? result.tokensUsed : 0;
    if (tokensUsedForRecord > 0) await addTokenUsage(supabase, tokensUsedForRecord);

    if (!decisionSummary.next_action) {
      if (mode === "return") {
        decisionSummary.next_action =
          "Continue exploring or resolving this archived thread or idea in a follow-up session.";
      } else if (artifact.medium === "concept") {
        decisionSummary.next_action =
          "Review this concept and decide whether to adjust or create proposals for staging or publication.";
      } else if (artifact.medium === "image") {
        decisionSummary.next_action =
          "Review this image for potential avatar or surface use, or archive it if it does not fit current direction.";
      } else {
        decisionSummary.next_action =
          "Review this artifact for approval, archiving, or follow-up work depending on evaluation and critique.";
      }
    }

    // Session trace: full decision chain for runtime introspection.
    const runtimeConfig = await getRuntimeConfig(supabase);
    const traceLabels = await getProjectThreadIdeaTraceLabels(
      supabase,
      selectedProjectId,
      selectedThreadId,
      selectedIdeaId
    );
    const trace = {
      mode: runtimeConfig.mode,
      drive: selectedDrive ?? null,
      project_id: selectedProjectId ?? null,
      project_name: traceLabels.project_name ?? null,
      idea_thread_id: selectedThreadId ?? null,
      thread_name: traceLabels.thread_name ?? null,
      idea_id: selectedIdeaId ?? null,
      idea_summary: traceLabels.idea_summary ?? null,
      artifact_id: artifact.artifact_id,
      proposal_id: traceProposalId,
      proposal_type: traceProposalType,
      tokens_used: tokensUsed ?? null,
      generation_model: generationRunRow.model_name,
      start_time: result.session.started_at,
      end_time: result.session.ended_at ?? new Date().toISOString(),
    };
    await supabase
      .from("creative_session")
      .update({ trace, decision_summary: decisionSummary, updated_at: new Date().toISOString() })
      .eq("session_id", result.session.session_id);
  }

  const artifactMedium: PreferredMedium | "other" | null =
    artifact.medium === "image" || artifact.medium === "writing" || artifact.medium === "concept"
      ? artifact.medium
      : artifact.medium
        ? "other"
        : null;

  return {
    session_id: result.session.session_id,
    artifact_count: (result.artifacts ?? []).length,
    persisted: Boolean(supabase),
    requested_medium: derivedPreferMedium ?? undefined,
    artifact_medium: artifactMedium,
  };
}

