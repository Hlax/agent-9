import { describe, it, expect } from "vitest";
import {
  updateCreativeState,
  defaultCreativeState,
  stateToSnapshotRow,
} from "@twin/evaluation";
import type { CreativeStateSignals } from "@twin/evaluation";
import type { EvaluationSignal } from "@twin/core";

function makeEval(overrides: Partial<EvaluationSignal> = {}): EvaluationSignal {
  return {
    evaluation_signal_id: "test-id",
    target_type: "artifact",
    target_id: "art-1",
    alignment_score: 0.5,
    emergence_score: 0.5,
    fertility_score: 0.5,
    pull_score: 0.5,
    recurrence_score: null,
    resonance_score: null,
    rationale: "test",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("updateCreativeState — signals parameter (A-6)", () => {
  describe("isReflection signal", () => {
    it("lowers reflection_need when isReflection is true", () => {
      const prev = { ...defaultCreativeState(), reflection_need: 0.7 };
      const withSignal = updateCreativeState(prev, makeEval(), { isReflection: true });
      const withoutSignal = updateCreativeState(prev, makeEval(), { isReflection: false });
      expect(withSignal.reflection_need).toBeLessThan(withoutSignal.reflection_need);
    });

    it("does not change reflection_need direction when isReflection is false", () => {
      const prev = { ...defaultCreativeState(), reflection_need: 0.5 };
      const withSignal = updateCreativeState(prev, makeEval(), { isReflection: false });
      const noSignals = updateCreativeState(prev, makeEval());
      // Both should produce the same reflection_need (no signal = same as false)
      expect(withSignal.reflection_need).toBeCloseTo(noSignals.reflection_need, 5);
    });

    it("defaults to false when signals are omitted (backward compat)", () => {
      const prev = { ...defaultCreativeState(), reflection_need: 0.7 };
      const withoutSignals = updateCreativeState(prev, makeEval());
      const withFalse = updateCreativeState(prev, makeEval(), { isReflection: false });
      expect(withoutSignals.reflection_need).toBeCloseTo(withFalse.reflection_need, 5);
    });
  });

  describe("exploredNewMedium signal", () => {
    it("bumps expression_diversity when exploredNewMedium is true", () => {
      const prev = { ...defaultCreativeState(), expression_diversity: 0.5 };
      const withSignal = updateCreativeState(prev, makeEval(), { exploredNewMedium: true });
      const withoutSignal = updateCreativeState(prev, makeEval(), { exploredNewMedium: false });
      expect(withSignal.expression_diversity).toBeGreaterThan(withoutSignal.expression_diversity);
    });

    it("bump is approximately +0.12", () => {
      const prev = { ...defaultCreativeState(), expression_diversity: 0.5 };
      const with_ = updateCreativeState(prev, makeEval(), { exploredNewMedium: true });
      const without = updateCreativeState(prev, makeEval(), { exploredNewMedium: false });
      const diff = with_.expression_diversity - without.expression_diversity;
      expect(diff).toBeCloseTo(0.12, 5);
    });

    it("does not exceed 1.0 even when expression_diversity is near ceiling", () => {
      const prev = { ...defaultCreativeState(), expression_diversity: 0.99 };
      const result = updateCreativeState(prev, makeEval(), { exploredNewMedium: true });
      expect(result.expression_diversity).toBeLessThanOrEqual(1.0);
    });

    it("defaults to false when signals omitted — no expression_diversity bump", () => {
      const prev = { ...defaultCreativeState(), expression_diversity: 0.5 };
      const withFalse = updateCreativeState(prev, makeEval(), { exploredNewMedium: false });
      const noSignals = updateCreativeState(prev, makeEval());
      expect(withFalse.expression_diversity).toBeCloseTo(noSignals.expression_diversity, 5);
    });
  });

  describe("addedUnfinishedWork signal", () => {
    it("bumps unfinished_projects when addedUnfinishedWork is true", () => {
      const prev = { ...defaultCreativeState(), unfinished_projects: 0.3 };
      const withSignal = updateCreativeState(prev, makeEval(), { addedUnfinishedWork: true });
      const withoutSignal = updateCreativeState(prev, makeEval(), { addedUnfinishedWork: false });
      expect(withSignal.unfinished_projects).toBeGreaterThan(withoutSignal.unfinished_projects);
    });

    it("bump is approximately +0.1", () => {
      const prev = { ...defaultCreativeState(), unfinished_projects: 0.3 };
      const with_ = updateCreativeState(prev, makeEval(), { addedUnfinishedWork: true });
      const without = updateCreativeState(prev, makeEval(), { addedUnfinishedWork: false });
      const diff = with_.unfinished_projects - without.unfinished_projects;
      expect(diff).toBeCloseTo(0.1, 5);
    });

    it("does not exceed 1.0 when unfinished_projects is near ceiling", () => {
      const prev = { ...defaultCreativeState(), unfinished_projects: 0.99 };
      const result = updateCreativeState(prev, makeEval(), { addedUnfinishedWork: true });
      expect(result.unfinished_projects).toBeLessThanOrEqual(1.0);
    });

    it("defaults to false when signals omitted — no unfinished_projects bump", () => {
      const prev = { ...defaultCreativeState(), unfinished_projects: 0.3 };
      const withFalse = updateCreativeState(prev, makeEval(), { addedUnfinishedWork: false });
      const noSignals = updateCreativeState(prev, makeEval());
      expect(withFalse.unfinished_projects).toBeCloseTo(noSignals.unfinished_projects, 5);
    });
  });

  describe("combined signals", () => {
    it("all three signals active simultaneously produce expected delta", () => {
      const prev = {
        ...defaultCreativeState(),
        reflection_need: 0.7,
        expression_diversity: 0.4,
        unfinished_projects: 0.2,
      };
      const result = updateCreativeState(prev, makeEval(), {
        isReflection: true,
        exploredNewMedium: true,
        addedUnfinishedWork: true,
      });
      // reflection_need should drop
      expect(result.reflection_need).toBeLessThan(prev.reflection_need);
      // expression_diversity should rise
      expect(result.expression_diversity).toBeGreaterThan(prev.expression_diversity);
      // unfinished_projects should rise
      expect(result.unfinished_projects).toBeGreaterThan(prev.unfinished_projects);
    });

    it("no signals (default) leaves expression_diversity and unfinished_projects unchanged from base", () => {
      const prev = defaultCreativeState();
      const withNoSignals = updateCreativeState(prev, makeEval());
      const withAllFalse = updateCreativeState(prev, makeEval(), {
        isReflection: false,
        exploredNewMedium: false,
        addedUnfinishedWork: false,
      });
      expect(withNoSignals.expression_diversity).toBeCloseTo(withAllFalse.expression_diversity, 5);
      expect(withNoSignals.unfinished_projects).toBeCloseTo(withAllFalse.unfinished_projects, 5);
      expect(withNoSignals.reflection_need).toBeCloseTo(withAllFalse.reflection_need, 5);
    });
  });

  describe("repetitionDetected still works with signals", () => {
    it("repetitionDetected overrides reflection_need to at least 0.7", () => {
      const prev = { ...defaultCreativeState(), reflection_need: 0.1 };
      const result = updateCreativeState(prev, makeEval(), { repetitionDetected: true, isReflection: false });
      expect(result.reflection_need).toBeGreaterThanOrEqual(0.7);
    });

    it("isReflection + repetitionDetected: repetition floor wins when reflection_need ends up high", () => {
      const prev = { ...defaultCreativeState(), reflection_need: 0.8 };
      // isReflection would lower, repetitionDetected would clamp to max(prev, 0.7)
      const result = updateCreativeState(prev, makeEval(), { repetitionDetected: true, isReflection: true });
      // After isReflection: 0.8 - 0.2 = 0.6; repetition: max(0.6, 0.7) = 0.7
      expect(result.reflection_need).toBeGreaterThanOrEqual(0.7);
    });
  });
});

/**
 * Acceptance tests for Task 1 (no-artifact / reflection-only session state evolution).
 * Validates the canonical contract used in session-runner no-artifact branch:
 *   updateCreativeState(previousState, neutralEval, { isReflection, repetitionDetected })
 */
describe("no-artifact session state evolution — neutral evaluation (Task 1 acceptance)", () => {
  /** Neutral evaluation signal matching neutralEvaluationSignalForNoArtifact in session-runner. */
  function neutralEval(): EvaluationSignal {
    return makeEval({
      alignment_score: 0.5,
      emergence_score: 0.5,
      fertility_score: 0.5,
      pull_score: 0.5,
      recurrence_score: 0.2,
      resonance_score: 0.5,
      target_type: "session",
      rationale: "no-artifact session; neutral signal for state evolution",
    });
  }

  it("neutral evaluation keeps all state fields within [0, 1]", () => {
    const prev = defaultCreativeState();
    const next = updateCreativeState(prev, neutralEval(), {});
    for (const key of Object.keys(next) as (keyof typeof next)[]) {
      expect(next[key]).toBeGreaterThanOrEqual(0);
      expect(next[key]).toBeLessThanOrEqual(1);
    }
  });

  it("neutral evaluation produces only small state deltas (no extreme shifts)", () => {
    const prev = defaultCreativeState();
    const next = updateCreativeState(prev, neutralEval(), {});
    // All fields should stay within 0.15 of previous values for neutral input
    for (const key of Object.keys(next) as (keyof typeof next)[]) {
      expect(Math.abs(next[key] - prev[key])).toBeLessThan(0.15);
    }
  });

  it("reflection session (isReflection=true) lowers reflection_need even with neutral eval", () => {
    const prev = { ...defaultCreativeState(), reflection_need: 0.7 };
    const next = updateCreativeState(prev, neutralEval(), { isReflection: true });
    expect(next.reflection_need).toBeLessThan(prev.reflection_need);
  });

  it("non-reflection session (isReflection=false) does not lower reflection_need via isReflection", () => {
    const prev = { ...defaultCreativeState(), reflection_need: 0.7 };
    const withFalse = updateCreativeState(prev, neutralEval(), { isReflection: false });
    const withTrue = updateCreativeState(prev, neutralEval(), { isReflection: true });
    expect(withFalse.reflection_need).toBeGreaterThan(withTrue.reflection_need);
  });

  it("no-artifact path uses same stateToSnapshotRow contract as artifact path", () => {
    // Verify the canonical contract: stateToSnapshotRow(nextState, sessionId, null)
    // produces a valid row shape with all required numeric fields
    const prev = defaultCreativeState();
    const next = updateCreativeState(prev, neutralEval(), { isReflection: true });
    const row = stateToSnapshotRow(next, "sess-test", null);
    expect(typeof row.state_snapshot_id).toBe("string");
    expect(row.session_id).toBe("sess-test");
    expect(row.notes).toBeNull();
    // All score fields present and numeric
    for (const field of [
      "identity_stability", "avatar_alignment", "expression_diversity",
      "unfinished_projects", "recent_exploration_rate", "creative_tension",
      "curiosity_level", "reflection_need", "idea_recurrence", "public_curation_backlog",
    ] as const) {
      expect(typeof row[field]).toBe("number");
      expect(row[field]).toBeGreaterThanOrEqual(0);
      expect(row[field]).toBeLessThanOrEqual(1);
    }
  });
});
