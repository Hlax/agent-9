import {
  computeSessionMode,
  computeDriveWeights,
  selectDrive,
  type CreativeStateFields,
} from "@twin/evaluation";
import type { SessionMode, CreativeDrive, CritiqueRecord } from "@twin/core";
import { createDefaultMediumRegistry } from "@twin/agent";
import type { SynthesisPressurePayload } from "@/lib/synthesis-pressure";
import type { ActiveIntent } from "@/lib/session-intent";
import type { TrajectoryFeedbackResult } from "@/lib/trajectory-feedback-adapter";
import type { RuntimeTrajectory } from "@/lib/runtime-trajectory";
import type {
  FallbackReason,
  ResolutionSource,
  MediumFit,
  MissingCapabilityKey,
  ExtensionClassification,
} from "@twin/mediums";
import { resolveExecutedMedium, applyCapabilityFit, computeProposalConfidenceMin } from "./session-runner";
import { classifyProposalLane, type LaneType } from "./proposal-governance";

export interface SimulationInputs {
  /** Creative state from latest snapshot (continuity input). */
  previousState: CreativeStateFields;
  /** Live backlog count used for mode/drive. */
  liveBacklog: number;
  /** Trajectory-derived synthesis pressure used for soft mode bias. */
  synthesisPressure?: SynthesisPressurePayload | null;
  /** Active session intent from continuity layer. */
  activeIntent?: ActiveIntent | null;
  /** Trajectory advisory (gently_reduce_repetition / favor_consolidation). */
  trajectoryAdvisory?: {
    feedback: TrajectoryFeedbackResult;
    interpretation_confidence: "low" | "medium" | "high";
  } | null;
  /** Runtime trajectory snapshot (includes proposal_pressure). */
  runtimeTrajectory?: RuntimeTrajectory | null;
  /** Explicit medium preference (simulates API/cron preferMedium); null → derived. */
  preferMedium?: "writing" | "concept" | "image" | null;
  /** Whether this scenario is cron-triggered (affects medium derivation). */
  isCron?: boolean;
  /** Critique outcome label (e.g. continue, reflect, archive_candidate, shift_medium, stop). */
  critiqueOutcome?: string | null;
  /** Critique medium_fit_note text used to derive capability-fit. */
  critiqueMediumFitNote?: string | null;
  /** Decision confidence to use when computing proposal confidence thresholds. */
  decisionConfidence?: number | null;
  /** Artifact medium for proposal routing (e.g. concept, image). */
  artifactMedium?: string | null;
  /**
   * Target surface to simulate for concept → habitat staging lane.
   * When omitted, defaults to "staging_habitat" for concept artifacts.
   */
  conceptTargetSurface?: string | null;
}

export interface SimulationResult {
  /** Selected session mode from simulateModeAndDrive. */
  mode: SessionMode;
  /** Selected drive from simulateModeAndDrive. */
  drive: CreativeDrive;
  /** Active intent passed into the simulation (echoed for convenience). */
  activeIntent: ActiveIntent | null;
  /** Medium derivation + registry resolution. */
  requested_medium: string | null;
  executed_medium: string;
  fallback_reason: FallbackReason | null;
  resolution_source: ResolutionSource;
  /** Capability-fit diagnostics derived from critique. */
  medium_fit: MediumFit | null;
  missing_capability: MissingCapabilityKey;
  extension_classification: ExtensionClassification;
  /** Runtime trajectory proposal pressure band. */
  proposal_pressure: RuntimeTrajectory["proposal_pressure"];
  /** Proposal-confidence floor before and after proposal_pressure adjustment. */
  proposal_confidence_min_base: number;
  proposal_confidence_min_effective: number;
  proposal_pressure_applied: boolean;
  /** Simulated lane + surface for concept habitat proposals. */
  lane_type: LaneType | null;
  target_surface: string | null;
  /** High-level proposal outcome under this simulation (no DB / caps). */
  proposal_outcome: "none" | "eligible" | "skipped_confidence";
}

