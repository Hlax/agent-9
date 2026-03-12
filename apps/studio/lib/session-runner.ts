import type { SupabaseClient } from "@supabase/supabase-js";
import { runSessionPipeline } from "@twin/agent";
import type { SessionPipelineResult } from "@twin/agent";
import type { Artifact, CreativeSession, CreativeDrive, CritiqueRecord, EvaluationSignal, SessionMode } from "@twin/core";
import {
  runCritique,
  computeEvaluationSignals,
  updateCreativeState,
  stateToSnapshotRow,
  computeDriveWeights,
  computeSessionMode,
  selectDrive,
  defaultCreativeState,
  type CreativeStateFields,
  type CreativeStateSignals,
} from "@twin/evaluation";
import { getSupabaseServer } from "@/lib/supabase-server";
import type { BrainContextResult } from "@/lib/brain-context";
import { getLatestCreativeState } from "@/lib/creative-state-load";
import { computePublicCurationBacklog } from "@/lib/curation-backlog";
import { getBrainContext, buildIdentityVoiceContext } from "@/lib/brain-context";
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
import { isLegalProposalStateTransition } from "@/lib/governance-rules";
import { writeDeliberationTrace } from "./deliberation-trace";
import { deriveTrajectoryReview } from "./trajectory-review";
import {
  scoreReturnCandidates,
  buildReturnSelectionDebug,
  type ArchiveCandidateRow,
  type RankedCandidate,
} from "./return-intelligence";
import {
  getTasteBiasMap,
  applyTasteBias,
  fillTastePayloadSelected,
  type TasteBiasPayload,
} from "./trajectory-taste-bias";
import { createArchiveEntry } from "@twin/memory";
import {
  classifyNarrativeState,
  classifyConfidenceBand,
  classifyActionKind,
  deriveTensionKinds,
  deriveEvidenceKinds,
  type OntologyState,
} from "@/lib/ontology-helpers";

/** Create bucket "artifacts" in Supabase Dashboard â†’ Storage if missing. */
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
  /** True when archive_entry row was successfully inserted (only set when critique_outcome=archive_candidate). */
  archive_entry_created?: boolean;
  /** True when idea and/or idea_thread recurrence_score was written back. */
  recurrence_updated?: boolean;
  /** True when a proposal_record was created or refreshed for this session's artifact. */
  proposal_created?: boolean;
  /** True when memory_record was successfully inserted. */
  memory_record_created?: boolean;
  /** Non-empty when any soft (non-fatal) operation failed during the session. */
  warnings: string[];
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

/** Source of project/thread/idea selection for this session. */
type SelectionSource = "archive" | "project_thread" | null;

/** Decision summary written to session trace and deliberation. */
interface DecisionSummary {
  project_reason: string | null;
  thread_reason: string | null;
  idea_reason: string | null;
  rejected_alternatives: string[];
  next_action: string | null;
  confidence: number;
}

/**
 * Shared execution state for the staged session orchestrator.
 * All stage helpers take and return this; deliberation trace is built from it.
 * When supabase is null, persist stages no-op and finalizeResult returns persisted: false.
 */
interface SessionExecutionState {
  supabase: SupabaseClient | null;
  createdBy: string;
  isCron: boolean;
  /** Creative state from latest snapshot (or default). */
  previousState: CreativeStateFields;
  /** Live proposal backlog used for mode/drive. */
  liveBacklog: number;
  sessionMode: SessionMode;
  selectedDrive: CreativeDrive | null;
  selectionSource: SelectionSource;
  selectedProjectId: string | null;
  selectedThreadId: string | null;
  selectedIdeaId: string | null;
  /** Archive was available and used (for evidence_checked_json). */
  archiveCandidateAvailable: boolean;
  brainContext: BrainContextResult | null;
  workingContext: string | null;
  sourceContext: string | null;
  /** Raw pipeline result (session + artifacts array). */
  pipelineResult: SessionPipelineResult | null;
  /** Primary artifact chosen for this run (pipelineResult.artifacts[0] or after image upload). */
  primaryArtifact: Artifact | null;
  derivedPreferMedium: PreferredMedium | null;
  tokensUsed: number | undefined;
  critique: CritiqueRecord | null;
  evaluation: EvaluationSignal | null;
  repetitionDetected: boolean;
  archiveEntryCreated: boolean;
  recurrenceUpdated: boolean;
  recurrenceAttempted: boolean;
  recurrenceAllSucceeded: boolean;
  proposalCreated: boolean;
  memoryRecordCreated: boolean;
  traceProposalId: string | null;
  traceProposalType: string | null;
  decisionSummary: DecisionSummary;
  warnings: string[];
  executionMode: "auto" | "proposal_only" | "human_required";
  humanGateReason: string | null;
  /** For deliberation: runtime metabolism mode (e.g. cron vs manual). */
  metabolismMode: string;
  /** Explicit preferMedium from options (overrides derived when set). */
  preferMedium: PreferredMedium | null;
  promptContext: string | null;
  /** Debug score breakdown for return-mode archive selection (focus-selection only). */
  returnSelectionDebug?: {
    selected: RankedCandidate | null;
    topCandidates: RankedCandidate[];
    tensionKinds: string[];
  } | null;
  /** Debug for trajectory taste bias (soft action-scoring preference). */
  tasteBiasDebug?: TasteBiasPayload | null;
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

