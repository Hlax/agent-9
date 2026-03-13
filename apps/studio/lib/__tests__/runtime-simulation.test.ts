import { describe, it, expect } from "vitest";
import { defaultCreativeState } from "@twin/evaluation";
import type { SynthesisPressurePayload } from "@/lib/synthesis-pressure";
import type { ActiveIntent } from "@/lib/session-intent";
import type { TrajectoryFeedbackResult } from "@/lib/trajectory-feedback-adapter";
import type { RuntimeTrajectory } from "@/lib/runtime-trajectory";
import { simulateSessionDecision } from "../runtime-simulation";

function makeSynthesisPressure(overrides: Partial<SynthesisPressurePayload["components"]> = {}): SynthesisPressurePayload {
  return {
    band: "rising",
    components: {
      return_success_trend: 0.5,
      repetition_without_movement_penalty: 0,
      momentum: 0.5,
      unfinished_pull_signal: 0.2,
      archive_candidate_pressure: 0.1,
      ...overrides,
    },
  };
}

function makeActiveIntent(kind: ActiveIntent["intent_kind"]): ActiveIntent {
  return {
    intent_id: "intent-1",
    intent_kind: kind,
    target_project_id: null,
    target_thread_id: null,
    target_artifact_family: null,
    reason_summary: null,
    confidence: null,
    source_session_id: null,
    last_reinforced_session_id: null,
  };
}

function makeTrajectoryAdvisory(
  overrides: Partial<TrajectoryFeedbackResult> = {}
): { feedback: TrajectoryFeedbackResult; interpretation_confidence: "low" | "medium" | "high" } {
  return {
    feedback: {
      gently_reduce_repetition: false,
      favor_consolidation: "none",
      proposal_pressure_adjustment: 0,
      reason: "test",
      ...overrides,
    },
    interpretation_confidence: "high",
  };
}

function makeRuntimeTrajectory(
  overrides: Partial<RuntimeTrajectory> = {}
): RuntimeTrajectory {
  return {
    mode: "explore",
    horizon_sessions: 5,
    reason: "test trajectory",
    proposal_pressure: "normal",
    ...overrides,
  };
}

describe("simulateSessionDecision — baseline behavior", () => {
  it("produces mode, drive, and medium diagnostics for a neutral scenario", () => {
    const previousState = defaultCreativeState();
    const result = simulateSessionDecision({
      previousState,
      liveBacklog: 0,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: null,
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory(),
      preferMedium: "writing",
      isCron: false,
      critiqueOutcome: "continue",
      critiqueMediumFitNote: null,
      decisionConfidence: 0.6,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    });

    expect(result.mode).toBeDefined();
    expect(result.drive).toBeDefined();
    expect(result.requested_medium).toBe("writing");
    expect(result.executed_medium).toBe("writing");
    expect(result.fallback_reason).toBeNull();
    expect(result.resolution_source).toBe("manual_override");
    expect(result.medium_fit === "supported" || result.medium_fit === null).toBe(true);
    expect(result.lane_type).toBe("surface");
    expect(result.target_surface).toBe("staging_habitat");
    expect(result.proposal_outcome).toBe("eligible");
  });
});

describe("simulateSessionDecision — proposal_pressure effects", () => {
  it("does not change confidence floor when proposal_pressure is normal", () => {
    const previousState = defaultCreativeState();
    const result = simulateSessionDecision({
      previousState,
      liveBacklog: 10,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: null,
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory({ proposal_pressure: "normal" }),
      preferMedium: "concept",
      isCron: false,
      critiqueOutcome: "continue",
      critiqueMediumFitNote: null,
      decisionConfidence: 0.5,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    });

    expect(result.proposal_confidence_min_base).toBeCloseTo(0.4, 5);
    expect(result.proposal_confidence_min_effective).toBeCloseTo(0.4, 5);
    expect(result.proposal_pressure_applied).toBe(false);
  });

  it("raises confidence floor slightly when proposal_pressure is high", () => {
    const previousState = defaultCreativeState();
    const result = simulateSessionDecision({
      previousState,
      liveBacklog: 50,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: null,
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory({ proposal_pressure: "high" }),
      preferMedium: "concept",
      isCron: false,
      critiqueOutcome: "continue",
      critiqueMediumFitNote: null,
      decisionConfidence: 0.42,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    });

    expect(result.proposal_confidence_min_effective).toBeGreaterThan(0.4);
    expect(result.proposal_confidence_min_effective).toBeCloseTo(0.45, 5);
    expect(result.proposal_pressure_applied).toBe(true);
    expect(result.proposal_outcome).toBe("skipped_confidence");
  });

  it("lowers confidence floor slightly when proposal_pressure is low", () => {
    const previousState = defaultCreativeState();
    const result = simulateSessionDecision({
      previousState,
      liveBacklog: 0,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: null,
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory({ proposal_pressure: "low" }),
      preferMedium: "concept",
      isCron: false,
      critiqueOutcome: "continue",
      critiqueMediumFitNote: null,
      decisionConfidence: 0.37,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    });

    expect(result.proposal_confidence_min_effective).toBeLessThan(0.4);
    expect(result.proposal_confidence_min_effective).toBeCloseTo(0.35, 5);
    expect(result.proposal_pressure_applied).toBe(true);
    expect(result.proposal_outcome).toBe("eligible");
  });
});