/** Internal: apply the same soft biases as selectModeAndDrive, but in a pure helper. */
function simulateModeAndDriveFromState(
  baseState: CreativeStateFields,
  liveBacklog: number,
  synthesisPressure?: SynthesisPressurePayload | null,
  activeIntent?: ActiveIntent | null,
  trajectoryAdvisory?: {
    feedback: TrajectoryFeedbackResult;
    interpretation_confidence: "low" | "medium" | "high";
  } | null
): { mode: SessionMode; drive: CreativeDrive } {
  let sessionState: CreativeStateFields = {
    ...baseState,
    public_curation_backlog: liveBacklog,
  };

  if (synthesisPressure?.components) {
    const { return_success_trend, repetition_without_movement_penalty } = synthesisPressure.components;
    const reflectionBias =
      0.08 * (1 - Math.max(0, return_success_trend)) +
      0.05 * Math.min(1, repetition_without_movement_penalty);
    sessionState = {
      ...sessionState,
      reflection_need: Math.min(
        1,
        Math.max(0, sessionState.reflection_need + reflectionBias)
      ),
    };
  }

  if (activeIntent) {
    const k = activeIntent.intent_kind;
    if (k === "reflect") {
      sessionState = {
        ...sessionState,
        reflection_need: Math.min(1, sessionState.reflection_need + 0.06),
      };
    } else if (k === "refine" || k === "consolidate") {
      sessionState = {
        ...sessionState,
        recent_exploration_rate: Math.max(
          0,
          sessionState.recent_exploration_rate - 0.05
        ),
      };
    }
  }

  const adv = trajectoryAdvisory;
  const TRAJECTORY_REFLECTION_NUDGE = 0.06;
  if (adv?.feedback.gently_reduce_repetition && adv.interpretation_confidence !== "low") {
    sessionState = {
      ...sessionState,
      reflection_need: Math.min(
        1,
        Math.max(0, sessionState.reflection_need + TRAJECTORY_REFLECTION_NUDGE)
      ),
    };
  }
  const TRAJECTORY_CONSOLIDATION_NUDGE_LIGHT = 0.05;
  const TRAJECTORY_CONSOLIDATION_NUDGE_STRONG = 0.1;
  const consolidationSignal = adv?.feedback.favor_consolidation;
  if (consolidationSignal && consolidationSignal !== "none" && adv?.interpretation_confidence !== "low") {
    const nudge =
      consolidationSignal === "strong"
        ? TRAJECTORY_CONSOLIDATION_NUDGE_STRONG
        : TRAJECTORY_CONSOLIDATION_NUDGE_LIGHT;
    sessionState = {
      ...sessionState,
      recent_exploration_rate: Math.max(
        0,
        sessionState.recent_exploration_rate - nudge
      ),
    };
  }

  const mode = computeSessionMode(sessionState);
  const driveWeights = computeDriveWeights(sessionState);
  const drive = selectDrive(driveWeights);
  return { mode, drive };
}

/** Internal: minimal critique stub for applyCapabilityFit. */
function buildCritiqueForSimulation(
  outcome: string | null | undefined,
  mediumFitNote: string | null | undefined
): CritiqueRecord {
  const now = new Date().toISOString();
  return {
    critique_id: "sim-critique",
    target_type: "artifact",
    target_id: "sim-artifact",
    created_at: now,
    updated_at: now,
    critique_outcome: outcome ?? "continue",
    intent_note: null,
    strength_note: null,
    originality_note: null,
    energy_note: null,
    potential_note: null,
    medium_fit_note: mediumFitNote ?? null,
    coherence_note: null,
    fertility_note: null,
    overall_summary: null,
  };
}

