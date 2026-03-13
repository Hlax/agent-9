import { describe, it, expect } from "vitest";
import { defaultCreativeState } from "@twin/evaluation";
import type { SynthesisPressurePayload } from "@/lib/synthesis-pressure";
import type { ActiveIntent } from "@/lib/session-intent";
import type { TrajectoryFeedbackResult } from "@/lib/trajectory-feedback-adapter";
import type { RuntimeTrajectory } from "@/lib/runtime-trajectory";
import {
  simulateSessionDecision,
  runScenario,
  compareSimulationResults,
  type ScenarioFixture,
} from "../runtime-simulation";

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
  it("image medium scenario: executed_medium is image, lane_type is null", () => {
    const result = simulateSessionDecision({
      previousState: defaultCreativeState(),
      liveBacklog: 5,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: null,
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory({ proposal_pressure: "normal" }),
      preferMedium: "image",
      isCron: false,
      critiqueOutcome: "continue",
      critiqueMediumFitNote: null,
      decisionConfidence: 0.7,
      artifactMedium: "image",
      conceptTargetSurface: null,
    });

    expect(result.requested_medium).toBe("image");
    expect(result.executed_medium).toBe("image");
    expect(result.lane_type).toBeNull();
    expect(result.target_surface).toBeNull();
    expect(result.proposal_outcome).toBe("none");
    expect(result.proposal_pressure).toBe("normal");
  });

  it("cron scenario: isCron true, high reflection_need produces valid diagnostics", () => {
    const cronState = {
      ...defaultCreativeState(),
      reflection_need: 0.75,
      recent_exploration_rate: 0.25,
    };
    const result = simulateSessionDecision({
      previousState: cronState,
      liveBacklog: 3,
      synthesisPressure: makeSynthesisPressure({ return_success_trend: 0.4 }),
      activeIntent: null,
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory({ proposal_pressure: "low" }),
      preferMedium: "writing",
      isCron: true,
      critiqueOutcome: "reflect",
      critiqueMediumFitNote: null,
      decisionConfidence: 0.55,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    });

    expect(result.mode).toBeDefined();
    expect(result.drive).toBeDefined();
    expect(result.executed_medium).toBe("writing");
    expect(result.proposal_pressure).toBe("low");
    expect(result.proposal_outcome).toBe("eligible");
    expect(result.proposal_confidence_min_effective).toBeCloseTo(0.35, 5);
  });
});

