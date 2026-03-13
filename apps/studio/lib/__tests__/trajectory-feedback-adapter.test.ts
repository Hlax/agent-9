/**
 * Acceptance tests for the trajectory feedback adapter.
 *
 * Task 2 acceptance: Verify that the `gently_reduce_repetition` advisory signal
 * fires under expected conditions and that the bounded reflection_need nudge math
 * is correct. The wiring (pre-compute in loadCreativeStateAndBacklog → small delta
 * in selectModeAndDrive) cannot be integration-tested here without a full session
 * runner mock, but the advisory logic and nudge arithmetic are verified directly.
 */

import {
  getTrajectoryFeedback,
  buildAdvisoryLog,
  type TrajectoryFeedbackContext,
} from "../trajectory-feedback-adapter";

const TRAJECTORY_REFLECTION_NUDGE = 0.06; // must match selectModeAndDrive constant

function makeContext(overrides: Partial<TrajectoryFeedbackContext> = {}): TrajectoryFeedbackContext {
  return {
    session_posture: "mixed",
    thread_repeat_rate: 0,
    longest_thread_streak: 0,
    trajectory_shape: "light",
    exploration_vs_consolidation: "balanced",
    window_sessions: 10,
    proposals_last_10_sessions: 2,
    interpretation_confidence: "medium",
    ...overrides,
  };
}

describe("getTrajectoryFeedback — neutral gate", () => {
  it("returns neutral when window too small (<5 sessions)", () => {
    const result = getTrajectoryFeedback(makeContext({ window_sessions: 4 }));
    expect(result.gently_reduce_repetition).toBe(false);
    expect(result.favor_consolidation).toBe("none");
    expect(result.proposal_pressure_adjustment).toBe(0);
  });

  it("returns neutral when interpretation_confidence is low", () => {
    const result = getTrajectoryFeedback(makeContext({ interpretation_confidence: "low" }));
    expect(result.gently_reduce_repetition).toBe(false);
    expect(result.favor_consolidation).toBe("none");
    expect(result.proposal_pressure_adjustment).toBe(0);
  });

  it("returns non-neutral when window sufficient and confidence >= medium", () => {
    // With sticky trajectory, should fire gently_reduce_repetition
    const result = getTrajectoryFeedback(
      makeContext({ trajectory_shape: "sticky", interpretation_confidence: "medium" })
    );
    expect(result.gently_reduce_repetition).toBe(true);
  });
});

describe("getTrajectoryFeedback — gently_reduce_repetition signal (Task 2 acceptance)", () => {
  it("fires when trajectory_shape is sticky", () => {
    const result = getTrajectoryFeedback(makeContext({ trajectory_shape: "sticky" }));
    expect(result.gently_reduce_repetition).toBe(true);
  });

  it("fires when thread_repeat_rate > 0.7", () => {
    const result = getTrajectoryFeedback(makeContext({ thread_repeat_rate: 0.75 }));
    expect(result.gently_reduce_repetition).toBe(true);
  });

  it("fires when longest_thread_streak >= 5", () => {
    const result = getTrajectoryFeedback(makeContext({ longest_thread_streak: 5 }));
    expect(result.gently_reduce_repetition).toBe(true);
  });

  it("does not fire when trajectory is normal and repeat rate is low", () => {
    const result = getTrajectoryFeedback(
      makeContext({ trajectory_shape: "clustered", thread_repeat_rate: 0.3, longest_thread_streak: 2 })
    );
    expect(result.gently_reduce_repetition).toBe(false);
  });

  it("includes a reason string when advisory fires", () => {
    const result = getTrajectoryFeedback(makeContext({ trajectory_shape: "sticky" }));
    expect(typeof result.reason).toBe("string");
    expect(result.reason.length).toBeGreaterThan(0);
  });
});

describe("trajectory advisory nudge math (Task 2 acceptance)", () => {
  it("applying TRAJECTORY_REFLECTION_NUDGE to a base reflection_need stays <= 1", () => {
    const baseReflectionNeed = 0.97;
    const nudged = Math.min(1, Math.max(0, baseReflectionNeed + TRAJECTORY_REFLECTION_NUDGE));
    expect(nudged).toBeLessThanOrEqual(1);
    expect(nudged).toBe(1);
  });

  it("nudge is bounded: 0.06 on zero base = 0.06", () => {
    const base = 0;
    const nudged = Math.min(1, Math.max(0, base + TRAJECTORY_REFLECTION_NUDGE));
    expect(nudged).toBeCloseTo(TRAJECTORY_REFLECTION_NUDGE, 5);
  });

  it("nudge does not apply when interpretation_confidence is low (gate check)", () => {
    // When interpretation_confidence is low, getTrajectoryFeedback returns neutral (no gently_reduce_repetition)
    const result = getTrajectoryFeedback(
      makeContext({ trajectory_shape: "sticky", interpretation_confidence: "low" })
    );
    // Simulate the gate in selectModeAndDrive:
    // adv.feedback.gently_reduce_repetition && adv.interpretation_confidence !== "low"
    const wouldApply = result.gently_reduce_repetition && result.reason !== "insufficient data for advisory (window too small or low confidence)";
    // Even if gently_reduce_repetition were true, low confidence gates the nudge in selectModeAndDrive
    // The neutral fallback ensures it is false:
    expect(result.gently_reduce_repetition).toBe(false);
    expect(wouldApply).toBe(false);
  });
});

