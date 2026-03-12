import {
  computeTasteByActionKind,
  getTasteForAction,
  applyTasteBias,
  fillTastePayloadSelected,
  type TrajectoryReviewForTaste,
} from "../trajectory-taste-bias";

function makeRow(partial: Partial<TrajectoryReviewForTaste> = {}): TrajectoryReviewForTaste {
  return {
    action_kind: "continue_thread",
    trajectory_quality: 0.5,
    issues_json: null,
    strengths_json: null,
    ...partial,
  };
}

describe("trajectory-taste-bias", () => {
  describe("computeTasteByActionKind", () => {
    it("returns positive bias for action kinds with strong recent outcomes", () => {
      const rows: TrajectoryReviewForTaste[] = [
        makeRow({ action_kind: "resurface_archive", trajectory_quality: 0.85, strengths_json: { items: ["good_return_timing", "strong_state_alignment"] } }),
        makeRow({ action_kind: "resurface_archive", trajectory_quality: 0.8 }),
        makeRow({ action_kind: "resurface_archive", trajectory_quality: 0.82 }),
      ];
      const taste = computeTasteByActionKind(rows, { minReviewsForTaste: 2 });
      expect(taste["resurface_archive"]).toBeGreaterThan(0);
    });

    it("returns negative bias for action kinds with repeated weak outcomes and issues", () => {
      const rows: TrajectoryReviewForTaste[] = [
        makeRow({ action_kind: "continue_thread", trajectory_quality: 0.2, issues_json: { items: ["repetition_risk", "reflection_without_resolution"] } }),
        makeRow({ action_kind: "continue_thread", trajectory_quality: 0.18, issues_json: { items: ["repetition_risk"] } }),
        makeRow({ action_kind: "continue_thread", trajectory_quality: 0.22, issues_json: { items: ["proposal_churn"] } }),
      ];
      const taste = computeTasteByActionKind(rows, { minReviewsForTaste: 2 });
      expect(taste["continue_thread"]).toBeLessThan(0);
    });

    it("uses sparse-history neutral (0) when too few reviews for action kind", () => {
      const rows: TrajectoryReviewForTaste[] = [
        makeRow({ action_kind: "resurface_archive", trajectory_quality: 0.9 }),
      ];
      const taste = computeTasteByActionKind(rows, { minReviewsForTaste: 3 });
      expect(taste["resurface_archive"]).toBe(0);
    });

    it("bounded effect: taste score does not exceed cap (no runaway dominance)", () => {
      const rows: TrajectoryReviewForTaste[] = Array.from({ length: 10 }, () =>
        makeRow({
          action_kind: "generate_avatar_candidate",
          trajectory_quality: 1,
          strengths_json: { items: ["aligned_avatar_exploration", "strong_state_alignment", "good_return_timing"] },
          issues_json: null,
        })
      );
      const taste = computeTasteByActionKind(rows, { minReviewsForTaste: 2 });
      expect(Math.abs(taste["generate_avatar_candidate"] ?? 0)).toBeLessThanOrEqual(0.5);
    });

    it("strength bonus and issue penalty applied per row", () => {
      const rowsStrong: TrajectoryReviewForTaste[] = [
        makeRow({ action_kind: "a", trajectory_quality: 0.5, strengths_json: { items: ["x", "y"] } }),
        makeRow({ action_kind: "a", trajectory_quality: 0.5 }),
        makeRow({ action_kind: "a", trajectory_quality: 0.5 }),
      ];
      const rowsWeak: TrajectoryReviewForTaste[] = [
        makeRow({ action_kind: "a", trajectory_quality: 0.5, issues_json: { items: ["repetition_risk", "proposal_churn"] } }),
        makeRow({ action_kind: "a", trajectory_quality: 0.5 }),
        makeRow({ action_kind: "a", trajectory_quality: 0.5 }),
      ];
      const tasteStrong = computeTasteByActionKind(rowsStrong, { minReviewsForTaste: 2 });
      const tasteWeak = computeTasteByActionKind(rowsWeak, { minReviewsForTaste: 2 });
      expect(tasteStrong["a"]).toBeGreaterThan(tasteWeak["a"]);
    });
  });

  describe("getTasteForAction", () => {
    it("returns 0 for unknown action kind", () => {
      expect(getTasteForAction({ continue_thread: 0.1 }, "resurface_archive")).toBe(0);
    });
    it("returns value for known action kind", () => {
      expect(getTasteForAction({ resurface_archive: 0.2 }, "resurface_archive")).toBe(0.2);
    });
  });

  describe("applyTasteBias", () => {
    it("adds 0.15 * taste to base score", () => {
      const base = 0.5;
      const tasteMap = { resurface_archive: 0.2 };
      expect(applyTasteBias(base, "resurface_archive", tasteMap)).toBeCloseTo(0.5 + 0.15 * 0.2, 5);
    });
    it("leaves base score when taste is 0 or unknown", () => {
      expect(applyTasteBias(0.6, "unknown_kind", {})).toBe(0.6);
    });
  });

  describe("fillTastePayloadSelected", () => {
    it("sets selected_action_kind and applied_bias_for_selected", () => {
      const payload = {
        recent_window_size: 10,
        taste_by_action_kind: { resurface_archive: 0.2 },
        applied_bias_for_selected: 0,
        selected_action_kind: null as string | null,
        sparse_fallback_used: false,
      };
      const filled = fillTastePayloadSelected(payload, "resurface_archive");
      expect(filled.selected_action_kind).toBe("resurface_archive");
      expect(filled.applied_bias_for_selected).toBeCloseTo(0.15 * 0.2, 5);
    });
  });
});
