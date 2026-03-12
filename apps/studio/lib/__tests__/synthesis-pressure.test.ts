import {
  computeSynthesisPressure,
  getSynthesisPressure,
  deriveRecurrencePullSignal,
  deriveUnfinishedPullSignal,
  deriveArchiveCandidatePressure,
  deriveReturnSuccessTrend,
  deriveRepetitionPenalty,
  deriveMomentum,
  type SynthesisPressureInput,
  type TrajectoryReviewRow,
} from "../synthesis-pressure";

function makeInput(partial: Partial<SynthesisPressureInput> = {}): SynthesisPressureInput {
  return {
    recurrence_pull_signal: 0.5,
    unfinished_pull_signal: 0.5,
    archive_candidate_pressure: 0.5,
    return_success_trend: 0.5,
    repetition_without_movement_penalty: 0,
    momentum: 0.6,
    ...partial,
  };
}

describe("synthesis-pressure", () => {
  describe("computeSynthesisPressure", () => {
    it("returns band low when score < 0.30", () => {
      const input = makeInput({
        recurrence_pull_signal: 0.1,
        unfinished_pull_signal: 0.1,
        archive_candidate_pressure: 0.1,
        return_success_trend: 0.1,
        repetition_without_movement_penalty: 0.5,
        momentum: 0.8,
      });
      const result = computeSynthesisPressure(input);
      expect(result.band).toBe("low");
      expect(result.synthesis_pressure).toBeLessThan(0.3);
    });

    it("returns band rising when score in [0.30, 0.54]", () => {
      const input = makeInput({
        recurrence_pull_signal: 0.5,
        unfinished_pull_signal: 0.5,
        archive_candidate_pressure: 0.4,
        return_success_trend: 0.4,
        repetition_without_movement_penalty: 0,
        momentum: 0.8,
      });
      const result = computeSynthesisPressure(input);
      expect(result.band).toBe("rising");
      expect(result.synthesis_pressure).toBeGreaterThanOrEqual(0.3);
      expect(result.synthesis_pressure).toBeLessThanOrEqual(0.54);
    });

    it("returns band high when score in [0.55, 0.74]", () => {
      const input = makeInput({
        recurrence_pull_signal: 0.7,
        unfinished_pull_signal: 0.7,
        archive_candidate_pressure: 0.6,
        return_success_trend: 0.6,
        repetition_without_movement_penalty: 0,
        momentum: 0.8,
      });
      const result = computeSynthesisPressure(input);
      expect(result.band).toBe("high");
      expect(result.synthesis_pressure).toBeGreaterThanOrEqual(0.55);
      expect(result.synthesis_pressure).toBeLessThanOrEqual(0.74);
    });

    it("returns band convert_now when score >= 0.75", () => {
      const input = makeInput({
        recurrence_pull_signal: 1,
        unfinished_pull_signal: 1,
        archive_candidate_pressure: 1,
        return_success_trend: 1,
        repetition_without_movement_penalty: 0,
        momentum: 0.8,
      });
      const result = computeSynthesisPressure(input);
      expect(result.band).toBe("convert_now");
      expect(result.synthesis_pressure).toBeGreaterThanOrEqual(0.75);
    });

    it("momentum gate reduces an otherwise-high score when momentum < 0.35", () => {
      const inputHighMomentum = makeInput({
        recurrence_pull_signal: 0.9,
        unfinished_pull_signal: 0.9,
        archive_candidate_pressure: 0.9,
        return_success_trend: 0.9,
        repetition_without_movement_penalty: 0,
        momentum: 0.6,
      });
      const inputLowMomentum = makeInput({
        recurrence_pull_signal: 0.9,
        unfinished_pull_signal: 0.9,
        archive_candidate_pressure: 0.9,
        return_success_trend: 0.9,
        repetition_without_movement_penalty: 0,
        momentum: 0.3,
      });
      const resultHigh = computeSynthesisPressure(inputHighMomentum);
      const resultLow = computeSynthesisPressure(inputLowMomentum);
      expect(resultLow.momentum_gate_applied).toBe(true);
      expect(resultHigh.momentum_gate_applied).toBe(false);
      expect(resultLow.synthesis_pressure).toBeLessThan(resultHigh.synthesis_pressure);
      expect(resultLow.raw_score).toBeCloseTo(resultHigh.raw_score, 5);
      expect(resultLow.synthesis_pressure).toBeCloseTo(resultLow.raw_score * 0.6, 5);
    });

    it("exposes debug-friendly payload with components, gate, score, band", () => {
      const result = computeSynthesisPressure(makeInput());
      expect(result).toMatchObject({
        raw_score: expect.any(Number),
        synthesis_pressure: expect.any(Number),
        band: expect.stringMatching(/^(low|rising|high|convert_now)$/),
        momentum_gate_applied: expect.any(Boolean),
        momentum: expect.any(Number),
      });
      expect(result.components).toMatchObject({
        recurrence_pull_signal: expect.any(Number),
        unfinished_pull_signal: expect.any(Number),
        archive_candidate_pressure: expect.any(Number),
        return_success_trend: expect.any(Number),
        repetition_without_movement_penalty: expect.any(Number),
      });
    });
  });

  describe("deriveRecurrencePullSignal", () => {
    it("uses idea_recurrence and clamps to 0-1", () => {
      expect(deriveRecurrencePullSignal(0.8)).toBe(0.8);
      expect(deriveRecurrencePullSignal(null)).toBe(0.5);
      expect(deriveRecurrencePullSignal(1.5)).toBe(1);
    });
  });

  describe("deriveUnfinishedPullSignal", () => {
    it("combines archive count and unfinished_projects", () => {
      expect(deriveUnfinishedPullSignal(0, 0)).toBe(0);
      expect(deriveUnfinishedPullSignal(25, 1)).toBeGreaterThan(0.5);
    });
  });

  describe("deriveArchiveCandidatePressure", () => {
    it("0 when no archive, 1 when >= 25", () => {
      expect(deriveArchiveCandidatePressure(0)).toBe(0);
      expect(deriveArchiveCandidatePressure(25)).toBe(1);
      expect(deriveArchiveCandidatePressure(10)).toBeLessThan(1);
    });
  });

  describe("deriveReturnSuccessTrend", () => {
    it("returns 0.5 when no return sessions", () => {
      expect(deriveReturnSuccessTrend([])).toBe(0.5);
    });
    it("averages movement_score and trajectory_quality for return rows", () => {
      const rows: TrajectoryReviewRow[] = [
        {
          narrative_state: "return",
          action_kind: "resurface_archive",
          outcome_kind: null,
          movement_score: 0.8,
          trajectory_quality: 0.8,
          issues_json: null,
        },
      ];
      expect(deriveReturnSuccessTrend(rows)).toBe(0.8);
    });
  });

  describe("deriveRepetitionPenalty", () => {
    it("returns 0 when no rows", () => {
      expect(deriveRepetitionPenalty([])).toBe(0);
    });
    it("counts repetition_without_movement and repetition_risk in issues", () => {
      const rows: TrajectoryReviewRow[] = [
        { narrative_state: null, action_kind: null, outcome_kind: "repetition_without_movement", movement_score: 0, trajectory_quality: 0, issues_json: null },
        { narrative_state: null, action_kind: null, outcome_kind: null, movement_score: 0, trajectory_quality: 0, issues_json: { items: ["repetition_risk"] } },
      ];
      expect(deriveRepetitionPenalty(rows)).toBe(1);
    });
  });

  describe("deriveMomentum", () => {
    it("uses recent_exploration_rate and clamps", () => {
      expect(deriveMomentum(0.4)).toBe(0.4);
      expect(deriveMomentum(null)).toBe(0.5);
    });
  });
});

describe("getSynthesisPressure", () => {
  it("returns safe-default payload without throwing when Supabase is unavailable", async () => {
    // Simulate a Supabase client whose queries throw (e.g. network outage).
    const failingSupabase = {
      from: () => {
        throw new Error("DB unavailable");
      },
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    const result = await getSynthesisPressure(failingSupabase);

    expect(result).toMatchObject({
      raw_score: expect.any(Number),
      synthesis_pressure: expect.any(Number),
      band: expect.stringMatching(/^(low|rising|high|convert_now)$/),
      momentum_gate_applied: expect.any(Boolean),
      momentum: expect.any(Number),
    });
    expect(result.components).toMatchObject({
      recurrence_pull_signal: expect.any(Number),
      unfinished_pull_signal: expect.any(Number),
      archive_candidate_pressure: expect.any(Number),
      return_success_trend: expect.any(Number),
      repetition_without_movement_penalty: expect.any(Number),
    });
    // Safe defaults: archive pressure should be 0, not inflated.
    expect(result.components.archive_candidate_pressure).toBe(0);
  });
});