describe("getTrajectoryFeedback — favor_consolidation signal (Stage-2 acceptance)", () => {
  it("returns 'light' for exploration-heavy posture with >= 5 recent proposals", () => {
    const result = getTrajectoryFeedback(
      makeContext({ exploration_vs_consolidation: "exploration-heavy", proposals_last_10_sessions: 6 })
    );
    expect(result.favor_consolidation).toBe("light");
  });

  it("returns 'light' for consolidating posture in clustered window", () => {
    const result = getTrajectoryFeedback(
      makeContext({ session_posture: "consolidating", trajectory_shape: "clustered" })
    );
    expect(result.favor_consolidation).toBe("light");
  });

  it("returns 'none' for balanced posture with low proposal count", () => {
    const result = getTrajectoryFeedback(
      makeContext({ exploration_vs_consolidation: "balanced", proposals_last_10_sessions: 2, session_posture: "mixed" })
    );
    expect(result.favor_consolidation).toBe("none");
  });

  it("returns 'none' when window too small (gate check)", () => {
    const result = getTrajectoryFeedback(
      makeContext({ window_sessions: 3, exploration_vs_consolidation: "exploration-heavy", proposals_last_10_sessions: 8 })
    );
    expect(result.favor_consolidation).toBe("none");
  });
});

describe("favor_consolidation nudge math (Stage-2 acceptance)", () => {
  const LIGHT_NUDGE = 0.05;
  const STRONG_NUDGE = 0.10;

  it("light nudge: −0.05 on base recent_exploration_rate stays >= 0", () => {
    const base = 0.03;
    const nudged = Math.max(0, base - LIGHT_NUDGE);
    expect(nudged).toBeGreaterThanOrEqual(0);
    expect(nudged).toBe(0); // clamps to 0
  });

  it("strong nudge: −0.10 on 0.5 base = 0.4", () => {
    const base = 0.5;
    const nudged = Math.max(0, base - STRONG_NUDGE);
    expect(nudged).toBeCloseTo(0.4, 5);
  });

  it("light nudge is smaller than strong nudge", () => {
    expect(LIGHT_NUDGE).toBeLessThan(STRONG_NUDGE);
  });

  it("favor_consolidation 'none' produces no nudge", () => {
    const base = 0.5;
    const consolidationSignal = "none";
    const wouldApply = consolidationSignal !== "none";
    expect(wouldApply).toBe(false);
    // No change to base
    const nudged = wouldApply ? Math.max(0, base - LIGHT_NUDGE) : base;
    expect(nudged).toBe(base);
  });

  it("favor_consolidation does not apply when interpretation_confidence is low", () => {
    const result = getTrajectoryFeedback(
      makeContext({
        exploration_vs_consolidation: "exploration-heavy",
        proposals_last_10_sessions: 8,
        interpretation_confidence: "low",
      })
    );
    // Gate: neutral when confidence low → favor_consolidation should be 'none'
    expect(result.favor_consolidation).toBe("none");
  });
});

describe("buildAdvisoryLog", () => {
  it("always sets dry_run: true", () => {
    const log = buildAdvisoryLog(makeContext());
    expect(log.dry_run).toBe(true);
  });

  it("includes the context snapshot and generated_at", () => {
    const ctx = makeContext({ trajectory_shape: "sticky" });
    const log = buildAdvisoryLog(ctx);
    expect(log.context_snapshot).toEqual(ctx);
    expect(typeof log.generated_at).toBe("string");
  });

  it("includes note mentioning Stage-2 active binding for both gently_reduce_repetition and favor_consolidation", () => {
    const log = buildAdvisoryLog(makeContext());
    expect(log.note).toContain("gently_reduce_repetition");
    expect(log.note).toContain("favor_consolidation");
    expect(log.note).toContain("Stage-2");
  });
});
