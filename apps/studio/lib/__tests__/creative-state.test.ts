import { describe, it, expect } from "vitest";
import {
  updateCreativeState,
  defaultCreativeState,
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
      const withSignal = updateCreativeState(prev, makeEval(), false, { isReflection: true });
      const withoutSignal = updateCreativeState(prev, makeEval(), false, { isReflection: false });
      expect(withSignal.reflection_need).toBeLessThan(withoutSignal.reflection_need);
    });

    it("does not change reflection_need direction when isReflection is false", () => {
      const prev = { ...defaultCreativeState(), reflection_need: 0.5 };
      const withSignal = updateCreativeState(prev, makeEval(), false, { isReflection: false });
      const noSignals = updateCreativeState(prev, makeEval());
      // Both should produce the same reflection_need (no signal = same as false)
      expect(withSignal.reflection_need).toBeCloseTo(noSignals.reflection_need, 5);
    });

    it("defaults to false when signals are omitted (backward compat)", () => {
      const prev = { ...defaultCreativeState(), reflection_need: 0.7 };
      const withoutSignals = updateCreativeState(prev, makeEval());
      const withFalse = updateCreativeState(prev, makeEval(), false, { isReflection: false });
      expect(withoutSignals.reflection_need).toBeCloseTo(withFalse.reflection_need, 5);
    });
  });

  describe("exploredNewMedium signal", () => {
    it("bumps expression_diversity when exploredNewMedium is true", () => {
      const prev = { ...defaultCreativeState(), expression_diversity: 0.5 };
      const withSignal = updateCreativeState(prev, makeEval(), false, { exploredNewMedium: true });
      const withoutSignal = updateCreativeState(prev, makeEval(), false, { exploredNewMedium: false });
      expect(withSignal.expression_diversity).toBeGreaterThan(withoutSignal.expression_diversity);
    });

    it("bump is approximately +0.12", () => {
      const prev = { ...defaultCreativeState(), expression_diversity: 0.5 };
      const with_ = updateCreativeState(prev, makeEval(), false, { exploredNewMedium: true });
      const without = updateCreativeState(prev, makeEval(), false, { exploredNewMedium: false });
      const diff = with_.expression_diversity - without.expression_diversity;
      expect(diff).toBeCloseTo(0.12, 5);
    });

    it("does not exceed 1.0 even when expression_diversity is near ceiling", () => {
      const prev = { ...defaultCreativeState(), expression_diversity: 0.99 };
      const result = updateCreativeState(prev, makeEval(), false, { exploredNewMedium: true });
      expect(result.expression_diversity).toBeLessThanOrEqual(1.0);
    });

    it("defaults to false when signals omitted — no expression_diversity bump", () => {
      const prev = { ...defaultCreativeState(), expression_diversity: 0.5 };
      const withFalse = updateCreativeState(prev, makeEval(), false, { exploredNewMedium: false });
      const noSignals = updateCreativeState(prev, makeEval());
      expect(withFalse.expression_diversity).toBeCloseTo(noSignals.expression_diversity, 5);
    });
  });

  describe("addedUnfinishedWork signal", () => {
    it("bumps unfinished_projects when addedUnfinishedWork is true", () => {
      const prev = { ...defaultCreativeState(), unfinished_projects: 0.3 };
      const withSignal = updateCreativeState(prev, makeEval(), false, { addedUnfinishedWork: true });
      const withoutSignal = updateCreativeState(prev, makeEval(), false, { addedUnfinishedWork: false });
      expect(withSignal.unfinished_projects).toBeGreaterThan(withoutSignal.unfinished_projects);
    });

    it("bump is approximately +0.1", () => {
      const prev = { ...defaultCreativeState(), unfinished_projects: 0.3 };
      const with_ = updateCreativeState(prev, makeEval(), false, { addedUnfinishedWork: true });
      const without = updateCreativeState(prev, makeEval(), false, { addedUnfinishedWork: false });
      const diff = with_.unfinished_projects - without.unfinished_projects;
      expect(diff).toBeCloseTo(0.1, 5);
    });

    it("does not exceed 1.0 when unfinished_projects is near ceiling", () => {
      const prev = { ...defaultCreativeState(), unfinished_projects: 0.99 };
      const result = updateCreativeState(prev, makeEval(), false, { addedUnfinishedWork: true });
      expect(result.unfinished_projects).toBeLessThanOrEqual(1.0);
    });

    it("defaults to false when signals omitted — no unfinished_projects bump", () => {
      const prev = { ...defaultCreativeState(), unfinished_projects: 0.3 };
      const withFalse = updateCreativeState(prev, makeEval(), false, { addedUnfinishedWork: false });
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
      const result = updateCreativeState(prev, makeEval(), false, {
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
      const withAllFalse = updateCreativeState(prev, makeEval(), false, {
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
      const result = updateCreativeState(prev, makeEval(), true, { isReflection: false });
      expect(result.reflection_need).toBeGreaterThanOrEqual(0.7);
    });

    it("isReflection + repetitionDetected: repetition floor wins when reflection_need ends up high", () => {
      const prev = { ...defaultCreativeState(), reflection_need: 0.8 };
      // isReflection would lower, repetitionDetected would clamp to max(prev, 0.7)
      const result = updateCreativeState(prev, makeEval(), true, { isReflection: true });
      // After isReflection: 0.8 - 0.2 = 0.6; repetition: max(0.6, 0.7) = 0.7
      expect(result.reflection_need).toBeGreaterThanOrEqual(0.7);
    });
  });
});
