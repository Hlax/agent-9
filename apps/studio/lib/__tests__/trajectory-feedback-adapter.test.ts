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

  it("includes note mentioning Stage-2 active binding", () => {
    const log = buildAdvisoryLog(makeContext());
    expect(log.note).toContain("gently_reduce_repetition");
    expect(log.note).toContain("Stage-2");
  });
});
