import type { SupabaseClient } from "@supabase/supabase-js";
import { runSessionPipeline, createDefaultMediumRegistry } from "@twin/agent";
import type { SessionPipelineResult } from "@twin/agent";
import type {
  FallbackReason,
  ResolutionSource,
  MediumFit,
  ExtensionClassification,
  MissingCapabilityKey,
} from "@twin/mediums";
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
import { computeStyleProfile, type StyleAnalysisInput } from "@/lib/style-profile";
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
  getMaxPendingExtensionProposals,
  getMaxPendingHabitatLayoutProposals,
  isOverTokenLimit,
  getArchiveDecayHalfLifeDays,
} from "@/lib/stop-limits";
import { detectRepetition } from "@/lib/repetition-detection";
import * as runtimeConfigModule from "@/lib/runtime-config";
import {
  classifyProposalLane,
  canCreateProposal,
  canTransitionProposalState,
  evaluateGovernanceGate,
  getProposalAuthority,
} from "@/lib/proposal-governance";
import { buildConceptFamilies } from "@/lib/proposal-families";
import { evaluateProposalRelationship, type ProposalForRelationship } from "@/lib/proposal-relationship";
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
import { getRuntimeStatePayload } from "@/lib/runtime-state-api";
import { getSynthesisPressure, type SynthesisPressurePayload } from "@/lib/synthesis-pressure";
import {
  getActiveIntent,
  updateSessionIntent,
  type ActiveIntent,
  type IntentUpdateInput,
} from "@/lib/session-intent";
import {
  getSessionContinuityTimeline,
  computeSessionClusteringSummary,
} from "@/lib/runtime-state-api";
import { deriveThoughtMapSummary } from "@/lib/runtime-thought-map";
import {
  getTrajectoryFeedback,
  type TrajectoryFeedbackResult,
  type TrajectoryFeedbackContext,
} from "@/lib/trajectory-feedback-adapter";

function buildIntentUpdateInput(state: SessionExecutionState): IntentUpdateInput | null {
  const result = state.pipelineResult;
  if (!result) return null;
  return {
    sessionId: result.session.session_id,
    sessionMode: state.sessionMode,
    selectedProjectId: state.selectedProjectId,
    selectedThreadId: state.selectedThreadId,
    selectedIdeaId: state.selectedIdeaId,
    confidence: state.decisionSummary.confidence,
    repetitionDetected: state.repetitionDetected,
    proposalCreated: state.proposalCreated,
    recurrenceUpdated: state.recurrenceUpdated,
    returnSuccessTrend: state.synthesisPressure?.components?.return_success_trend,
    repetitionPenalty: state.synthesisPressure?.components?.repetition_without_movement_penalty,
    // Feed-forward from trajectory review: recommended action for the next session's intent.
    recommendedNextActionKind: state.trajectoryReviewRecommendedAction ?? null,
  };
}
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

/** Neutral evaluation signal for no-artifact sessions. Used so updateCreativeState can apply session-type signals (e.g. isReflection) while keeping score deltas minimal. */
function neutralEvaluationSignalForNoArtifact(sessionId: string): EvaluationSignal {
  const now = new Date().toISOString();
  return {
    evaluation_signal_id: crypto.randomUUID(),
    target_type: "session",
    target_id: sessionId,
    alignment_score: 0.5,
    emergence_score: 0.5,
    fertility_score: 0.5,
    pull_score: 0.5,
    recurrence_score: 0.2,
    resonance_score: 0.5,
    rationale: "no-artifact session; neutral signal for state evolution",
    created_at: now,
    updated_at: now,
  };
}

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
  requested_medium?: PreferredMedium | string | null;
  executed_medium?: string | null;
  fallback_reason?: FallbackReason | null;
  resolution_source?: ResolutionSource | null;
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
  /** Set when orchestrator should stop running more sessions this wake (cron batch). */
  guardrail_stop?: "no_eligible_work" | "repetition" | "low_confidence" | "governance_gate" | null;
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
  /** Why a proposal was or wasn't created this run: created | updated | skipped_cap | skipped_ineligible | skipped_rejected_archived. Null when no proposal path ran. */
  proposalOutcome: string | null;
  decisionSummary: DecisionSummary;
  warnings: string[];
  executionMode: "auto" | "proposal_only" | "human_required";
  humanGateReason: string | null;
  /** For deliberation: runtime metabolism mode (e.g. cron vs manual). */
  metabolismMode: string;
  /** Explicit preferMedium from options (overrides derived when set). */
  preferMedium: PreferredMedium | null;
  promptContext: string | null;
  /** Requested medium (derivation or explicit). One per generation (invariant). */
  requested_medium: string | null;
  /** Executed medium (resolved via registry; fallback to writing when not executable). */
  executed_medium: string | null;
  /** Set when requested_medium !== executed_medium (invariant). */
  fallback_reason: FallbackReason | null;
  /** How executed_medium was chosen (derivation | fallback_rule | registry_constraint | manual_override). */
  resolution_source: ResolutionSource | null;
  /** Phase 2: capability-fit from critique (supported | partial | unsupported). */
  medium_fit: MediumFit | null;
  /** Phase 2: from capability-fit when partial/unsupported (MissingCapabilityKey union). */
  missing_capability: MissingCapabilityKey;
  /** Phase 2: closed enum; set when partial/unsupported, null when supported. */
  extension_classification: ExtensionClassification | null;
  /** Phase 2: "inferred" when confidence from critique/evaluation, "defaulted" when placeholder. */
  confidence_truth: "inferred" | "defaulted" | null;
  /** Debug score breakdown for return-mode archive selection (focus-selection only). */
  returnSelectionDebug?: {
    selected: RankedCandidate | null;
    topCandidates: RankedCandidate[];
    tensionKinds: string[];
  } | null;
  /** Debug for trajectory taste bias (soft action-scoring preference). */
  tasteBiasDebug?: TasteBiasPayload | null;
  /** True when a fallback reflection_note artifact was persisted for an otherwise artifactless session. */
  reflectionArtifactCreated?: boolean;
  /** Synthesis pressure from trajectory (for mode/drive soft bias). Set in loadCreativeStateAndBacklog when supabase is non-null. */
  synthesisPressure?: SynthesisPressurePayload | null;
  /** Active session intent (continuity layer). Set in loadCreativeStateAndBacklog when supabase is non-null. */
  activeIntent?: ActiveIntent | null;
  /** Trajectory advisory (one bounded signal). Set in loadCreativeStateAndBacklog; may nudge mode via reflection_need in selectModeAndDrive. */
  trajectoryAdvisory?: {
    feedback: TrajectoryFeedbackResult;
    interpretation_confidence: "low" | "medium" | "high";
  } | null;
  /** Governance evidence for this session's proposal decision (when applicable). */
  governanceEvidence?: {
    lane_type: "surface" | "medium" | "system";
    classification_reason: string;
    actor_authority: "runner" | "human" | "reviewer" | "unknown";
    reason_codes: string[];
  } | null;
  /**
   * Feed-forward from trajectory review: recommended next action kind from the current session's
   * trajectory review row. Read by buildIntentUpdateInput and forwarded to updateSessionIntent
   * so the next-session intent can be seeded with the review's recommendation.
   * Set by persistTrajectoryReview; null when no recommendation was produced.
   */
  trajectoryReviewRecommendedAction?: string | null;
}