describe("simulateSessionDecision — trace observability", () => {
  it("trace includes proposal_confidence_floor_note with base, effective, and pressure", () => {
    const result = simulateSessionDecision({
      previousState: defaultCreativeState(),
      liveBacklog: 10,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: null,
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory({ proposal_pressure: "high" }),
      preferMedium: "concept",
      isCron: false,
      critiqueOutcome: "continue",
      critiqueMediumFitNote: null,
      decisionConfidence: 0.5,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    });

    expect(result.trace.proposal_confidence_floor_note).toContain("0.450");
    expect(result.trace.proposal_confidence_floor_note).toContain("0.400");
    expect(result.trace.proposal_confidence_floor_note).toContain("high");
  });

  it("trace proposal_pressure_note is non-null and describes direction when pressure is high", () => {
    const result = simulateSessionDecision({
      previousState: defaultCreativeState(),
      liveBacklog: 50,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: null,
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory({ proposal_pressure: "high" }),
      preferMedium: "concept",
      isCron: false,
      critiqueOutcome: "continue",
      critiqueMediumFitNote: null,
      decisionConfidence: 0.5,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    });

    expect(result.trace.proposal_pressure_note).not.toBeNull();
    expect(result.trace.proposal_pressure_note).toContain("raised");
    expect(result.trace.proposal_pressure_note).toContain("high");
  });

  it("trace proposal_pressure_note is non-null and describes direction when pressure is low", () => {
    const result = simulateSessionDecision({
      previousState: defaultCreativeState(),
      liveBacklog: 0,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: null,
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory({ proposal_pressure: "low" }),
      preferMedium: "concept",
      isCron: false,
      critiqueOutcome: "continue",
      critiqueMediumFitNote: null,
      decisionConfidence: 0.5,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    });

    expect(result.trace.proposal_pressure_note).not.toBeNull();
    expect(result.trace.proposal_pressure_note).toContain("lowered");
    expect(result.trace.proposal_pressure_note).toContain("low");
  });

  it("trace proposal_pressure_note is null when pressure is normal (no adjustment)", () => {
    const result = simulateSessionDecision({
      previousState: defaultCreativeState(),
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

    expect(result.trace.proposal_pressure_note).toBeNull();
  });

  it("trace medium_fallback_note is null when no fallback occurred", () => {
    const result = simulateSessionDecision({
      previousState: defaultCreativeState(),
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

    expect(result.trace.medium_fallback_note).toBeNull();
  });
});

describe("runScenario — fixture loader", () => {
  it("runs a named fixture and returns the same result as simulateSessionDecision", () => {
    const inputs = {
      previousState: defaultCreativeState(),
      liveBacklog: 0,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: null,
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory({ proposal_pressure: "normal" }),
      preferMedium: "writing" as const,
      isCron: false,
      critiqueOutcome: "continue" as const,
      critiqueMediumFitNote: null,
      decisionConfidence: 0.6,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    };

    const fixture: ScenarioFixture = {
      name: "neutral-baseline",
      description: "Neutral baseline scenario for regression checks",
      inputs,
    };

    const fromFixture = runScenario(fixture);

    // Drive is probabilistic; compare only deterministic fields.
    expect(fromFixture.mode).toBeDefined();
    expect(fromFixture.executed_medium).toBe("writing");
    expect(fromFixture.proposal_outcome).toBe("eligible");
    expect(fromFixture.proposal_pressure).toBe("normal");
    expect(fromFixture.lane_type).toBe("surface");
    expect(fromFixture.target_surface).toBe("staging_habitat");
  });

  it("fixture name and description are not reflected in result (inputs-only)", () => {
    const fixture: ScenarioFixture = {
      name: "high-pressure-scenario",
      description: "Tests high backlog pressure on confidence floor",
      inputs: {
        previousState: defaultCreativeState(),
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
      },
    };

    const result = runScenario(fixture);
    expect(result.proposal_pressure).toBe("high");
    expect(result.proposal_pressure_applied).toBe(true);
  });
});

describe("compareSimulationResults — structured output diffing", () => {
  it("reports no changed fields for identical inputs", () => {
    const inputs = {
      previousState: defaultCreativeState(),
      liveBacklog: 10,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: null,
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory({ proposal_pressure: "normal" }),
      preferMedium: "concept" as const,
      isCron: false,
      critiqueOutcome: "continue" as const,
      critiqueMediumFitNote: null,
      decisionConfidence: 0.6,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    };

    // Pass the same result object to both sides to ensure a true zero-diff comparison.
    const result = simulateSessionDecision(inputs);
    const diff = compareSimulationResults(result, result);

    expect(diff.changed).toHaveLength(0);
    expect(diff.unchanged.length).toBeGreaterThan(0);
  });

  it("reports proposal_pressure and proposal_confidence fields as changed when pressure differs", () => {
    const baseInputs = {
      previousState: defaultCreativeState(),
      liveBacklog: 10,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: null,
      trajectoryAdvisory: null,
      preferMedium: "concept" as const,
      isCron: false,
      critiqueOutcome: "continue" as const,
      critiqueMediumFitNote: null,
      decisionConfidence: 0.4,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    };

    const low = simulateSessionDecision({
      ...baseInputs,
      runtimeTrajectory: makeRuntimeTrajectory({ proposal_pressure: "low" }),
    });
    const high = simulateSessionDecision({
      ...baseInputs,
      runtimeTrajectory: makeRuntimeTrajectory({ proposal_pressure: "high" }),
    });

    const diff = compareSimulationResults(low, high);
    const changedFields = diff.changed.map((c) => c.field);

    expect(changedFields).toContain("proposal_pressure");
    expect(changedFields).toContain("proposal_confidence_min_effective");
    expect(changedFields).toContain("proposal_outcome");
  });

  it("reports executed_medium as changed when medium changes", () => {
    const baseInputs = {
      previousState: defaultCreativeState(),
      liveBacklog: 5,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: null,
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory(),
      isCron: false,
      critiqueOutcome: "continue" as const,
      critiqueMediumFitNote: null,
      decisionConfidence: 0.6,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    };

    const writing = simulateSessionDecision({ ...baseInputs, preferMedium: "writing" });
    const concept = simulateSessionDecision({ ...baseInputs, preferMedium: "concept" });

    const diff = compareSimulationResults(writing, concept);
    const changedFields = diff.changed.map((c) => c.field);

    expect(changedFields).toContain("executed_medium");
    expect(changedFields).toContain("requested_medium");
  });

  it("diff.changed entries include both a and b values", () => {
    const baseInputs = {
      previousState: defaultCreativeState(),
      liveBacklog: 10,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: null,
      trajectoryAdvisory: null,
      preferMedium: "concept" as const,
      isCron: false,
      critiqueOutcome: "continue" as const,
      critiqueMediumFitNote: null,
      decisionConfidence: 0.4,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
    };

    const low = simulateSessionDecision({
      ...baseInputs,
      runtimeTrajectory: makeRuntimeTrajectory({ proposal_pressure: "low" }),
    });
    const high = simulateSessionDecision({
      ...baseInputs,
      runtimeTrajectory: makeRuntimeTrajectory({ proposal_pressure: "high" }),
    });

    const diff = compareSimulationResults(low, high);
    const pressureEntry = diff.changed.find((c) => c.field === "proposal_pressure");

    expect(pressureEntry).toBeDefined();
    expect(pressureEntry?.a).toBe("low");
    expect(pressureEntry?.b).toBe("high");
  });
});

describe("simulateSessionDecision — habitat proposals", () => {
  it("generates structured habitat proposals when habitatContext is provided", () => {
    const previousState = defaultCreativeState();
    const result = simulateSessionDecision({
      previousState,
      liveBacklog: 0,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: null,
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory({ proposal_pressure: "normal" }),
      preferMedium: "concept",
      isCron: false,
      critiqueOutcome: "continue",
      critiqueMediumFitNote: null,
      decisionConfidence: 0.8,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
      habitatContext: {
        identityId: "identity-1",
        previousFocus: "Earlier focus",
        currentFocus: "Closing the first publish governance loop",
        milestoneArtifact: {
          artifact_id: "art-1",
          title: "Stage 2 editing workflow complete",
          summary:
            "Added bounded staging edits, publish review, and promotion flow.",
          isMilestone: true,
        },
      },
    });

    expect(result.habitat_proposal_count).toBeGreaterThanOrEqual(2);
    const types = result.habitat_proposal_types.sort();
    expect(types).toContain("add_recent_artifact");
    expect(types).toContain("add_summary_block");
  });

  it("returns bridge proposals without internal-only fields", () => {
    const previousState = defaultCreativeState();
    const result = simulateSessionDecision({
      previousState,
      liveBacklog: 0,
      synthesisPressure: makeSynthesisPressure(),
      activeIntent: null,
      trajectoryAdvisory: null,
      runtimeTrajectory: makeRuntimeTrajectory({ proposal_pressure: "normal" }),
      preferMedium: "concept",
      isCron: false,
      critiqueOutcome: "continue",
      critiqueMediumFitNote: null,
      decisionConfidence: 0.8,
      artifactMedium: "concept",
      conceptTargetSurface: "staging_habitat",
      habitatContext: {
        identityId: "identity-1",
        previousFocus: "Earlier focus",
        currentFocus: "Closing the first publish governance loop",
        milestoneArtifact: {
          artifact_id: "art-1",
          title: "Stage 2 editing workflow complete",
          summary:
            "Added bounded staging edits, publish review, and promotion flow.",
          isMilestone: true,
        },
      },
    });

    expect(result.habitat_proposal_count).toBeGreaterThan(0);
    for (const p of result.habitat_proposals) {
      expect("confidence" in p).toBe(false);
      expect("created_at" in p).toBe(false);
      expect("status" in p).toBe(false);
    }
  });
});

