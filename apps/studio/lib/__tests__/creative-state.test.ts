import { describe, it, expect } from "vitest";
import { updateCreativeState, defaultCreativeState } from "@twin/evaluation";

describe("updateCreativeState – C-2 reflection_need signals", () => {
  const baseEval = {
    evaluation_signal_id: "e1",
    target_type: "artifact" as const,
    target_id: "a1",
    // novelty = emergence * 0.6 + (1 - recurrence) * 0.4
    // Use high novelty (> 0.35) so the novelty branch doesn't bump reflection_need.
    emergence_score: 0.8,
    recurrence_score: 0.2,
    pull_score: 0.5,
    alignment_score: 0.5,
    fertility_score: 0.5,
    resonance_score: 0.5,
    rationale: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it("non-reflect session does not decrease reflection_need", () => {
    const prev = { ...defaultCreativeState(), reflection_need: 0.5 };
    const next = updateCreativeState(prev, baseEval, { isReflection: false });
    // Without low novelty and without reflection, reflection_need should be unchanged (or only novelty-path change).
    expect(next.reflection_need).toBeGreaterThanOrEqual(prev.reflection_need);
  });

  it("reflect session decreases reflection_need by 0.2", () => {
    const prev = { ...defaultCreativeState(), reflection_need: 0.5 };
    const next = updateCreativeState(prev, baseEval, { isReflection: true });
    // reflection_need should decrease by 0.2 (clamped to 0–1).
    expect(next.reflection_need).toBeCloseTo(0.3, 5);
  });

  it("reflect session decreases reflection_need to floor of 0 when already low", () => {
    const prev = { ...defaultCreativeState(), reflection_need: 0.1 };
    const next = updateCreativeState(prev, baseEval, { isReflection: true });
    expect(next.reflection_need).toBeGreaterThanOrEqual(0);
    expect(next.reflection_need).toBeLessThan(prev.reflection_need);
  });

  it("repetitionDetected bumps reflection_need to at least 0.7 even during reflect", () => {
    const prev = { ...defaultCreativeState(), reflection_need: 0.4 };
    const next = updateCreativeState(prev, baseEval, {
      isReflection: true,
      repetitionDetected: true,
    });
    // repetitionDetected overrides reflection reduction and sets floor at 0.7.
    expect(next.reflection_need).toBeGreaterThanOrEqual(0.7);
  });

  it("legacy boolean third arg (repetitionDetected=true) still works", () => {
    const prev = { ...defaultCreativeState(), reflection_need: 0.3 };
    const next = updateCreativeState(prev, baseEval, true);
    expect(next.reflection_need).toBeGreaterThanOrEqual(0.7);
  });

  it("legacy boolean third arg (repetitionDetected=false) still works", () => {
    const prev = { ...defaultCreativeState(), reflection_need: 0.5 };
    const next = updateCreativeState(prev, baseEval, false);
    expect(next.reflection_need).toBeGreaterThanOrEqual(prev.reflection_need);
  });
});