/**
 * Simulate a single session decision path using the same core helpers as the
 * production runner, but without Supabase or side effects.
 *
 * This helper is read-only and does not change production semantics; it
 * reuses mode/drive, medium resolution, capability-fit, and lane typing logic
 * to produce a comparable decision summary for controlled scenarios.
 */
export function simulateSessionDecision(inputs: SimulationInputs): SimulationResult {
  const {
    previousState,
    liveBacklog,
    synthesisPressure,
    activeIntent,
    trajectoryAdvisory,
    runtimeTrajectory,
    preferMedium,
    isCron,
    critiqueOutcome,
    critiqueMediumFitNote,
    decisionConfidence,
    artifactMedium,
    conceptTargetSurface,
  } = inputs;

  const { mode, drive } = simulateModeAndDriveFromState(
    previousState,
    liveBacklog,
    synthesisPressure,
    activeIntent ?? null,
    trajectoryAdvisory ?? null
  );

  const sessionStateForMedium: CreativeStateFields = {
    ...previousState,
    public_curation_backlog: liveBacklog,
  };
  const derivedPreferMedium = ((): "writing" | "concept" | "image" | null => {
    // Prefer reusing the runner's behavior: explicit preferMedium wins; else derive.
    if (preferMedium != null) return preferMedium;
    // Fallback: reuse evaluation's medium derivation heuristics via computeSessionMode's existing state.
    // For simulation, we keep this simple and lean on the caller-provided preferMedium when exact matching is needed.
    return null;
  })();
  const requested_medium = preferMedium ?? derivedPreferMedium;

  const registry = createDefaultMediumRegistry();
  const wasRequestedExplicit = preferMedium != null;
  const { executed_medium, fallback_reason, resolution_source } = resolveExecutedMedium(
    registry,
    requested_medium,
    wasRequestedExplicit
  );

  const critique = buildCritiqueForSimulation(critiqueOutcome, critiqueMediumFitNote);
  const capabilityFitState = applyCapabilityFit({
    // Only fields read by applyCapabilityFit are critique + existing capability-fit fields.
    // The rest are dummy placeholders to satisfy the type; they are not used.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    critique: critique as any,
  } as any);
  const medium_fit = capabilityFitState.medium_fit ?? null;
  const missing_capability = capabilityFitState.missing_capability ?? null;
  const extension_classification = capabilityFitState.extension_classification ?? null;

  const baseConfidenceMin = 0.4;
  const proposal_pressure = runtimeTrajectory?.proposal_pressure ?? "normal";
  const proposal_confidence_min_effective = computeProposalConfidenceMin(
    baseConfidenceMin,
    proposal_pressure
  );
  const proposal_pressure_applied = proposal_confidence_min_effective !== baseConfidenceMin;

  let lane_type: LaneType | null = null;
  let target_surface: string | null = null;
  let proposal_outcome: SimulationResult["proposal_outcome"] = "none";

  if (artifactMedium === "concept") {
    const laneInfo = classifyProposalLane({
      requested_lane: "surface",
      proposal_role: "habitat_layout",
      target_surface: conceptTargetSurface ?? "staging_habitat",
      target_type: "concept",
    });
    lane_type = laneInfo.lane_type;
    target_surface = laneInfo.target_surface;

    const hasMinimumEvidence =
      typeof decisionConfidence === "number" &&
      decisionConfidence >= proposal_confidence_min_effective;

    if (!hasMinimumEvidence) {
      proposal_outcome = "skipped_confidence";
    } else {
      proposal_outcome = "eligible";
    }
  }

  return {
    mode,
    drive,
    activeIntent: activeIntent ?? null,
    requested_medium: requested_medium ?? null,
    executed_medium,
    fallback_reason,
    resolution_source,
    medium_fit,
    missing_capability,
    extension_classification,
    proposal_pressure,
    proposal_confidence_min_base: baseConfidenceMin,
    proposal_confidence_min_effective,
    proposal_pressure_applied,
    lane_type,
    target_surface,
    proposal_outcome,
  };
}

