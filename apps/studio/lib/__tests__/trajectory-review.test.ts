import {
  deriveTrajectoryReview,
  OUTCOME_KINDS,
  ISSUE_KINDS,
  STRENGTH_KINDS,
  type TrajectoryReviewInput,
  type TrajectoryReviewRow,
} from "../trajectory-review";

const SESSION_ID = "00000000-0000-0000-0000-000000000001";

function makeInput(partial: Partial<TrajectoryReviewInput>): TrajectoryReviewInput {
  return {
    narrative_state: "expansion",
    action_kind: "continue_thread",
    confidence: 0.6,
    proposal_created: false,
    repetition_detected: false,
    has_artifact: true,
    has_critique: true,
    has_evaluation: true,
    memory_record_created: false,
    archive_entry_created: false,
    live_backlog: 0,
    selection_source: null,
    execution_mode: "auto",
    ...partial,
  };
}

describe("trajectory-review", () => {
  describe("deriveTrajectoryReview", () => {
    it("returns row with session_id and review_version", () => {
      const row = deriveTrajectoryReview(SESSION_ID, null, makeInput({}));
      expect(row.session_id).toBe(SESSION_ID);
      expect(row.review_version).toBe("v1");
    });

    it("trajectory_quality = 0.30*alignment + 0.30*movement + 0.20*novelty + 0.10*governance + 0.10*confidence_calibration", () => {
      const row = deriveTrajectoryReview(SESSION_ID, null, makeInput({}));
      const expected =
        0.3 * row.alignment_score +
        0.3 * row.movement_score +
        0.2 * row.novelty_score +
        0.1 * row.governance_score +
        0.1 * row.confidence_calibration_score;
      expect(row.trajectory_quality).toBeCloseTo(expected, 5);
    });

    it("outcome_kind is one of allowed canon values", () => {
      const inputs: TrajectoryReviewInput[] = [
        makeInput({ proposal_created: true }),
        makeInput({ repetition_detected: true, has_artifact: true, has_critique: false, has_evaluation: false }),
        makeInput({ narrative_state: "return", selection_source: "archive", archive_entry_created: true }),
        makeInput({ narrative_state: "curation_pressure", action_kind: "continue_thread" }),
        makeInput({ execution_mode: "human_required", confidence: 0.3 }),
      ];
      for (const input of inputs) {
        const row = deriveTrajectoryReview(SESSION_ID, null, input);
        expect(OUTCOME_KINDS).toContain(row.outcome_kind);
      }
    });

    it("issues_json items use only allowed issue kinds", () => {
      const row = deriveTrajectoryReview(
        SESSION_ID,
        null,
        makeInput({ confidence: 0.85, has_artifact: true, has_critique: false, has_evaluation: false, proposal_created: false })
      );
      if (row.issues_json?.items?.length) {
        for (const k of row.issues_json.items) {
          expect(ISSUE_KINDS).toContain(k);
        }
      }
    });

    it("strengths_json items use only allowed strength kinds", () => {
      const row = deriveTrajectoryReview(
        SESSION_ID,
        null,
        makeInput({ narrative_state: "return", selection_source: "archive" })
      );
      if (row.strengths_json?.items?.length) {
        for (const k of row.strengths_json.items) {
          expect(STRENGTH_KINDS).toContain(k);
        }
      }
    });

    it("proposal_created yields outcome_kind proposal_generated", () => {
      const row = deriveTrajectoryReview(
        SESSION_ID,
        null,
        makeInput({ proposal_created: true, action_kind: "generate_habitat_candidate" })
      );
      expect(row.outcome_kind).toBe("proposal_generated");
    });

    it("governance_score is 1.0 (no direct mutation)", () => {
      const row = deriveTrajectoryReview(SESSION_ID, null, makeInput({}));
      expect(row.governance_score).toBe(1);
    });

    it("is pure: same input yields same output", () => {
      const input = makeInput({ narrative_state: "return", selection_source: "archive" });
      const a = deriveTrajectoryReview(SESSION_ID, null, input);
      const b = deriveTrajectoryReview(SESSION_ID, null, input);
      expect(a.trajectory_quality).toBe(b.trajectory_quality);
      expect(a.outcome_kind).toBe(b.outcome_kind);
      expect(JSON.stringify(a.issues_json)).toBe(JSON.stringify(b.issues_json));
      expect(JSON.stringify(a.strengths_json)).toBe(JSON.stringify(b.strengths_json));
    });

    it("returns TrajectoryReviewRow shape for insert", () => {
      const row = deriveTrajectoryReview(SESSION_ID, "trace-uuid", makeInput({})) as TrajectoryReviewRow;
      expect(row).toMatchObject({
        session_id: SESSION_ID,
        deliberation_trace_id: "trace-uuid",
        review_version: "v1",
        narrative_state: expect.any(String),
        action_kind: expect.any(String),
        outcome_kind: expect.any(String),
        trajectory_quality: expect.any(Number),
        alignment_score: expect.any(Number),
        movement_score: expect.any(Number),
        novelty_score: expect.any(Number),
        governance_score: expect.any(Number),
        confidence_calibration_score: expect.any(Number),
      });
      expect(row.issues_json === null || (typeof row.issues_json === "object" && Array.isArray((row.issues_json as { items: string[] }).items))).toBe(true);
      expect(row.strengths_json === null || (typeof row.strengths_json === "object" && Array.isArray((row.strengths_json as { items: string[] }).items))).toBe(true);
      expect(row.learning_signal === null || typeof row.learning_signal === "string").toBe(true);
    });
  });
});