/**
 * Lightweight classification for artifact role.
 * Phase 1/3: medium-specific branches here and in manageProposals, persistDerivedState, trace, image upload
 * remain intentional per plan. Plugin metadata (proposalRole, canPropose) is reserved for later; not
 * authoritative in Phase 3 — do not add new medium branches; new behavior belongs in plugins or registry.
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
    proposalOutcome: null,
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
    reflectionArtifactCreated: false,
    requested_medium: null,
    executed_medium: null,
    fallback_reason: null,
    resolution_source: null,
    medium_fit: null,
    missing_capability: null,
    extension_classification: null,
    confidence_truth: null,
  };
}

async function loadCreativeStateAndBacklog(
  state: SessionExecutionState
): Promise<SessionExecutionState> {
  const { state: previousState } = await getLatestCreativeState(state.supabase);
  const liveBacklog = await computePublicCurationBacklog(state.supabase);
  const synthesisPressure =
    state.supabase != null ? await getSynthesisPressure(state.supabase) : null;
  const activeIntent =
    state.supabase != null ? await getActiveIntent(state.supabase) : null;

  let trajectoryAdvisory: SessionExecutionState["trajectoryAdvisory"] = null;
  if (state.supabase) {
    try {
      const { rows, clustering_summary } = await getSessionContinuityTimeline(state.supabase, 30);
      if (rows.length > 0 && clustering_summary) {
        const thoughtMap = deriveThoughtMapSummary(rows, clustering_summary);
        const context: TrajectoryFeedbackContext = {
          session_posture: thoughtMap.session_posture,
          thread_repeat_rate: thoughtMap.thread_repeat_rate,
          longest_thread_streak: thoughtMap.longest_thread_streak,
          trajectory_shape: thoughtMap.trajectory_shape,
          exploration_vs_consolidation: thoughtMap.exploration_vs_consolidation,
          window_sessions: thoughtMap.window_sessions,
          proposals_last_10_sessions: thoughtMap.proposal_activity_summary.proposals_last_10_sessions,
          interpretation_confidence: thoughtMap.interpretation_confidence,
        };
        const feedback = getTrajectoryFeedback(context);
        trajectoryAdvisory = {
          feedback,
          interpretation_confidence: thoughtMap.interpretation_confidence,
        };
      }
    } catch (e) {
      console.warn("[session-runner] trajectory advisory fetch failed (using neutral)", e);
    }
  }

  return {
    ...state,
    previousState,
    liveBacklog,
    synthesisPressure: synthesisPressure ?? undefined,
    activeIntent: activeIntent ?? undefined,
    trajectoryAdvisory: trajectoryAdvisory ?? undefined,
  };
}

function selectModeAndDrive(state: SessionExecutionState): SessionExecutionState {
  let sessionState: CreativeStateFields = { ...state.previousState, public_curation_backlog: state.liveBacklog };
  // Step 2 (loop closure): soft trajectory bias — low return_success_trend or high repetition penalty nudges reflection_need.
  if (state.synthesisPressure?.components) {
    const { return_success_trend, repetition_without_movement_penalty } = state.synthesisPressure.components;
    const reflectionBias =
      0.08 * (1 - Math.max(0, return_success_trend)) + 0.05 * Math.min(1, repetition_without_movement_penalty);
    sessionState = {
      ...sessionState,
      reflection_need: Math.min(1, Math.max(0, sessionState.reflection_need + reflectionBias)),
    };
  }
  // Intent continuity: soft bias from active intent (never hard override).
  if (state.activeIntent) {
    const k = state.activeIntent.intent_kind;
    if (k === "reflect") {
      sessionState = {
        ...sessionState,
        reflection_need: Math.min(1, sessionState.reflection_need + 0.06),
      };
    } else if (k === "refine" || k === "consolidate") {
      sessionState = {
        ...sessionState,
        recent_exploration_rate: Math.max(0, sessionState.recent_exploration_rate - 0.05),
      };
    }
  }
  // Stage-2 trajectory signal A: repetition advisory → small reflection_need nudge (gated on sufficient confidence).
  const TRAJECTORY_REFLECTION_NUDGE = 0.06;
  const adv = state.trajectoryAdvisory;
  if (adv?.feedback.gently_reduce_repetition && adv.interpretation_confidence !== "low") {
    sessionState = {
      ...sessionState,
      reflection_need: Math.min(1, Math.max(0, sessionState.reflection_need + TRAJECTORY_REFLECTION_NUDGE)),
    };
    console.log("[session] trajectory_advisory applied", {
      source: "trajectory_feedback",
      signal: "gently_reduce_repetition",
      applied: true,
      effect: `reflection_need +${TRAJECTORY_REFLECTION_NUDGE}`,
      confidence: adv.interpretation_confidence,
      reason: adv.feedback.reason,
    });
  } else if (adv && adv.feedback.gently_reduce_repetition && adv.interpretation_confidence === "low") {
    console.log("[session] trajectory_advisory skipped (low confidence)", {
      source: "trajectory_feedback",
      signal: "gently_reduce_repetition",
      applied: false,
      reason: "interpretation_confidence is low; neutral fallback",
    });
  }
  // Stage-2 trajectory signal B: consolidation advisory → small recent_exploration_rate reduction.
  // Fires when trajectory shows exploration-heavy posture with a large proposal backlog or
  // consolidating posture in a clustered window. Bounded nudge; never a hard override.
  const TRAJECTORY_CONSOLIDATION_NUDGE_LIGHT = 0.05;
  const TRAJECTORY_CONSOLIDATION_NUDGE_STRONG = 0.10;
  const consolidationSignal = adv?.feedback.favor_consolidation;
  if (consolidationSignal && consolidationSignal !== "none" && adv?.interpretation_confidence !== "low") {
    const nudge =
      consolidationSignal === "strong"
        ? TRAJECTORY_CONSOLIDATION_NUDGE_STRONG
        : TRAJECTORY_CONSOLIDATION_NUDGE_LIGHT;
    sessionState = {
      ...sessionState,
      recent_exploration_rate: Math.max(0, sessionState.recent_exploration_rate - nudge),
    };
    console.log("[session] trajectory_advisory applied", {
      source: "trajectory_feedback",
      signal: "favor_consolidation",
      applied: true,
      favor_consolidation: consolidationSignal,
      effect: `recent_exploration_rate -${nudge}`,
      confidence: adv.interpretation_confidence,
      reason: adv.feedback.reason,
    });
  } else if (consolidationSignal && consolidationSignal !== "none") {
    console.log("[session] trajectory_advisory skipped (low confidence)", {
      source: "trajectory_feedback",
      signal: "favor_consolidation",
      applied: false,
      reason: "interpretation_confidence is low; neutral fallback",
    });
  }
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
      const intentBias =
        state.activeIntent?.target_project_id || state.activeIntent?.target_thread_id
          ? {
              projectId: state.activeIntent.target_project_id ?? undefined,
              threadId: state.activeIntent.target_thread_id ?? undefined,
            }
          : null;
      const selection = await selectProjectAndThread(supabase, intentBias);
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
          continuity_trace: {
            thread_recurrence_score: selection.selectedThreadRecurrenceScore ?? null,
            thread_creative_pull: selection.selectedThreadCreativePull ?? null,
            idea_recurrence_score: selection.selectedIdeaRecurrenceScore ?? null,
            idea_creative_pull: selection.selectedIdeaCreativePull ?? null,
          },
          continuity: "weighted by idea_thread/idea recurrence_score and creative_pull (see CONTINUITY_RECURRENCE_AUDIT.md)",
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
  let workingContext = buildIdentityVoiceContext(brainContext);
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

  if (state.supabase) {
    const styleWindowSize = 40;
    const [styleArtifactsRes, styleProposalsRes] = await Promise.all([
      state.supabase
        .from("artifact")
        .select("title, summary, content_text")
        .order("created_at", { ascending: false })
        .limit(styleWindowSize),
      state.supabase
        .from("proposal_record")
        .select("title, summary")
        .order("created_at", { ascending: false })
        .limit(styleWindowSize),
    ]);
    const styleInputs: StyleAnalysisInput[] = [];
    for (const a of (styleArtifactsRes.data ?? []) as Array<{
      title?: string | null;
      summary?: string | null;
      content_text?: string | null;
    }>) {
      styleInputs.push({
        title: a.title ?? null,
        summary: a.summary ?? null,
        text: a.content_text ?? null,
      });
    }
    for (const p of (styleProposalsRes.data ?? []) as Array<{
      title?: string | null;
      summary?: string | null;
    }>) {
      styleInputs.push({
        title: p.title ?? null,
        summary: p.summary ?? null,
        text: null,
      });
    }
    const {
      profile,
      pressureExplanation,
      repeatedTitles,
    } = computeStyleProfile(styleInputs);
    if (
      profile.dominant.length > 0 ||
      profile.emerging.length > 0 ||
      profile.suppressed.length > 0 ||
      repeatedTitles.length > 0
    ) {
      const lines: string[] = [];
      lines.push("Recent aesthetic style tendencies (soft guidance, not a hard rule):");
      if (profile.dominant.length > 0) {
        lines.push(`- Dominant styles: ${profile.dominant.join(", ")}.`);
      }
      if (profile.emerging.length > 0) {
        lines.push(`- Emerging styles to explore: ${profile.emerging.join(", ")}.`);
      }
      if (profile.suppressed.length > 0) {
        lines.push(`- Suppressed styles: ${profile.suppressed.join(", ")}.`);
      }
      lines.push(`- Style pressure: ${profile.pressure} (${pressureExplanation}).`);
      if (repeatedTitles.length > 0) {
        lines.push(
          `- Avoid reusing exact recent titles or phrases such as: ${repeatedTitles
            .slice(0, 3)
            .map((t) => `"${t}"`)
            .join(", ")}.`
        );
      }
      lines.push(
        "When framing new concepts or proposals, gently favor dominant styles, give emerging styles a small exploration bonus, and avoid copy-pasting titles verbatim."
      );
      const styleBlock = lines.join("\n");
      workingContext = [workingContext, styleBlock].filter(Boolean).join("\n\n");
    }

    // Soft trajectory guidance: fetch current runtime trajectory and surface as advisory context only.
    const runtimePayload = await getRuntimeStatePayload(state.supabase);
    const trajectory = (runtimePayload as Record<string, any>).trajectory as
      | { mode: string; horizon_sessions: number; reason: string; focus_bias?: string[]; style_direction?: string; proposal_pressure?: string }
      | null
      | undefined;
    if (trajectory) {
      const lines: string[] = [];
      lines.push("Runtime trajectory (directional guidance for this session; do not override governance or safety):");
      lines.push(`- Mode: ${trajectory.mode} (horizon ~${trajectory.horizon_sessions} sessions).`);
      if (trajectory.style_direction) {
        lines.push(`- Style direction: ${trajectory.style_direction}.`);
      }
      if (trajectory.proposal_pressure) {
        lines.push(`- Proposal pressure: ${trajectory.proposal_pressure}.`);
      }
      if (Array.isArray(trajectory.focus_bias) && trajectory.focus_bias.length > 0) {
        lines.push("- Focus instincts:");
        for (const item of trajectory.focus_bias) {
          lines.push(`  • ${item}`);
        }
      }
      lines.push(
        "Interpret this as a soft steering signal when choosing between valid paths. Never skip required critique, governance gates, or safety checks because of trajectory."
      );
      const trajectoryBlock = lines.join("\n");
      workingContext = [workingContext, trajectoryBlock].filter(Boolean).join("\n\n");
    }
  }

  return { ...state, brainContext, workingContext, sourceContext };
}

/** Temporary global fallback when requested medium is not executable. Long-term: plugin-defined fallback, registry default, or derivation retry. */
const FALLBACK_MEDIUM = "writing" as const;