  // High reflection need or many unfinished projects â†’ concept artifacts.
  if (reflection_need > 0.65 || unfinished_projects > 0.55) {
    return "concept";
  }

  // Low avatar alignment with growing public backlog or low expression diversity under tension â†’ image.
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
  supabase: SupabaseClient,
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

function initializeExecutionState(
  options: SessionRunOptions,
  supabase: SupabaseClient | null
): SessionExecutionState {
  const { createdBy, isCron, preferMedium, promptContext } = options;
  return {
    supabase,
    createdBy,
    isCron,
    preferMedium: preferMedium ?? null,
    promptContext: promptContext ?? null,
    returnSelectionDebug: undefined,
    previousState: defaultCreativeState(),
    liveBacklog: 0,
    sessionMode: "explore",
    selectedDrive: null,
    selectionSource: null,
    selectedProjectId: null,
    selectedThreadId: null,
    selectedIdeaId: null,
    archiveCandidateAvailable: false,
    brainContext: null,
    workingContext: null,
    sourceContext: null,
    pipelineResult: null,
    primaryArtifact: null,
    derivedPreferMedium: null,
    tokensUsed: undefined,
    critique: null,
    evaluation: null,
    repetitionDetected: false,
    archiveEntryCreated: false,
    recurrenceUpdated: false,
    recurrenceAttempted: false,
    recurrenceAllSucceeded: true,
    proposalCreated: false,
    memoryRecordCreated: false,
    traceProposalId: null,
    traceProposalType: null,
    decisionSummary: {
      project_reason: null,
      thread_reason: null,
      idea_reason: null,
      rejected_alternatives: [],
      next_action: null,
      confidence: 0.7,
    },
    warnings: [],
    executionMode: "auto",
    humanGateReason: null,
    metabolismMode: "manual",
  };
}

async function loadCreativeStateAndBacklog(
  state: SessionExecutionState
): Promise<SessionExecutionState> {
  const { state: previousState } = await getLatestCreativeState(state.supabase);
  const liveBacklog = await computePublicCurationBacklog(state.supabase);
  return { ...state, previousState, liveBacklog };
}

function selectModeAndDrive(state: SessionExecutionState): SessionExecutionState {
  const sessionState = { ...state.previousState, public_curation_backlog: state.liveBacklog };
  const sessionMode = computeSessionMode(sessionState);
  const driveWeights = computeDriveWeights(sessionState);
  const selectedDrive = selectDrive(driveWeights);
  return { ...state, sessionMode, selectedDrive };
}

async function selectFocus(state: SessionExecutionState): Promise<SessionExecutionState> {
  let {
    selectedProjectId,
    selectedThreadId,
    selectedIdeaId,
    selectionSource,
    archiveCandidateAvailable,
    decisionSummary,
  } = state;
  const { supabase, sessionMode } = state;

  if (supabase) {
    if (sessionMode === "return") {
      const { data: archives } = await supabase
        .from("archive_entry")
        .select("project_id, idea_thread_id, idea_id, artifact_id, recurrence_score, creative_pull, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (archives && archives.length > 0) {
        archiveCandidateAvailable = true;
        const nowMs = Date.now();
        const artifactIds = archives
          .map((r) => r.artifact_id as string | null)
          .filter((id): id is string => Boolean(id));
        const artifactMediumByArtifactId: Record<string, string> = {};
        if (artifactIds.length > 0) {
          const { data: artifacts } = await supabase
            .from("artifact")
            .select("artifact_id, medium")
            .in("artifact_id", artifactIds);
          if (artifacts) {
            for (const a of artifacts) {
              const id = a.artifact_id as string;
              const medium = a.medium as string;
              if (id && medium) artifactMediumByArtifactId[id] = medium;
            }
          }
        }
        const hasCritiqueByArtifactId = new Set<string>();
        if (artifactIds.length > 0) {
          const { data: critiques } = await supabase
            .from("critique_record")
            .select("artifact_id")
            .in("artifact_id", artifactIds);
          if (critiques) {
            for (const c of critiques) {
              const id = c.artifact_id as string;
              if (id) hasCritiqueByArtifactId.add(id);
            }
          }
        }
        const ontologyStateForReturn: OntologyState = {
          sessionMode: "return",
          selectedDrive: state.selectedDrive,
          selectionSource: "archive",
          liveBacklog: state.liveBacklog,
          previousState: {
            reflection_need: state.previousState.reflection_need,
            public_curation_backlog: state.previousState.public_curation_backlog,
            idea_recurrence: state.previousState.idea_recurrence,
            avatar_alignment: state.previousState.avatar_alignment,
          },
          repetitionDetected: false,
          archiveCandidateAvailable: true,
          selectedIdeaId: null,
          proposalCreated: false,
          traceProposalType: null,
        };
        const tensionKinds = deriveTensionKinds(ontologyStateForReturn);
        const candidates: ArchiveCandidateRow[] = archives.map((row) => ({
          project_id: (row.project_id as string | null) ?? null,
          idea_thread_id: (row.idea_thread_id as string | null) ?? null,
          idea_id: (row.idea_id as string | null) ?? null,
          artifact_id: (row.artifact_id as string | null) ?? null,
          recurrence_score: (row.recurrence_score as number | null) ?? null,
          creative_pull: (row.creative_pull as number | null) ?? null,
          created_at: (row.created_at as string | null) ?? null,
        }));
        const result = scoreReturnCandidates(candidates, {
          tensionKinds,
          artifactMediumByArtifactId,
          hasCritiqueByArtifactId,
          nowMs,
        });

        const { tasteByActionKind, payload: tastePayload } = await getTasteBiasMap(supabase);
        const ACTION_KIND_RETURN = "resurface_archive";
        const rankedWithTaste = result.ranked.map((r) => ({
          ...r,
          adjustedScore: applyTasteBias(r.breakdown.return_score, ACTION_KIND_RETURN, tasteByActionKind),
        }));
        rankedWithTaste.sort((a, b) => b.adjustedScore - a.adjustedScore);
        const selectedIndexAfterTaste = rankedWithTaste[0]?.index ?? result.selectedIndex;
        const chosen = archives[selectedIndexAfterTaste];
        const tasteBiasPayload = fillTastePayloadSelected(tastePayload, ACTION_KIND_RETURN);

        if (chosen) {
          selectedProjectId = (chosen.project_id as string | null) ?? null;
          selectedThreadId = (chosen.idea_thread_id as string | null) ?? null;
          selectedIdeaId = (chosen.idea_id as string | null) ?? null;
          selectionSource = "archive";
          decisionSummary = {
            ...decisionSummary,
            project_reason:
              "Return session: selected archive entry via Return Intelligence and trajectory taste bias (tension, recurrence, critique, age, exploration, taste).",
            thread_reason:
              "Thread comes from chosen archive entry with unresolved or paused work.",
            idea_reason: selectedIdeaId
              ? "Selected idea linked to the chosen thread, biased toward higher recurrence and pull when available."
              : "No specific idea was selected; session used project/thread and identity/context only.",
            rejected_alternatives: [
              "Other archive entries had lower adjusted score (return_score + taste bias).",
            ],
          };
          const debugPayload = buildReturnSelectionDebug(
            { ranked: result.ranked, selectedIndex: selectedIndexAfterTaste },
            tensionKinds,
            5
          );
          state = { ...state, returnSelectionDebug: debugPayload, tasteBiasDebug: tasteBiasPayload };
          console.log("[session] selection: return_from_archive", {
            archive_project: selectedProjectId,
            archive_thread: selectedThreadId,
            archive_idea: selectedIdeaId,
            return_intelligence: {
              tensionKinds: debugPayload.tensionKinds,
              selected_score: debugPayload.selected?.breakdown.return_score,
              selected_breakdown: debugPayload.selected?.breakdown,
              top_scores: debugPayload.topCandidates.map((r) => ({
                index: r.index,
                return_score: r.breakdown.return_score,
                tension_alignment: r.breakdown.tension_alignment,
                recurrence_weight: r.breakdown.recurrence_weight,
                critique_weight: r.breakdown.critique_weight,
                age_weight: r.breakdown.age_weight,
                exploration_noise: r.breakdown.exploration_noise,
              })),
            },
            taste_bias: {
              recent_window_size: tasteBiasPayload.recent_window_size,
              taste_by_action_kind: tasteBiasPayload.taste_by_action_kind,
              applied_bias_for_selected: tasteBiasPayload.applied_bias_for_selected,
              selected_action_kind: tasteBiasPayload.selected_action_kind,
              sparse_fallback_used: tasteBiasPayload.sparse_fallback_used,
            },
          });
        }
      }
    }

    if (!selectedProjectId && !selectedThreadId && !selectedIdeaId) {
      const selection = await selectProjectAndThread(supabase);
      selectedProjectId = selection.projectId;
      selectedThreadId = selection.ideaThreadId;
      selectedIdeaId = selection.ideaId;
      selectionSource = "project_thread";
      decisionSummary = {
        ...decisionSummary,
        project_reason:
          "Selected active project via project/thread selection (weighted by thread recurrence and creative pull).",
        thread_reason:
          "Selected active thread for the project, weighted by recurrence_score and creative_pull.",
        idea_reason: selectedIdeaId
          ? "Selected idea linked to the chosen thread, biased toward higher recurrence and pull when available."
          : "No specific idea was selected; session used project/thread and identity/context only.",
        rejected_alternatives: [
          "Other active threads or ideas scored lower on recurrence and creative pull.",
        ],
      };
      if (selectedProjectId || selectedThreadId || selectedIdeaId) {
        console.log("[session] selection: project_thread_idea", {
          project: selectedProjectId,
          thread: selectedThreadId,
          idea: selectedIdeaId,
        });
      }
    }
  }

  return {
    ...state,
    selectedProjectId,
    selectedThreadId,
    selectedIdeaId,
    selectionSource,
    archiveCandidateAvailable,
    decisionSummary,
  };
}

async function buildContexts(state: SessionExecutionState): Promise<SessionExecutionState> {
  const brainContext = await getBrainContext(state.supabase, {
    project_id: state.selectedProjectId ?? null,
  });
  const workingContext = buildIdentityVoiceContext(brainContext);
  let sourceContext = brainContext.sourceSummary ?? "";
  if (
    state.supabase &&
    (state.selectedProjectId || state.selectedThreadId || state.selectedIdeaId)
  ) {
    const focusContext = await getProjectThreadIdeaContext(
      state.supabase,
      state.selectedProjectId,
      state.selectedThreadId,
      state.selectedIdeaId
    );
    if (focusContext) {
      sourceContext = [sourceContext, focusContext].filter(Boolean).join("\n\n");
    }
  }
  return { ...state, brainContext, workingContext, sourceContext };
}

async function runGeneration(state: SessionExecutionState): Promise<SessionExecutionState> {
  const sessionState = {
    ...state.previousState,
    public_curation_backlog: state.liveBacklog,
  };
  const derivedPreferMedium = derivePreferredMedium(
    sessionState,
    state.preferMedium,
    state.isCron
  );
  const pipelineResult = await runSessionPipeline(
    {
      mode: state.sessionMode,
      selectedDrive: state.selectedDrive,
      projectId: state.selectedProjectId ?? undefined,
      ideaThreadId: state.selectedThreadId ?? undefined,
      ideaId: state.selectedIdeaId ?? undefined,
      promptContext: state.promptContext ?? undefined,
      workingContext: state.workingContext || undefined,
      sourceContext: state.sourceContext || undefined,
      preferMedium: (state.preferMedium ?? derivedPreferMedium) ?? undefined,
    },
    { openaiApiKey: process.env.OPENAI_API_KEY ?? undefined }
  );
  const tokensUsed =
    "tokensUsed" in pipelineResult && typeof pipelineResult.tokensUsed === "number"
      ? pipelineResult.tokensUsed
      : undefined;
  if (isOverTokenLimit(tokensUsed)) {
    throw new SessionRunError(400, {
      error: "Token limit exceeded; session aborted.",
      session_id: pipelineResult.session.session_id,
      tokens_used: tokensUsed,
    });
  }
  const maxArtifacts = getMaxArtifactsPerSession();
  const artifacts = pipelineResult.artifacts.slice(0, maxArtifacts);
  let primaryArtifact: Artifact | null = artifacts[0] ?? null;
  if (primaryArtifact && state.supabase && primaryArtifact.medium === "image" && primaryArtifact.content_uri) {
    const storageUrl = await uploadImageToStorage(
      state.supabase,
      primaryArtifact.content_uri,
      pipelineResult.session.session_id,
      primaryArtifact.artifact_id
    );
    if (storageUrl) {
      primaryArtifact = {
        ...primaryArtifact,
        content_uri: storageUrl,
        preview_uri: storageUrl,
      };
    }
  }
  return {
    ...state,
    pipelineResult,
    primaryArtifact,
    derivedPreferMedium,
    tokensUsed,
  };
}

async function runCritiqueAndEvaluation(
  state: SessionExecutionState
): Promise<SessionExecutionState> {
  const artifact = state.primaryArtifact;
  const result = state.pipelineResult;
  if (!artifact || !result) return state;
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
  return { ...state, critique, evaluation };
}

/**
 * Shared internal runner used by both manual POST /api/session/run and cron.
 * Throws SessionRunError on handled failures so callers can map to HTTP.
 */
export async function runSessionInternal(options: SessionRunOptions): Promise<SessionRunSuccessPayload> {
  const { createdBy, isCron, promptContext, preferMedium } = options;
  const supabase = getSupabaseServer();
  let state = initializeExecutionState(options, supabase);
  state = await loadCreativeStateAndBacklog(state);
  state = selectModeAndDrive(state);
  state = await selectFocus(state);
  state = await buildContexts(state);
  state = await runGeneration(state);
  if (!state.primaryArtifact || !state.pipelineResult) {
    return finalizeResult(state);
  }
  state = await runCritiqueAndEvaluation(state);
  if (state.supabase) {
    state = await persistCoreOutputs(state);
    state = await persistDerivedState(state);
    state = await manageProposals(state);
    state = await writeTraceAndDeliberation(state);
    state = await persistTrajectoryReview(state);
  }
  return finalizeResult(state);
}

function finalizeResult(state: SessionExecutionState): SessionRunSuccessPayload {
  const result = state.pipelineResult;
  const artifact = state.primaryArtifact;
  const artifactCount = result ? (result.artifacts ?? []).length : 0;
  const artifactMedium: PreferredMedium | "other" | null =
    artifact && (artifact.medium === "image" || artifact.medium === "writing" || artifact.medium === "concept")
      ? artifact.medium
      : artifact?.medium
        ? "other"
        : null;
  return {
    session_id: result?.session.session_id ?? "",
    artifact_count: artifactCount,
    persisted: Boolean(state.supabase),
    requested_medium: state.derivedPreferMedium ?? undefined,
    artifact_medium: artifactMedium,
    archive_entry_created: state.archiveEntryCreated,
    recurrence_updated: state.recurrenceUpdated,
    proposal_created: state.proposalCreated,
    memory_record_created: state.memoryRecordCreated,
    warnings: state.warnings,
  };
}

async function persistCoreOutputs(state: SessionExecutionState): Promise<SessionExecutionState> {
  const supabase = state.supabase;
  const result = state.pipelineResult;
  const artifact = state.primaryArtifact;
  const critique = state.critique;
  const evaluation = state.evaluation;
  if (!supabase || !result || !artifact || !critique || !evaluation) return state;

  const sessionRow = {
    session_id: result.session.session_id,
    project_id: state.selectedProjectId ?? result.session.project_id,
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

  const artifactRole = inferArtifactRole(artifact.medium, state.isCron);
  const artifactRow = {
    artifact_id: artifact.artifact_id,
    project_id: state.selectedProjectId ?? artifact.project_id,
    session_id: artifact.session_id,
    primary_idea_id: state.selectedIdeaId ?? artifact.primary_idea_id,
    primary_thread_id: state.selectedThreadId ?? artifact.primary_thread_id,
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

  const generationRunRow = {
    session_id: result.session.session_id,
    artifact_id: artifact.artifact_id,
    medium: artifact.medium,
    provider_name: "openai",
    model_name:
      artifact.medium === "image"
        ? (process.env.OPENAI_MODEL_IMAGE ?? "dall-e-3")
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

  return { ...state, repetitionDetected };
}

async function persistDerivedState(state: SessionExecutionState): Promise<SessionExecutionState> {
  const supabase = state.supabase;
  const result = state.pipelineResult;
  const artifact = state.primaryArtifact;
  const critique = state.critique;
  const evaluation = state.evaluation;
  if (!supabase || !result || !artifact || !critique || !evaluation) return state;

  let {
    archiveEntryCreated,
    recurrenceUpdated,
    recurrenceAttempted,
    recurrenceAllSucceeded,
    memoryRecordCreated,
    decisionSummary,
    warnings,
  } = state;

  if (critique.critique_outcome === "archive_candidate") {
    const archiveEntry = createArchiveEntry({
      project_id: state.selectedProjectId ?? artifact.project_id,
      artifact_id: artifact.artifact_id,
      idea_id: state.selectedIdeaId ?? artifact.primary_idea_id,
      idea_thread_id: state.selectedThreadId ?? artifact.primary_thread_id,
      reason_paused: critique.overall_summary?.slice(0, 500) ?? "archive_candidate",
      creative_pull: evaluation.pull_score,
      recurrence_score: evaluation.recurrence_score,
      last_session_id: result.session.session_id,
    });
    const { error: archiveError } = await supabase.from("archive_entry").insert(archiveEntry);
    if (archiveError) {
      const msg = `archive_entry insert failed: ${archiveError.message}`;
      console.warn("[session]", msg, { artifact_id: artifact.artifact_id });
      warnings = [...warnings, msg];
    } else {
      archiveEntryCreated = true;
    }
  }

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
    isReflection: state.sessionMode === "reflect",
    exploredNewMedium:
      !!artifact.medium && recentMediums.length > 0 && !recentMediums.includes(artifact.medium),
    addedUnfinishedWork: critique.critique_outcome === "archive_candidate",
  };
  const nextState = updateCreativeState(state.previousState, evaluation, {
    repetitionDetected: state.repetitionDetected,
    ...sessionSignals,
  });
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
  memoryRecordCreated = true;

  if (state.selectedIdeaId && evaluation.recurrence_score !== null) {
    const { error: ideaRecurrenceError } = await supabase
      .from("idea")
      .update({ recurrence_score: evaluation.recurrence_score, updated_at: new Date().toISOString() })
      .eq("idea_id", state.selectedIdeaId);
    recurrenceAttempted = true;
    if (ideaRecurrenceError) {
      const msg = `recurrence writeback failed for idea ${state.selectedIdeaId}: ${ideaRecurrenceError.message}`;
      console.warn("[session]", msg);
      warnings = [...warnings, msg];
      recurrenceAllSucceeded = false;
    }
  }
  if (state.selectedThreadId && evaluation.recurrence_score !== null) {
    const { error: threadRecurrenceError } = await supabase
      .from("idea_thread")
      .update({ recurrence_score: evaluation.recurrence_score, updated_at: new Date().toISOString() })
      .eq("idea_thread_id", state.selectedThreadId);
    recurrenceAttempted = true;
    if (threadRecurrenceError) {
      const msg = `recurrence writeback failed for idea_thread ${state.selectedThreadId}: ${threadRecurrenceError.message}`;
      console.warn("[session]", msg);
      warnings = [...warnings, msg];
      recurrenceAllSucceeded = false;
    }
  }
  recurrenceUpdated = recurrenceAttempted && recurrenceAllSucceeded;

  const tokensUsedForRecord =
    "tokensUsed" in result && typeof result.tokensUsed === "number" ? result.tokensUsed : 0;
  if (tokensUsedForRecord > 0) await addTokenUsage(supabase, tokensUsedForRecord);

  if (!decisionSummary.next_action) {
    if (state.sessionMode === "return") {
      decisionSummary = {
        ...decisionSummary,
        next_action:
          "Continue exploring or resolving this archived thread or idea in a follow-up session.",
      };
    } else if (artifact.medium === "concept") {
      decisionSummary = {
        ...decisionSummary,
        next_action:
          "Review this concept and decide whether to adjust or create proposals for staging or publication.",
      };
    } else if (artifact.medium === "image") {
      decisionSummary = {
        ...decisionSummary,
        next_action:
          "Review this image for potential avatar or surface use, or archive it if it does not fit current direction.",
      };
    } else {
      decisionSummary = {
        ...decisionSummary,
        next_action:
          "Review this artifact for approval, archiving, or follow-up work depending on evaluation and critique.",
      };
    }
  }

  return {
    ...state,
    archiveEntryCreated,
    recurrenceUpdated,
    recurrenceAttempted,
    recurrenceAllSucceeded,
    memoryRecordCreated,
    decisionSummary,
    warnings,
  };
}

async function manageProposals(state: SessionExecutionState): Promise<SessionExecutionState> {
  const supabase = state.supabase;
  const artifact = state.primaryArtifact;
  const evaluation = state.evaluation;
  const critique = state.critique;
  if (!supabase || !artifact || !evaluation || !critique) return state;

  let { proposalCreated, traceProposalId, traceProposalType, decisionSummary, warnings } = state;

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
        .select("proposal_record_id, proposal_state, created_at")
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
          decisionSummary = {
            ...decisionSummary,
            next_action:
              "Focus on reviewing existing habitat layout proposals before creating new ones (backlog at cap).",
          };
        }
      } else {
        const minimalPayload = buildMinimalHabitatPayloadFromConcept(artifact.title, artifact.summary);
        const validated = validateHabitatPayload(minimalPayload);
        const hasPayload = validated.success;
        const summary = hasPayload
          ? summaryFromHabitatPayload(validated.data)
          : (artifact.summary?.slice(0, 2000) ?? null);

        if (Array.isArray(existingActive) && existingActive.length > 0) {
          const sorted = [...existingActive].sort(
            (a, b) =>
              new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
          );
          const newest = sorted[0];
          const older = sorted.slice(1);
          if (newest) {
            traceProposalId = newest.proposal_record_id as string;
            traceProposalType = "surface";
            const { error: updateProposalError } = await supabase
              .from("proposal_record")
              .update({
                title: artifact.title,
                summary,
                habitat_payload_json: hasPayload ? (validated.data as object) : null,
                updated_at: new Date().toISOString(),
              })
              .eq("proposal_record_id", newest.proposal_record_id);
            if (updateProposalError) {
              const msg = `habitat_layout proposal update failed: ${updateProposalError.message}`;
              console.warn("[session]", msg, { proposal_record_id: newest.proposal_record_id });
              warnings = [...warnings, msg];
            } else {
              proposalCreated = true;
            }

            if (older.length > 0) {
              // System-initiated staling: the runner is refreshing the newest active
              // habitat_layout proposal and retiring superseded older ones. Only
              // proposals for which pending_review/approved_for_staging/staged → archived
              // is a legal FSM transition are updated. This uses the canonical guard to
              // keep the archival path consistent with human-driven governance transitions.
              const legalToArchive = older.filter((o) =>
                isLegalProposalStateTransition(o.proposal_state as string, "archived")
              );
              if (legalToArchive.length > 0) {
                const { error: archiveOlderError } = await supabase
                  .from("proposal_record")
                  .update({
                    proposal_state: "archived",
                    updated_at: new Date().toISOString(),
                  })
                  .in(
                    "proposal_record_id",
                    legalToArchive.map((o) => o.proposal_record_id)
                  );
                if (archiveOlderError) {
                  console.warn("[session] archiving older habitat_layout proposals failed", {
                    error: archiveOlderError.message,
                    count: legalToArchive.length,
                  });
                }
              }
            }
          }
        } else {
          const proposalRow = {
            lane_type: "surface" as const,
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
            created_by: state.createdBy,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const { data: insertedHabitat, error: insertHabitatError } = await supabase
            .from("proposal_record")
            .insert(proposalRow)
            .select("proposal_record_id")
            .single();
          if (insertHabitatError) {
            const msg = `habitat_layout proposal insert failed: ${insertHabitatError.message}`;
            console.warn("[session]", msg, { artifact_id: artifact.artifact_id });
            warnings = [...warnings, msg];
          } else if (insertedHabitat?.proposal_record_id) {
            traceProposalId = insertedHabitat.proposal_record_id as string;
            traceProposalType = "surface";
            proposalCreated = true;
            decisionSummary = {
              ...decisionSummary,
              next_action:
                decisionSummary.next_action ??
                "Create or refine a habitat layout proposal for the staging habitat from this concept.",
            };
          }
        }
      }
    }
  }