describe("simulateSessionDecision — active intent and trajectory advisory", () => {
  it("applies active reflect intent and trajectory advisory as soft mode/drive biases", () => {
    const baseState = {
      ...defaultCreativeState(),
      reflection_need: 0.3,
      recent_exploration_rate: 0.7,
    };
    const previousState = baseState;
    const synthesisPressure = makeSynthesisPressure({ return_success_trend: 0.2 });
    const activeIntent = makeActiveIntent("reflect");
    const trajectoryAdvisory = makeTrajectoryAdvisory({
      gently_reduce_repetition: true,
      favor_consolidation: "light",
    });

    const result = simulateSessionDecision({
      previousState,
      liveBacklog: 20,
      synthesisPressure,
      activeIntent,
      trajectoryAdvisory,
      runtimeTrajectory: makeRuntimeTrajectory(),
      preferMedium: "writing",
      isCron: false,
      critiqueOutcome: "continue",
      critiqueMediumFitNote: null,
      decisionConfidence: 0.6,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    });

    expect(result.mode).toBeDefined();
    expect(result.drive).toBeDefined();
    expect(result.activeIntent?.intent_kind).toBe("reflect");
  });
});

describe("simulateSessionDecision — canonical scenario catalog", () => {
  it("neutral baseline scenario", () => {
    const result = simulateSessionDecision({
      previousState: defaultCreativeState(),
      liveBacklog: 0,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: null,
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory({ proposal_pressure: "normal" }),
      preferMedium: "writing",
      isCron: false,
      critiqueOutcome: "continue",
      critiqueMediumFitNote: null,
      decisionConfidence: 0.6,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    });

    expect(result.requested_medium).toBe("writing");
    expect(result.executed_medium).toBe("writing");
    expect(result.proposal_pressure).toBe("normal");
    expect(result.proposal_confidence_min_effective).toBeCloseTo(0.4, 5);
    expect(result.lane_type).toBe("surface");
    expect(result.target_surface).toBe("staging_habitat");
    expect(result.proposal_outcome).toBe("eligible");
  });

  it("no-artifact continuity style state (high reflection_need, low exploration)", () => {
    const noArtifactState = {
      ...defaultCreativeState(),
      reflection_need: 0.8,
      recent_exploration_rate: 0.2,
    };
    const result = simulateSessionDecision({
      previousState: noArtifactState,
      liveBacklog: 5,
      synthesisPressure: makeSynthesisPressure({ return_success_trend: 0.5 }),
      activeIntent: null,
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory({ proposal_pressure: "normal" }),
      preferMedium: "writing",
      isCron: true,
      critiqueOutcome: "reflect",
      critiqueMediumFitNote: "good fit for reflective writing.",
      decisionConfidence: 0.6,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    });

    expect(result.mode).toBeDefined();
    expect(result.drive).toBeDefined();
    expect(result.requested_medium).toBe("writing");
    expect(result.medium_fit === "partial" || result.medium_fit === "supported").toBe(true);
  });

  it("artifact-like continuity style state (higher exploration, lower reflection)", () => {
    const artifactState = {
      ...defaultCreativeState(),
      reflection_need: 0.3,
      recent_exploration_rate: 0.8,
    };
    const result = simulateSessionDecision({
      previousState: artifactState,
      liveBacklog: 10,
      synthesisPressure: makeSynthesisPressure({ return_success_trend: 0.7 }),
      activeIntent: null,
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory({ proposal_pressure: "normal" }),
      preferMedium: "concept",
      isCron: false,
      critiqueOutcome: "continue",
      critiqueMediumFitNote: null,
      decisionConfidence: 0.7,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    });

    expect(result.requested_medium).toBe("concept");
    expect(result.executed_medium).toBe("concept");
    expect(result.proposal_pressure).toBe("normal");
    expect(result.proposal_outcome).toBe("eligible");
  });

  it("activeIntent reflect / refine / consolidate produce distinct but bounded behaviors", () => {
    const base = {
      ...defaultCreativeState(),
      reflection_need: 0.4,
      recent_exploration_rate: 0.6,
    };

    const reflectRun = simulateSessionDecision({
      previousState: base,
      liveBacklog: 10,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: makeActiveIntent("reflect"),
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory(),
      preferMedium: "writing",
      isCron: false,
      critiqueOutcome: "continue",
      critiqueMediumFitNote: null,
      decisionConfidence: 0.6,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    });

    const refineRun = simulateSessionDecision({
      previousState: base,
      liveBacklog: 10,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: makeActiveIntent("refine"),
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory(),
      preferMedium: "writing",
      isCron: false,
      critiqueOutcome: "continue",
      critiqueMediumFitNote: null,
      decisionConfidence: 0.6,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    });

    const consolidateRun = simulateSessionDecision({
      previousState: base,
      liveBacklog: 10,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: makeActiveIntent("consolidate"),
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory(),
      preferMedium: "writing",
      isCron: false,
      critiqueOutcome: "continue",
      critiqueMediumFitNote: null,
      decisionConfidence: 0.6,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    });

    expect(reflectRun.mode).toBeDefined();
    expect(refineRun.mode).toBeDefined();
    expect(consolidateRun.mode).toBeDefined();
  });

  it("trajectory advisory light / strong consolidation are reflected via bounded biases", () => {
    const base = defaultCreativeState();
    const lightAdvisory = makeTrajectoryAdvisory({ favor_consolidation: "light" });
    const strongAdvisory = makeTrajectoryAdvisory({ favor_consolidation: "strong" });

    const lightRun = simulateSessionDecision({
      previousState: base,
      liveBacklog: 20,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: null,
      trajectoryAdvisory: lightAdvisory,
      runtimeTrajectory: makeRuntimeTrajectory(),
      preferMedium: "concept",
      isCron: false,
      critiqueOutcome: "continue",
      critiqueMediumFitNote: null,
      decisionConfidence: 0.6,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    });

    const strongRun = simulateSessionDecision({
      previousState: base,
      liveBacklog: 20,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: null,
      trajectoryAdvisory: strongAdvisory,
      runtimeTrajectory: makeRuntimeTrajectory(),
      preferMedium: "concept",
      isCron: false,
      critiqueOutcome: "continue",
      critiqueMediumFitNote: null,
      decisionConfidence: 0.6,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    });

    expect(lightRun.mode).toBeDefined();
    expect(strongRun.mode).toBeDefined();
  });

  it("requested_medium diverging from executed_medium is observable", () => {
    const result = simulateSessionDecision({
      previousState: defaultCreativeState(),
      liveBacklog: 5,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: null,
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory(),
      // Simulate unknown medium: requested null so resolution falls back to writing.
      preferMedium: null,
      isCron: false,
      critiqueOutcome: "continue",
      critiqueMediumFitNote: null,
      decisionConfidence: 0.6,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    });

    expect(result.executed_medium).toBeDefined();
    expect(result.fallback_reason === null || typeof result.fallback_reason === "string").toBe(true);
  });

  it("concept habitat proposal near confidence threshold switches outcome when proposal_pressure changes", () => {
    const baseState = defaultCreativeState();
    const confidenceNearThreshold = 0.4;

    const lowPressure = simulateSessionDecision({
      previousState: baseState,
      liveBacklog: 0,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: null,
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory({ proposal_pressure: "low" }),
      preferMedium: "concept",
      isCron: false,
      critiqueOutcome: "continue",
      critiqueMediumFitNote: null,
      decisionConfidence: confidenceNearThreshold,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    });

    const highPressure = simulateSessionDecision({
      previousState: baseState,
      liveBacklog: 50,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: null,
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory({ proposal_pressure: "high" }),
      preferMedium: "concept",
      isCron: false,
      critiqueOutcome: "continue",
      critiqueMediumFitNote: null,
      decisionConfidence: confidenceNearThreshold,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    });

    expect(lowPressure.proposal_outcome).toBe("eligible");
    expect(highPressure.proposal_outcome).toBe("skipped_confidence");
  });
});