/**
 * Resolution rules (truthfulness):
 * - derivation: runtime chose requested_medium via derivePreferredMedium (no explicit caller preference).
 * - manual_override: caller/operator explicitly forced preferMedium (e.g. API body or cron config).
 * - registry_constraint: registry prevented executing requested; fallback was applied.
 * - fallback_rule: (future) could denote how the replacement was chosen when distinct from registry_constraint.
 *
 * Exported for tests (resolution matrix, trace integrity).
 */
export function resolveExecutedMedium(
  registry: ReturnType<typeof createDefaultMediumRegistry>,
  /** Requested medium id (e.g. writing | concept | image | null, or unknown string for tests). */
  requested: string | null,
  /** True only when caller explicitly set preferMedium (e.g. API/cron), not when derived. */
  wasRequestedExplicit: boolean
): {
  executed_medium: string;
  fallback_reason: FallbackReason | null;
  resolution_source: ResolutionSource;
} {
  const effectiveRequested = requested ?? FALLBACK_MEDIUM;
  if (registry.isExecutable(effectiveRequested)) {
    return {
      executed_medium: effectiveRequested,
      fallback_reason: null,
      resolution_source: wasRequestedExplicit ? "manual_override" : "derivation",
    };
  }
  const plugin = registry.get(effectiveRequested);
  const fallback_reason: FallbackReason = !plugin
    ? "unregistered"
    : plugin.status === "proposal_only"
      ? "proposal_only"
      : plugin.status === "disabled"
        ? "disabled"
        : "missing_capability";
  return {
    executed_medium: FALLBACK_MEDIUM,
    fallback_reason,
    resolution_source: "registry_constraint",
  };
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
  const requested_medium = state.preferMedium ?? derivedPreferMedium;
  const registry = createDefaultMediumRegistry();
  const wasRequestedExplicit = state.preferMedium != null;
  const { executed_medium, fallback_reason, resolution_source } = resolveExecutedMedium(
    registry,
    requested_medium,
    wasRequestedExplicit
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
    {
      openaiApiKey: process.env.OPENAI_API_KEY ?? undefined,
      registry,
      executed_medium,
    }
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
    requested_medium: requested_medium ?? null,
    executed_medium,
    fallback_reason,
    resolution_source,
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
 * Phase 2: Classify capability-fit from critique (medium_fit_note, critique_outcome).
 * Sets medium_fit, missing_capability (MissingCapabilityKey union), extension_classification.
 * Descriptive only; no extension proposals created.
 *
 * Heuristic: unsupported = outcome "stop" (hard stop) OR (outcome "archive_candidate" AND note
 * suggests medium/body mismatch). archive_candidate alone can mean "low value / not worth continuing"
 * rather than wrong medium, so we only treat it as unsupported when the note supports that.
 * extension_classification may remain null even when medium_fit is partial/unsupported if the
 * critique does not support a trustworthy classification — bad classification is worse than null.
 */
export function applyCapabilityFit(state: SessionExecutionState): SessionExecutionState {
  const critique = state.critique;
  if (!critique) {
    return { ...state, medium_fit: null, missing_capability: null, extension_classification: null };
  }

  const note = (critique.medium_fit_note ?? "").toLowerCase();
  const outcome = (critique.critique_outcome ?? "continue").toLowerCase();

  const noteSuggestsMediumMismatch =
    /\b(poor fit|wrong medium|doesn't fit|ill.?suited|misaligned|better as|should be .* instead)\b/.test(note) ||
    /\b(interactive|stateful|dynamic|runtime)\b/.test(note);

  let medium_fit: MediumFit = "supported";
  if (outcome === "stop") {
    medium_fit = "unsupported";
  } else if (outcome === "archive_candidate" && noteSuggestsMediumMismatch) {
    medium_fit = "unsupported";
  } else if (outcome === "archive_candidate") {
    medium_fit = "partial"; // low value / not worth continuing, not necessarily wrong medium
  } else if (outcome === "shift_medium" || outcome === "reflect") {
    medium_fit = "partial";
  } else if (noteSuggestsMediumMismatch) {
    medium_fit = "partial";
  }

  let missing_capability_out: MissingCapabilityKey = null;
  if (medium_fit !== "supported") {
    if (/\binteractive\b/.test(note)) missing_capability_out = "interactive_ui";
    else if (/\bstateful\b|\bdynamic\b/.test(note)) missing_capability_out = "stateful_surface";
  }

  // extension_classification: when partial/unsupported, infer from note or leave null. Null is valid
  // when evidence does not support a trustworthy classification.
  let extension_classification: ExtensionClassification = null;
  if (medium_fit !== "supported") {
    if (/\binteractive\b|\bstateful\b|\bsurface\b/.test(note)) extension_classification = "surface_environment_extension";
    else if (/\bmedium\b|\bformat\b/.test(note)) extension_classification = "medium_extension";
    else if (/\bworkflow\b|\bpipeline\b/.test(note)) extension_classification = "workflow_extension";
    else if (/\btool\b|\btoolchain\b/.test(note)) extension_classification = "toolchain_extension";
  }

  return {
    ...state,
    medium_fit,
    missing_capability: missing_capability_out,
    extension_classification,
  };
}

/**
 * Phase 2: Derive confidence from evaluation/critique and set confidence_truth.
 * When we have evaluation scores, use mean of alignment and pull; else leave default and mark defaulted.
 * Exported for tests.
 */
export function applyConfidenceFromCritique(state: SessionExecutionState): SessionExecutionState {
  const evaluation = state.evaluation;
  const decisionSummary = state.decisionSummary;
  if (!evaluation) {
    return {
      ...state,
      confidence_truth: "defaulted",
      decisionSummary: { ...decisionSummary, confidence: decisionSummary.confidence },
    };
  }
  const alignment = evaluation.alignment_score ?? 0.5;
  const pull = evaluation.pull_score ?? 0.5;
  const confidence = Math.round(((alignment + pull) / 2) * 100) / 100;
  const clamped = Math.max(0, Math.min(1, confidence));
  return {
    ...state,
    confidence_truth: "inferred",
    decisionSummary: { ...decisionSummary, confidence: clamped },
  };
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
    // Cron-triggered sessions that would otherwise leave no artifact: persist session + reflection_note artifact.
    if (state.supabase && state.pipelineResult && state.isCron) {
      state = await persistSessionAndReflectionArtifact(state);
    }
    // Every session leaves a trace: minimal trace for no-artifact (update or insert).
    if (state.supabase && state.pipelineResult) {
      state = await persistMinimalSessionTrace(state);
    }
    // Still attempt trajectory review for no-artifact sessions when persistence exists.
    if (state.supabase && state.pipelineResult) {
      const supabase = state.supabase;
      state = await persistTrajectoryReview(state);
      // Intent continuity: update or create active intent after trajectory review.
      const intentInput = buildIntentUpdateInput(state);
      if (intentInput) {
        await updateSessionIntent(supabase, intentInput, state.activeIntent ?? null);
      }
      // Step 1 (loop closure): persist creative_state_snapshot so next session sees updated state.
      // Same canonical contract as artifact path: evolve state then persist via stateToSnapshotRow.
      // No-artifact evolution: neutral evaluation + session-type signals (e.g. reflect reduces reflection_need).
      // Architecture closure: next session's state load must not go stale when previous run produced no primary artifact.
      const sessionIdForSnapshot = state.pipelineResult?.session?.session_id;
      if (!sessionIdForSnapshot) {
        console.warn("[session] no-artifact path: skipping creative_state_snapshot insert (no session_id)");
      } else {
        const noArtifactEval = neutralEvaluationSignalForNoArtifact(sessionIdForSnapshot);
        const noArtifactNextState = updateCreativeState(state.previousState, noArtifactEval, {
          isReflection: state.sessionMode === "reflect",
          repetitionDetected: state.repetitionDetected ?? false,
        });
        const noArtifactSnapshotRow = stateToSnapshotRow(noArtifactNextState, sessionIdForSnapshot, "no-artifact session; neutral signal for state evolution");
        const { error: noArtifactStateError } = await supabase
          .from("creative_state_snapshot")
          .insert(noArtifactSnapshotRow);
        if (noArtifactStateError) {
          throw new SessionRunError(500, {
            error: `No-artifact state snapshot insert failed: ${noArtifactStateError.message}`,
          });
        }
        console.log("[session] no_artifact_state_snapshot_persisted", {
          session_id: sessionIdForSnapshot,
          session_mode: state.sessionMode,
          snapshot_id: noArtifactSnapshotRow.state_snapshot_id,
          is_reflection: state.sessionMode === "reflect",
        });
      }
    }
    return finalizeResult(state);
  }
  state = await runCritiqueAndEvaluation(state);
  state = applyCapabilityFit(state);
  state = applyConfidenceFromCritique(state);
  if (state.supabase) {
    state = await persistCoreOutputs(state);
    state = await persistDerivedState(state);
    state = await manageProposals(state);
    state = await writeTraceAndDeliberation(state);
    state = await persistTrajectoryReview(state);
    // Intent continuity: update or create active intent after trajectory review.
    const intentInput = buildIntentUpdateInput(state);
    if (intentInput) {
      await updateSessionIntent(state.supabase, intentInput, state.activeIntent ?? null);
    }
  }
  return finalizeResult(state);
}

/** Confidence below this should stop cron batch (confidence collapse guardrail). */
const LOW_CONFIDENCE_THRESHOLD = 0.35;
/** Confidence below this skips creating/updating proposals (loop closure: avoid weak sessions polluting backlog). */
const PROPOSAL_CONFIDENCE_MIN = 0.4;

function finalizeResult(state: SessionExecutionState): SessionRunSuccessPayload {
  const result = state.pipelineResult;
  const artifact = state.primaryArtifact;
  const artifactCount = state.reflectionArtifactCreated
    ? 1
    : result
      ? (result.artifacts ?? []).length
      : 0;
  const artifactMedium: PreferredMedium | "other" | null = state.reflectionArtifactCreated
    ? "writing"
    : artifact && (artifact.medium === "image" || artifact.medium === "writing" || artifact.medium === "concept")
      ? artifact.medium
      : artifact?.medium
        ? "other"
        : null;

  let guardrail_stop: SessionRunSuccessPayload["guardrail_stop"] = null;
  if (state.repetitionDetected) {
    guardrail_stop = "repetition";
  } else if (state.executionMode === "human_required" && state.humanGateReason) {
    guardrail_stop = "governance_gate";
  } else if (
    typeof state.decisionSummary.confidence === "number" &&
    state.decisionSummary.confidence < LOW_CONFIDENCE_THRESHOLD
  ) {
    guardrail_stop = "low_confidence";
  } else if (artifactCount === 0 && state.pipelineResult) {
    guardrail_stop = "no_eligible_work";
  }

  return {
    session_id: result?.session.session_id ?? "",
    artifact_count: artifactCount,
    persisted: Boolean(state.supabase),
    requested_medium: state.requested_medium ?? state.derivedPreferMedium ?? undefined,
    executed_medium: state.executed_medium ?? undefined,
    fallback_reason: state.fallback_reason ?? undefined,
    resolution_source: state.resolution_source ?? undefined,
    artifact_medium: artifactMedium,
    archive_entry_created: state.archiveEntryCreated,
    recurrence_updated: state.recurrenceUpdated,
    proposal_created: state.proposalCreated,
    memory_record_created: state.memoryRecordCreated,
    warnings: state.warnings,
    guardrail_stop: guardrail_stop ?? undefined,
  };
}

/**
 * Persist session and a single internal reflection artifact when the run would otherwise produce no artifact.
 * Used for cron-triggered reflective / critique-heavy sessions so they leave durable, visible output.
 * Artifact is writing + artifact_role reflection_note, private and archived (non-staging).
 */
async function persistSessionAndReflectionArtifact(
  state: SessionExecutionState
): Promise<SessionExecutionState> {
  const supabase = state.supabase;
  const result = state.pipelineResult;
  if (!supabase || !result) return state;

  const now = new Date().toISOString();
  const sessionRow = {
    session_id: result.session.session_id,
    project_id: state.selectedProjectId ?? result.session.project_id,
    mode: result.session.mode,
    selected_drive: result.session.selected_drive,
    title: result.session.title,
    prompt_context: result.session.prompt_context,
    reflection_notes: result.session.reflection_notes,
    started_at: result.session.started_at,
    ended_at: result.session.ended_at ?? now,
    created_at: result.session.created_at,
    updated_at: now,
  };
  const { error: sessionError } = await supabase.from("creative_session").insert(sessionRow);
  if (sessionError) {
    console.warn("[session-runner] reflection path: session insert failed", { error: sessionError.message });
    return state;
  }

  const reflectionArtifactId = crypto.randomUUID();
  const modeLabel = result.session.mode ?? "unknown";
  const summary =
    result.session.reflection_notes?.trim() ||
    `Session completed with no generative artifact. Mode: ${modeLabel}.`;
  const artifactRow = {
    artifact_id: reflectionArtifactId,
    project_id: state.selectedProjectId ?? result.session.project_id,
    session_id: result.session.session_id,
    primary_idea_id: state.selectedIdeaId ?? null,
    primary_thread_id: state.selectedThreadId ?? null,
    title: "Reflection note",
    summary: summary.slice(0, 2000),
    medium: "writing",
    lifecycle_status: "draft",
    current_approval_state: "archived",
    current_publication_state: "private",
    content_text: summary.slice(0, 10000),
    content_uri: null,
    preview_uri: null,
    notes: null,
    alignment_score: null,
    emergence_score: null,
    fertility_score: null,
    pull_score: null,
    recurrence_score: null,
    artifact_role: "reflection_note",
    created_at: now,
    updated_at: now,
  };
  const { error: artifactError } = await supabase.from("artifact").insert(artifactRow);
  if (artifactError) {
    console.warn("[session-runner] reflection path: artifact insert failed", { error: artifactError.message });
    return state;
  }
  console.log("[session-runner] fallback_reflection_artifact_created", {
    session_id: result.session.session_id,
    artifact_id: reflectionArtifactId,
    mode: modeLabel,
  });
  return { ...state, reflectionArtifactCreated: true };
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

  // Recurrence writeback: same idea/idea_thread used in focus selection get recurrence_score (and
  // creative_pull on artifact) updated so the next session's selectProjectAndThread weights them.
  // Continuity audit: docs/05_build/CONTINUITY_RECURRENCE_AUDIT.md.
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
  if (tokensUsedForRecord > 0) await runtimeConfigModule.addTokenUsage(supabase, tokensUsedForRecord);

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

/**
 * Phase 3: Extension proposal eligibility (plan §Phase 3 gating).
 * Create only when all are true: source artifact exists, medium_fit partial/unsupported,
 * extension_classification non-null, and missing_capability or critique rationale provides support.
 * Exported for tests.
 */
export function isExtensionProposalEligible(state: SessionExecutionState): boolean {
  const artifact = state.primaryArtifact;
  const critique = state.critique;
  if (!artifact || !critique) return false;
  const medium_fit = state.medium_fit;
  const classification = state.extension_classification;
  if (medium_fit !== "partial" && medium_fit !== "unsupported") return false;
  if (classification == null) return false;
  const hasCapabilitySupport = state.missing_capability != null;
  const hasRationale =
    Boolean(critique.medium_fit_note?.trim()) || Boolean(critique.overall_summary?.trim());
  return hasCapabilitySupport || hasRationale;
}

/** Proposal Policy V1: derive 0–1 duplicate pressure from recent proposals for governance gate (semantic duplicate pressure). */
async function getDuplicateSignalForProposalGate(
  supabase: SupabaseClient
): Promise<number> {
  try {
    const { data: rows } = await supabase
      .from("proposal_record")
      .select(
        "proposal_record_id, title, summary, habitat_payload_json, target_surface, proposal_role, target_type, lane_type, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(25);
    if (!rows?.length) return 0;
    const relInputs: ProposalForRelationship[] = rows.map((p: Record<string, unknown>) => ({
      id: String(p.proposal_record_id),
      title: String(p.title ?? ""),
      summary: (p.summary as string) ?? null,
      payloadText:
        p.habitat_payload_json && typeof p.habitat_payload_json === "object"
          ? JSON.stringify(p.habitat_payload_json).slice(0, 800)
          : null,
      targetSurface: (p.target_surface as string) ?? null,
      proposalRole: (p.proposal_role as string) ?? null,
      targetType: (p.target_type as string) ?? null,
      laneType: (p.lane_type as string) ?? null,
      createdAt: (p.created_at as string) ?? null,
    }));
    const { summary } = buildConceptFamilies(relInputs, (current, all) =>
      evaluateProposalRelationship(current, all)
    );
    const total = summary.family_count_recent || 0;
    if (total === 0) return 0;
    return Math.min(1, summary.families_with_duplicate_pressure / total);
  } catch {
    return 0;
  }
}

async function manageProposals(state: SessionExecutionState): Promise<SessionExecutionState> {
  const supabase = state.supabase;
  const artifact = state.primaryArtifact;
  const evaluation = state.evaluation;
  const critique = state.critique;
  if (!supabase || !artifact || !evaluation || !critique) return state;

  const confidence = state.decisionSummary.confidence;
  let {
    proposalCreated,
    traceProposalId,
    traceProposalType,
    decisionSummary,
    warnings,
    proposalOutcome,
    governanceEvidence,
  } = state;

  // Proposal lane precedence (explicit policy): 1. Concept → surface habitat; 2. Image → avatar; 3. Extension → medium.
  // Later lanes may overwrite proposalOutcome until multi-outcome trace (e.g. proposal_attempts) is introduced.
  const duplicate_signal = await getDuplicateSignalForProposalGate(supabase);

  if (artifact.medium === "concept") {
    // Governance V1: classify lane/role for habitat layout proposals and
    // enforce runner authority + confidence/evidence gates before creation.
    const laneInfo = classifyProposalLane({
      requested_lane: "surface",
      proposal_role: "habitat_layout",
      target_surface: "staging_habitat",
      target_type: "concept",
    });
    const authority = getProposalAuthority("runner");
    const createCheck = canCreateProposal(laneInfo.lane_type, authority);
    if (!createCheck.ok) {
      const reason =
        "Proposal skipped by governance: runner is not allowed to create system-level proposals from concept artifacts.";
      const updatedWarnings = [
        ...warnings,
        `${reason} codes=${createCheck.reason_codes.join(",")}`,
      ];
      governanceEvidence = {
        lane_type: laneInfo.lane_type,
        classification_reason: laneInfo.classification_reason,
        actor_authority: authority,
        reason_codes: createCheck.reason_codes,
      };
      return {
        ...state,
        warnings: updatedWarnings,
        proposalOutcome: proposalOutcome ?? "skipped_governance",
        governanceEvidence,
        decisionSummary: {
          ...decisionSummary,
          next_action: decisionSummary.next_action ?? reason,
        },
      };
    }

    const hasMinimumEvidence =
      state.confidence_truth === "inferred" &&
      typeof confidence === "number" &&
      confidence >= PROPOSAL_CONFIDENCE_MIN;
    const gate = evaluateGovernanceGate({
      lane_type: laneInfo.lane_type,
      proposal_role: laneInfo.proposal_role ?? "habitat_layout",
      current_state: null,
      target_state: "pending_review",
      actor_authority: authority,
      confidence_truth: state.confidence_truth,
      duplicate_signal,
      has_minimum_evidence: hasMinimumEvidence,
    });
    if (gate.decision === "block") {
      const reason =
        state.confidence_truth === "defaulted"
          ? "Proposal skipped: confidence was defaulted and governance gate blocked creation."
          : `Proposal skipped: governance gate reported insufficient evidence for creating a habitat layout proposal (codes=${gate.reason_codes.join(",")}).`;
      const updatedWarnings = [
        ...warnings,
        `${reason}`,
      ];
      governanceEvidence = {
        lane_type: laneInfo.lane_type,
        classification_reason: laneInfo.classification_reason,
        actor_authority: authority,
        reason_codes: gate.reason_codes,
      };
      return {
        ...state,
        warnings: updatedWarnings,
        proposalOutcome: proposalOutcome ?? "skipped_governance",
        governanceEvidence,
        decisionSummary: {
          ...decisionSummary,
          next_action: decisionSummary.next_action ?? reason,
        },
      };
    }
    if (gate.decision === "warn") {
      warnings = [
        ...warnings,
        `Governance gate warning for habitat_layout proposal creation (codes=${gate.reason_codes.join(",")}).`,
      ];
    }
    governanceEvidence = {
      lane_type: laneInfo.lane_type,
      classification_reason: laneInfo.classification_reason,
      actor_authority: authority,
      reason_codes: gate.reason_codes,
    };

    const eligibility = isProposalEligible({
      medium: artifact.medium,
      alignment_score: evaluation.alignment_score,
      fertility_score: evaluation.fertility_score,
      pull_score: evaluation.pull_score,
      critique_outcome: critique.critique_outcome,
    });
    if (!eligibility.eligible) {
      decisionSummary = { ...decisionSummary, next_action: decisionSummary.next_action ?? eligibility.reason };
        // Explicitly record why the proposal path was not taken for this concept.
        // This makes traces easier to interpret without adding new behavior.
        state = { ...state, proposalOutcome: "skipped_ineligible", decisionSummary };
    } else {
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
        state = { ...state, proposalOutcome: "skipped_cap", decisionSummary };
      } else {
        // Canon: do not create a new proposal if this artifact already has a rejected/archived proposal (same lane/role).
        const { data: existingRejected } = await supabase
          .from("proposal_record")
          .select("proposal_record_id")
          .eq("artifact_id", artifact.artifact_id)
          .eq("lane_type", "surface")
          .eq("proposal_role", "habitat_layout")
          .in("proposal_state", ["rejected", "archived"])
          .limit(1)
          .maybeSingle();
        if (existingRejected) {
          decisionSummary = {
            ...decisionSummary,
            next_action:
              decisionSummary.next_action ?? "Proposal not created: a prior proposal for this concept was rejected or archived.",
          };
          state = { ...state, proposalOutcome: "skipped_rejected_archived", decisionSummary };
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
                artifact_id: artifact.artifact_id,
                target_id: artifact.artifact_id,
                updated_at: new Date().toISOString(),
              })
              .eq("proposal_record_id", newest.proposal_record_id);
            if (updateProposalError) {
              const msg = `habitat_layout proposal update failed: ${updateProposalError.message}`;
              console.warn("[session]", msg, { proposal_record_id: newest.proposal_record_id });
              warnings = [...warnings, msg];
            } else {
              proposalCreated = true;
              proposalOutcome = "updated";
            }

            if (older.length > 0) {
              // System-initiated staling: the runner is refreshing the newest active
              // habitat_layout proposal and retiring superseded older ones. Only
              // proposals for which pending_review/approved_for_staging/staged → archived
              // is a legal FSM transition are updated. This uses the canonical guard to
              // keep the archival path consistent with human-driven governance transitions.
              const legalToArchive = older.filter((o) =>
                canTransitionProposalState({
                  current_state: o.proposal_state as string,
                  target_state: "archived",
                  lane_type: "surface",
                  actor_authority: authority,
                }).ok
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
            proposalOutcome = "created";
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
        proposalOutcome = proposalOutcome ?? "skipped_cap";
        decisionSummary = {
          ...decisionSummary,
          next_action:
            decisionSummary.next_action ??
            "Focus on reviewing existing avatar proposals before creating new ones (backlog at cap).",
        };
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
            proposal_role: "avatar_candidate",
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
          proposalOutcome = "created";
          decisionSummary = {
            ...decisionSummary,
            next_action:
              decisionSummary.next_action ??
              "Propose a new avatar candidate for review based on this image.",
          };
        }
      }
    } else {
      proposalOutcome = proposalOutcome ?? "skipped_duplicate";
      decisionSummary = {
        ...decisionSummary,
        next_action:
          decisionSummary.next_action ??
          "Proposal not created: this image already has an avatar candidate proposal.",
      };
    }
  }

  // Phase 3: extension proposal — creation-only; no apply in runner. Medium lane: resolves to roadmap/spec, not staging/public.
  if (isExtensionProposalEligible(state)) {
    const authority = getProposalAuthority("runner");
    const laneInfo = classifyProposalLane({
      requested_lane: "medium",
      proposal_role: state.extension_classification,
      target_surface: null,
      target_type: "extension",
    });
    const createCheck = canCreateProposal(laneInfo.lane_type, authority);
    if (!createCheck.ok) {
      const reason =
        "Extension proposal skipped by governance: runner is not allowed to create system-level proposals.";
      warnings = [
        ...warnings,
        `${reason} codes=${createCheck.reason_codes.join(",")}`,
      ];
      governanceEvidence = {
        lane_type: laneInfo.lane_type,
        classification_reason: laneInfo.classification_reason,
        actor_authority: authority,
        reason_codes: createCheck.reason_codes,
      };
      return {
        ...state,
        warnings,
        proposalCreated,
        traceProposalId,
        traceProposalType,
        proposalOutcome: proposalOutcome ?? "skipped_governance",
        governanceEvidence,
        decisionSummary,
      };
    }

    const hasMinimumEvidence =
      state.confidence_truth === "inferred" &&
      typeof confidence === "number" &&
      confidence >= PROPOSAL_CONFIDENCE_MIN;
    const gate = evaluateGovernanceGate({
      lane_type: laneInfo.lane_type,
      proposal_role: laneInfo.proposal_role ?? state.extension_classification ?? "extension",
      current_state: null,
      target_state: "pending_review",
      actor_authority: authority,
      confidence_truth: state.confidence_truth,
      duplicate_signal,
      has_minimum_evidence: hasMinimumEvidence,
    });
    if (gate.decision === "block") {
      const reason =
        state.confidence_truth === "defaulted"
          ? "Extension proposal skipped: confidence was defaulted and governance gate blocked creation."
          : `Extension proposal skipped: governance gate reported insufficient evidence (codes=${gate.reason_codes.join(",")}).`;
      warnings = [...warnings, reason];
      governanceEvidence = {
        lane_type: laneInfo.lane_type,
        classification_reason: laneInfo.classification_reason,
        actor_authority: authority,
        reason_codes: gate.reason_codes,
      };
      return {
        ...state,
        warnings,
        proposalCreated,
        traceProposalId,
        traceProposalType,
        proposalOutcome: proposalOutcome ?? "skipped_governance",
        governanceEvidence,
        decisionSummary: {
          ...decisionSummary,
          next_action: decisionSummary.next_action ?? reason,
        },
      };
    }
    if (gate.decision === "warn") {
      warnings = [
        ...warnings,
        `Governance gate warning for extension proposal creation (codes=${gate.reason_codes.join(",")}).`,
      ];
    }
    governanceEvidence = {
      lane_type: laneInfo.lane_type,
      classification_reason: laneInfo.classification_reason,
      actor_authority: authority,
      reason_codes: gate.reason_codes,
    };

    const extensionCap = getMaxPendingExtensionProposals();
    const EXTENSION_PROPOSAL_ROLES = [
      "medium_extension",
      "toolchain_extension",
      "workflow_extension",
      "surface_environment_extension",
      "system_capability_extension",
    ] as const;
    const { count: pendingExtensionCount } = await supabase
      .from("proposal_record")
      .select("proposal_record_id", { count: "exact", head: true })
      .eq("lane_type", "medium")
      .in("proposal_role", EXTENSION_PROPOSAL_ROLES)
      .eq("proposal_state", "pending_review");
    const pending = pendingExtensionCount ?? 0;
    if (extensionCap > 0 && pending >= extensionCap) {
      console.log("[session] skipping extension proposal: backlog at cap", {
        pending,
        cap: extensionCap,
      });
      proposalOutcome = proposalOutcome ?? "skipped_cap";
      decisionSummary = {
        ...decisionSummary,
        next_action:
          decisionSummary.next_action ??
          "Focus on reviewing existing extension proposals before creating new ones (backlog at cap).",
      };
    } else {
      // Structural duplicate guard: artifact_id + role cannot have multiple pending extension proposals.
      const { data: existingForArtifact } = await supabase
        .from("proposal_record")
        .select("proposal_record_id")
        .eq("lane_type", "medium")
        .eq("proposal_role", state.extension_classification!)
        .eq("artifact_id", artifact!.artifact_id)
        .eq("proposal_state", "pending_review")
        .limit(1)
        .maybeSingle();
      if (existingForArtifact) {
        proposalOutcome = proposalOutcome ?? "skipped_duplicate";
        decisionSummary = {
          ...decisionSummary,
          next_action:
            decisionSummary.next_action ??
            "Proposal not created: this artifact already has a pending extension proposal for this role.",
        };
      } else {
        const rationale = [critique!.medium_fit_note, critique!.overall_summary]
          .filter(Boolean)
          .join(" ");
        const bodySummary = capSummaryTo200Words(
          rationale || artifact!.summary || artifact!.title || "Capability-fit suggests extension."
        );
        // UX: make it obvious to operators this is an extension proposal, not a config change (plan §pre-push).
        const summary = bodySummary
          ? `Extension proposal (operator review only; no apply in runner). ${bodySummary}`
          : "Extension proposal (operator review only; no apply in runner).";
        const extensionRow = {
          lane_type: "medium" as const,
          target_type: "extension" as const,
          target_id: artifact!.artifact_id,
          artifact_id: artifact!.artifact_id,
          title: artifact!.title
            ? `Extension: ${state.extension_classification} — ${artifact!.title.slice(0, 80)}`
            : `Extension: ${state.extension_classification}`,
          summary,
          proposal_state: "pending_review",
          proposal_role: state.extension_classification!,
          target_surface: null,
          proposal_type: "extension",
          preview_uri: null,
          review_note: null,
          created_by: state.createdBy,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const { data: insertedExtension, error: insertExtensionError } = await supabase
          .from("proposal_record")
          .insert(extensionRow)
          .select("proposal_record_id")
          .single();
        if (insertExtensionError) {
          const msg = `extension proposal insert failed: ${insertExtensionError.message}`;
          console.warn("[session]", msg, { artifact_id: artifact!.artifact_id });
          warnings = [...warnings, msg];
        } else if (insertedExtension?.proposal_record_id) {
          traceProposalId = insertedExtension.proposal_record_id as string;
          traceProposalType = "extension";
          proposalCreated = true;
          proposalOutcome = "created";
          decisionSummary = {
            ...decisionSummary,
            next_action:
              decisionSummary.next_action ??
              "Extension proposal created for operator review (no apply path in runner).",
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
    proposalOutcome: proposalOutcome ?? state.proposalOutcome,
    decisionSummary,
    warnings,
    governanceEvidence,
  };
}

/** Canonical signal keys for Selection Evidence Ledger v2. */
/**
 * Current signal keys recorded in the Selection Evidence Ledger.
 *
 * Planned future additions (Stage-2+):
 *   "intent_health"          — session intent alignment quality
 *   "proposal_governance"    — proposal FSM pressure signal
 *   "thought_map_advisory"   — advisory hint from trajectory adapter (dry-run → active at Stage-2)
 *   "medium_learning"        — medium execution success/failure signal
 *   "habitat_selection"      — habitat payload influence
 *
 * When adding a new key: append here, add detection logic in buildSelectionEvidence,
 * and update the used-signal inference block. Backward compatibility is maintained
 * via the signals_present/signals_used derived arrays.
 */
const SELECTION_EVIDENCE_SIGNAL_KEYS = [
  "backlog_pressure",
  "recurrence_signal",
  "proposal_backlog",
  "archive_return",
  "reflection_need",
  "governance_flags",
] as const;

export type SelectionEvidenceV2 = {
  version: 2;
  signals: Record<
    (typeof SELECTION_EVIDENCE_SIGNAL_KEYS)[number],
    /**
     * present: signal was detectable in the runtime state at selection time.
     * used: signal materially influenced the selection decision.
     * influence_strength: reserved for Stage-2 — bounded 0–1 weight when the signal
     *   actively biases selection. Not yet set; omitted until Stage-2 wires it.
     */
    { present: boolean; used: boolean; influence_strength?: number }
  >;
  decision_summary: string;
  selection_source: string;
  selected_thread_id: string | null;
  selected_mode: string | null;
  selected_drive: string | null;
  /** Backward compatibility: derived from signals (and taste_bias when present). */
  signals_present: string[];
  /** Backward compatibility: derived from signals. */
  signals_used: string[];
};

/**
 * Build selection evidence for the session trace (Selection Evidence Ledger).
 * v2: normalized signals object; legacy arrays derived for backward compatibility.
 * Records which signals were present and which were used so we can later answer
 * "why did the agent switch threads?" — e.g. backlog_pressure + recurrence_signal, NOT thought_map.
 */
function buildSelectionEvidence(state: SessionExecutionState): SelectionEvidenceV2 {
  const backlogPresent = state.liveBacklog > 0;
  const recurrencePresent =
    state.previousState.idea_recurrence != null ||
    state.selectedThreadId != null ||
    state.selectedIdeaId != null;
  const proposalBacklogPresent = state.liveBacklog > 0;
  const archivePresent = state.archiveCandidateAvailable;
  const reflectionPresent =
    state.previousState.reflection_need != null &&
    Number(state.previousState.reflection_need) > 0;
  const governancePresent = state.repetitionDetected;

  const used: Record<string, boolean> = {};
  if (state.selectionSource === "archive") {
    used.archive_return = true;
  } else if (state.sessionMode === "reflect") {
    used.reflection_need = true;
    if (state.liveBacklog > 0) used.backlog_pressure = true;
  } else if (state.sessionMode === "return") {
    used.archive_return = true;
  } else {
    if (state.liveBacklog > 0) used.backlog_pressure = true;
    if (state.selectedThreadId != null || state.selectedIdeaId != null) used.recurrence_signal = true;
  }
  if (state.repetitionDetected) used.governance_flags = true;

  const signals: SelectionEvidenceV2["signals"] = {
    backlog_pressure: { present: backlogPresent, used: !!used.backlog_pressure },
    recurrence_signal: { present: recurrencePresent, used: !!used.recurrence_signal },
    proposal_backlog: { present: proposalBacklogPresent, used: false },
    archive_return: { present: archivePresent, used: !!used.archive_return },
    reflection_need: { present: reflectionPresent, used: !!used.reflection_need },
    governance_flags: { present: governancePresent, used: !!used.governance_flags },
  };

  const signals_present: string[] = SELECTION_EVIDENCE_SIGNAL_KEYS.filter((k) => signals[k].present).slice();
  if (state.tasteBiasDebug) signals_present.push("taste_bias");
  const signals_used = SELECTION_EVIDENCE_SIGNAL_KEYS.filter((k) => signals[k].used).slice();

  const decision_summary =
    state.decisionSummary.next_action ?? `mode=${state.sessionMode}, drive=${state.selectedDrive ?? "none"}`;

  return {
    version: 2,
    signals,
    decision_summary,
    selection_source: state.selectionSource ?? "unknown",
    selected_thread_id: state.selectedThreadId ?? null,
    selected_mode: state.sessionMode ?? null,
    selected_drive: state.selectedDrive ?? null,
    signals_present,
    signals_used,
  };
}

/** Build minimal trace for no-artifact sessions (timeline-compatible). */
function buildMinimalTrace(
  state: SessionExecutionState,
  traceLabels: { project_name: string | null; thread_name: string | null; idea_summary: string | null }
): Record<string, unknown> {
  const result = state.pipelineResult!;
  return {
    session_mode: state.sessionMode ?? null,
    drive: state.selectedDrive ?? null,
    project_id: state.selectedProjectId ?? null,
    project_name: traceLabels.project_name ?? null,
    idea_thread_id: state.selectedThreadId ?? null,
    thread_name: traceLabels.thread_name ?? null,
    idea_id: state.selectedIdeaId ?? null,
    idea_summary: traceLabels.idea_summary ?? null,
    artifact_id: null,
    proposal_id: null,
    proposal_type: null,
    start_time: result.session.started_at,
    end_time: result.session.ended_at ?? new Date().toISOString(),
    /** trace_kind distinguishes minimal (no-artifact) from full traces in the ledger. */
    trace_kind: "minimal" as const,
    selection_evidence: buildSelectionEvidence(state),
  };
}

/**
 * Update creative_session with trace and decision_summary (shared for full and minimal trace).
 */
async function persistSessionTrace(
  supabase: SupabaseClient,
  sessionId: string,
  trace: Record<string, unknown>,
  decisionSummary: DecisionSummary | Record<string, unknown>
): Promise<{ updated: boolean; error?: string }> {
  const { data, error } = await supabase
    .from("creative_session")
    .update({
      trace,
      decision_summary: decisionSummary as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq("session_id", sessionId)
    .select("session_id");
  if (error) return { updated: false, error: error.message };
  return { updated: (data?.length ?? 0) > 0 };
}

/**
 * Persist minimal trace for no-artifact sessions. Updates existing row or inserts one so every session leaves a trace.
 */
async function persistMinimalSessionTrace(state: SessionExecutionState): Promise<SessionExecutionState> {
  const supabase = state.supabase;
  const result = state.pipelineResult;
  if (!supabase || !result) return state;

  const traceLabels = await getProjectThreadIdeaTraceLabels(
    supabase,
    state.selectedProjectId,
    state.selectedThreadId,
    state.selectedIdeaId
  );
  const trace = buildMinimalTrace(state, traceLabels);
  const decisionSummary = state.decisionSummary;

  const { updated, error } = await persistSessionTrace(
    supabase,
    result.session.session_id,
    trace,
    decisionSummary
  );
  if (error) {
    const msg = `session minimal trace update failed: ${error}`;
    console.warn("[session-runner]", msg, { session_id: result.session.session_id });
    state = { ...state, warnings: [...state.warnings, msg] };
  }
  if (updated) return state;

  const now = new Date().toISOString();
  const sessionRow = {
    session_id: result.session.session_id,
    project_id: state.selectedProjectId ?? result.session.project_id,
    mode: result.session.mode,
    selected_drive: result.session.selected_drive,
    title: result.session.title,
    prompt_context: result.session.prompt_context,
    reflection_notes: result.session.reflection_notes,
    started_at: result.session.started_at,
    ended_at: result.session.ended_at ?? now,
    created_at: result.session.created_at,
    updated_at: now,
    trace,
    decision_summary: decisionSummary,
  };
  const { error: insertError } = await supabase.from("creative_session").insert(sessionRow);
  if (insertError) {
    const msg = `session minimal trace insert failed: ${insertError.message}`;
    console.warn("[session-runner]", msg, { session_id: result.session.session_id });
    return { ...state, warnings: [...state.warnings, msg] };
  }
  return state;
}

async function writeTraceAndDeliberation(
  state: SessionExecutionState
): Promise<SessionExecutionState> {
  const supabase = state.supabase;
  const result = state.pipelineResult;
  const artifact = state.primaryArtifact;
  const critique = state.critique;
  if (!supabase || !result || !artifact || !critique) return state;

  const runtimeConfig = await runtimeConfigModule.getRuntimeConfig(supabase);
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
    session_mode: state.sessionMode,
    metabolism_mode: metabolismMode,
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
    // Phase 1–3 runtime observability fields
    // Added to trace for medium resolution, capability-fit classification,
    // and extension proposal diagnostics.
    requested_medium: state.requested_medium ?? null,
    executed_medium: state.executed_medium ?? null,
    fallback_reason: state.fallback_reason ?? null,
    resolution_source: state.resolution_source ?? null,
    medium_fit: state.medium_fit ?? null,
    missing_capability: state.missing_capability ?? null,
    extension_classification: state.extension_classification ?? null,
    confidence_truth: state.confidence_truth ?? null,
    proposal_outcome: state.proposalOutcome ?? null,
    /** trace_kind distinguishes full (artifact-producing) from minimal traces in the ledger. */
    trace_kind: "full" as const,
    selection_evidence: buildSelectionEvidence(state),
    governance_evidence: state.governanceEvidence ?? null,
  };
  const { error: traceUpdateError } = await persistSessionTrace(
    supabase,
    result.session.session_id,
    trace,
    state.decisionSummary
  );
  if (traceUpdateError) {
    const msg = `session trace update failed: ${traceUpdateError}`;
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
        trajectory_advisory_applied:
          state.trajectoryAdvisory?.feedback.gently_reduce_repetition === true &&
          state.trajectoryAdvisory.interpretation_confidence !== "low",
        trajectory_advisory_reason: state.trajectoryAdvisory?.feedback.reason ?? null,
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
        return_selection_debug: state.returnSelectionDebug ?? null,
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
  // Only require supabase + result (session_id). artifact/critique being absent is
  // recorded as has_artifact/has_critique: false so no-generation sessions still get a row.
  if (!supabase || !result) return state;

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
    has_artifact: Boolean(artifact),
    has_critique: Boolean(critique),
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
  // Feed-forward: store the recommended_next_action_kind in state so it can be passed to
  // updateSessionIntent (which writes it to the next active intent's evidence_json).
  return { ...state, trajectoryReviewRecommendedAction: row.recommended_next_action_kind ?? null };
}