  if (artifact.medium === "image") {
    const { data: existingAvatar } = await supabase
      .from("proposal_record")
      .select("proposal_record_id")
      .eq("target_type", "avatar_candidate")
      .eq("artifact_id", artifact.artifact_id)
      .limit(1)
      .maybeSingle();
    if (!existingAvatar) {
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
        const avatarSummary = capSummaryTo200Words(
          artifact.summary ?? artifact.title ?? "Proposed as public avatar."
        );
        const { data: insertedAvatar, error: insertAvatarError } = await supabase
          .from("proposal_record")
          .insert({
            lane_type: "surface",
            target_type: "avatar_candidate",
            target_id: artifact.artifact_id,
            artifact_id: artifact.artifact_id,
            title: artifact.title ?? "Avatar candidate",
            summary: avatarSummary || null,
            proposal_state: "pending_review",
            target_surface: "identity",
            proposal_type: "avatar",
            preview_uri: artifact.preview_uri ?? null,
            review_note: null,
            created_by: state.createdBy,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select("proposal_record_id")
          .single();
        if (insertAvatarError) {
          const msg = `avatar_candidate proposal insert failed: ${insertAvatarError.message}`;
          console.warn("[session]", msg, { artifact_id: artifact.artifact_id });
          warnings = [...warnings, msg];
        } else if (insertedAvatar?.proposal_record_id) {
          traceProposalId = insertedAvatar.proposal_record_id as string;
          traceProposalType = "avatar";
          proposalCreated = true;
          decisionSummary = {
            ...decisionSummary,
            next_action:
              decisionSummary.next_action ??
              "Propose a new avatar candidate for review based on this image.",
          };
        }
      }
    }
  }

  return {
    ...state,
    proposalCreated,
    traceProposalId,
    traceProposalType,
    decisionSummary,
    warnings,
  };
}

async function writeTraceAndDeliberation(
  state: SessionExecutionState
): Promise<SessionExecutionState> {
  const supabase = state.supabase;
  const result = state.pipelineResult;
  const artifact = state.primaryArtifact;
  const critique = state.critique;
  if (!supabase || !result || !artifact || !critique) return state;

  const runtimeConfig = await getRuntimeConfig(supabase);
  const metabolismMode = runtimeConfig.mode;
  const ontologyState: OntologyState = {
    sessionMode: state.sessionMode,
    selectedDrive: state.selectedDrive,
    selectionSource: state.selectionSource,
    liveBacklog: state.liveBacklog,
    previousState: {
      reflection_need: state.previousState.reflection_need,
      public_curation_backlog: state.previousState.public_curation_backlog,
      idea_recurrence: state.previousState.idea_recurrence,
      avatar_alignment: state.previousState.avatar_alignment,
    },
    repetitionDetected: state.repetitionDetected,
    archiveCandidateAvailable: state.archiveCandidateAvailable,
    selectedIdeaId: state.selectedIdeaId,
    proposalCreated: state.proposalCreated,
    traceProposalType: state.traceProposalType,
  };
  const narrativeState = classifyNarrativeState(ontologyState);
  const confidenceBand = classifyConfidenceBand(state.decisionSummary.confidence);
  const actionKind = classifyActionKind(ontologyState);
  const traceLabels = await getProjectThreadIdeaTraceLabels(
    supabase,
    state.selectedProjectId,
    state.selectedThreadId,
    state.selectedIdeaId
  );
  const generationRunRow = {
    model_name:
      artifact.medium === "image"
        ? (process.env.OPENAI_MODEL_IMAGE ?? "dall-e-3")
        : artifact.medium === "concept"
          ? (process.env.OPENAI_MODEL_CONCEPT ??
            process.env.OPENAI_MODEL_GENERATION ??
            process.env.OPENAI_MODEL ??
            "gpt-4o-mini")
          : (process.env.OPENAI_MODEL_GENERATION ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
  };
  const trace = {
    mode: metabolismMode,
    drive: state.selectedDrive ?? null,
    project_id: state.selectedProjectId ?? null,
    project_name: traceLabels.project_name ?? null,
    idea_thread_id: state.selectedThreadId ?? null,
    thread_name: traceLabels.thread_name ?? null,
    idea_id: state.selectedIdeaId ?? null,
    idea_summary: traceLabels.idea_summary ?? null,
    artifact_id: artifact.artifact_id,
    proposal_id: state.traceProposalId,
    proposal_type: state.traceProposalType,
    tokens_used: state.tokensUsed ?? null,
    generation_model: generationRunRow.model_name,
    start_time: result.session.started_at,
    end_time: result.session.ended_at ?? new Date().toISOString(),
  };
  const { error: traceUpdateError } = await supabase
    .from("creative_session")
    .update({
      trace,
      decision_summary: state.decisionSummary,
      updated_at: new Date().toISOString(),
    })
    .eq("session_id", result.session.session_id);
  if (traceUpdateError) {
    const msg = `session trace update failed: ${traceUpdateError.message}`;
    console.warn("[session]", msg, { session_id: result.session.session_id });
    state = { ...state, warnings: [...state.warnings, msg] };
  }

  const outcomeSummary = [
    artifact.title,
    artifact.summary?.slice(0, 200),
    critique.overall_summary?.slice(0, 300),
  ]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 2000) || "Session completed.";

  const selectionReason =
    state.selectionSource === "archive"
      ? "archive_return_due_to_mode"
      : state.selectionSource === "project_thread"
        ? "project_thread_default"
        : "explicit_preference";

  try {
    await writeDeliberationTrace({
      supabase,
      session_id: result.session.session_id,
      observations_json: {
        session_mode: state.sessionMode,
        selected_drive: state.selectedDrive,
        selection_source: state.selectionSource,
        metabolism_mode: metabolismMode,
        narrative_state: narrativeState,
      },
      state_summary: `mode=${state.sessionMode}, drive=${state.selectedDrive ?? "none"}, public_curation_backlog=${state.liveBacklog}, narrative_state=${narrativeState}`,
      tensions_json: {
        archive_candidates: state.archiveCandidateAvailable,
        public_curation_backlog: state.liveBacklog,
        tension_kinds: deriveTensionKinds(ontologyState),
      },
      hypotheses_json: {
        selection_reason: selectionReason,
        next_action_reason: "derived_from_decision_summary",
        action_kind: actionKind,
        confidence_band: confidenceBand,
      },
      evidence_checked_json: {
        selected_project_id: state.selectedProjectId,
        selected_thread_id: state.selectedThreadId,
        selected_idea_id: state.selectedIdeaId,
        selection_source: state.selectionSource,
        archive_candidate_available: state.archiveCandidateAvailable,
        public_curation_backlog: state.liveBacklog,
        selected_drive: state.selectedDrive,
        session_mode: state.sessionMode,
        evidence_kinds: deriveEvidenceKinds(ontologyState),
      },
      rejected_alternatives_json: {
        items: state.decisionSummary.rejected_alternatives,
      },
      chosen_action: state.decisionSummary.next_action,
      confidence: state.decisionSummary.confidence,
      execution_mode: state.executionMode,
      human_gate_reason: state.humanGateReason,
      outcome_summary: outcomeSummary,
    });
  } catch (e) {
    const msg = `deliberation_trace insert failed: ${
      e instanceof Error ? e.message : String(e)
    }`;
    console.warn("[session]", msg, { session_id: result.session.session_id });
    state = { ...state, warnings: [...state.warnings, msg] };
  }

  return { ...state, metabolismMode };
}

/**
 * Persist one trajectory_review row (post-session diagnostic). Inserted after
 * writeTraceAndDeliberation, before finalizeResult. Does not fail the session
 * on insert failure — appends a warning and returns state unchanged.
 * Governance, proposal FSMs, and public mutation behavior are unchanged.
 */
async function persistTrajectoryReview(
  state: SessionExecutionState
): Promise<SessionExecutionState> {
  const supabase = state.supabase;
  const result = state.pipelineResult;
  const artifact = state.primaryArtifact;
  const critique = state.critique;
  if (!supabase || !result || !artifact || !critique) return state;

  const ontologyState: OntologyState = {
    sessionMode: state.sessionMode,
    selectedDrive: state.selectedDrive,
    selectionSource: state.selectionSource,
    liveBacklog: state.liveBacklog,
    previousState: {
      reflection_need: state.previousState.reflection_need,
      public_curation_backlog: state.previousState.public_curation_backlog,
      idea_recurrence: state.previousState.idea_recurrence,
      avatar_alignment: state.previousState.avatar_alignment,
    },
    repetitionDetected: state.repetitionDetected,
    archiveCandidateAvailable: state.archiveCandidateAvailable,
    selectedIdeaId: state.selectedIdeaId,
    proposalCreated: state.proposalCreated,
    traceProposalType: state.traceProposalType,
  };
  const narrativeState = classifyNarrativeState(ontologyState);
  const actionKind = classifyActionKind(ontologyState);

  let deliberationTraceId: string | null = null;
  const { data: traceRow } = await supabase
    .from("deliberation_trace")
    .select("deliberation_trace_id")
    .eq("session_id", result.session.session_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (traceRow?.deliberation_trace_id) {
    deliberationTraceId = traceRow.deliberation_trace_id as string;
  }

  const input = {
    narrative_state: narrativeState,
    action_kind: actionKind,
    confidence: state.decisionSummary.confidence,
    proposal_created: state.proposalCreated,
    repetition_detected: state.repetitionDetected,
    has_artifact: true,
    has_critique: true,
    has_evaluation: Boolean(state.evaluation),
    memory_record_created: state.memoryRecordCreated,
    archive_entry_created: state.archiveEntryCreated,
    live_backlog: state.liveBacklog,
    selection_source: state.selectionSource,
    execution_mode: state.executionMode,
    previous_curation_backlog: state.previousState.public_curation_backlog,
    previous_reflection_need: state.previousState.reflection_need,
    previous_avatar_alignment: state.previousState.avatar_alignment,
  };

  const row = deriveTrajectoryReview(
    result.session.session_id,
    deliberationTraceId,
    input
  );

  const { error } = await supabase.from("trajectory_review").insert({
    ...row,
    created_at: new Date().toISOString(),
  });
  if (error) {
    const msg = `trajectory_review insert failed: ${error.message}`;
    console.warn("[session]", msg, { session_id: result.session.session_id });
    return { ...state, warnings: [...state.warnings, msg] };
  }
  return state;
}

