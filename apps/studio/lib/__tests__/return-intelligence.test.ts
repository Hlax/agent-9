import {
  scoreReturnCandidates,
  buildReturnSelectionDebug,
  type ArchiveCandidateRow,
  type ReturnScoringContext,
} from "../return-intelligence";

const NOW_MS = Date.UTC(2025, 5, 15, 12, 0, 0);

function makeContext(overrides: Partial<ReturnScoringContext> = {}): ReturnScoringContext {
  return {
    tensionKinds: [],
    artifactMediumByArtifactId: {},
    hasCritiqueByArtifactId: new Set(),
    nowMs: NOW_MS,
    explorationNoiseMax: 0, // deterministic for tests
    ...overrides,
  };
}

function makeCandidate(partial: Partial<ArchiveCandidateRow> = {}): ArchiveCandidateRow {
  return {
    project_id: "p1",
    idea_thread_id: "t1",
    idea_id: "i1",
    artifact_id: null,
    recurrence_score: 0.5,
    creative_pull: 0.5,
    created_at: new Date(NOW_MS - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
    ...partial,
  };
}

describe("return-intelligence", () => {
  describe("scoreReturnCandidates", () => {
    it("tension-aligned candidate wins when tension alignment is strongest", () => {
      const identityPressure: ArchiveCandidateRow = makeCandidate({
        artifact_id: "art-avatar",
        recurrence_score: 0.4,
        creative_pull: 0.4,
      });
      const other: ArchiveCandidateRow = makeCandidate({
        artifact_id: "art-other",
        recurrence_score: 0.5,
        creative_pull: 0.5,
      });
      const context = makeContext({
        tensionKinds: ["identity_pressure"],
        artifactMediumByArtifactId: { "art-avatar": "image", "art-other": "writing" },
      });
      const result = scoreReturnCandidates([other, identityPressure], context);
      expect(result.ranked[0]!.breakdown.tension_alignment).toBeGreaterThan(
        result.ranked[1]!.breakdown.tension_alignment
      );
      expect(result.selectedIndex).toBe(1); // identity-aligned candidate at index 1 wins
    });

    it("recurrence alone does not always dominate over tension alignment", () => {
      const highRecurrence: ArchiveCandidateRow = makeCandidate({
        artifact_id: "art-low-tension",
        recurrence_score: 0.7,
        creative_pull: 0.7,
      });
      const tensionAligned: ArchiveCandidateRow = makeCandidate({
        artifact_id: "art-identity",
        recurrence_score: 0.5,
        creative_pull: 0.5,
      });
      const context = makeContext({
        tensionKinds: ["identity_pressure"],
        artifactMediumByArtifactId: { "art-low-tension": "writing", "art-identity": "image" },
      });
      const result = scoreReturnCandidates([highRecurrence, tensionAligned], context);
      const first = result.ranked[0]!;
      expect(first.breakdown.tension_alignment).toBeGreaterThan(0);
      expect(first.candidate.artifact_id).toBe("art-identity");
      expect(result.selectedIndex).toBe(1);
    });

    it("critique boosts selection", () => {
      const withCritique = makeCandidate({ artifact_id: "art-crit", recurrence_score: 0.5, creative_pull: 0.5 });
      const noCritique = makeCandidate({ artifact_id: "art-nocrit", recurrence_score: 0.5, creative_pull: 0.5 });
      const context = makeContext({
        hasCritiqueByArtifactId: new Set(["art-crit"]),
      });
      const result = scoreReturnCandidates([noCritique, withCritique], context);
      expect(result.ranked[0]!.breakdown.critique_weight).toBeGreaterThan(0);
      expect(result.ranked[0]!.candidate.artifact_id).toBe("art-crit");
      expect(result.selectedIndex).toBe(1);
    });

    it("age acts as small tiebreaker", () => {
      const recent = makeCandidate({
        created_at: new Date(NOW_MS - 1 * 24 * 60 * 60 * 1000).toISOString(),
        recurrence_score: 0.5,
        creative_pull: 0.5,
      });
      const older = makeCandidate({
        created_at: new Date(NOW_MS - 400 * 24 * 60 * 60 * 1000).toISOString(),
        recurrence_score: 0.5,
        creative_pull: 0.5,
      });
      const context = makeContext();
      const result = scoreReturnCandidates([recent, older], context);
      expect(result.ranked[0]!.breakdown.age_weight).toBeGreaterThan(result.ranked[1]!.breakdown.age_weight);
      expect(result.ranked[0]!.candidate.created_at).toBe(older.created_at);
    });

    it("exploration noise is bounded when explorationNoiseMax is set", () => {
      const context = makeContext({ explorationNoiseMax: 0.05 });
      const candidates = [makeCandidate()];
      const result = scoreReturnCandidates(candidates, context);
      const noise = result.ranked[0]!.breakdown.exploration_noise;
      expect(noise).toBeGreaterThanOrEqual(0);
      expect(noise).toBeLessThanOrEqual(0.05);
    });

    it("exploration noise is bounded with default context", () => {
      const context = makeContext();
      delete (context as Partial<ReturnScoringContext>).explorationNoiseMax;
      const result = scoreReturnCandidates([makeCandidate()], context);
      const noise = result.ranked[0]!.breakdown.exploration_noise;
      expect(noise).toBeGreaterThanOrEqual(0);
      expect(noise).toBeLessThanOrEqual(0.05);
    });

    it("returns empty ranked and selectedIndex 0 when no candidates", () => {
      const result = scoreReturnCandidates([], makeContext());
      expect(result.ranked).toHaveLength(0);
      expect(result.selectedIndex).toBe(0);
    });

    it("breakdown sums to return_score", () => {
      const result = scoreReturnCandidates([makeCandidate()], makeContext());
      const b = result.ranked[0]!.breakdown;
      const sum =
        b.tension_alignment +
        b.recurrence_weight +
        b.critique_weight +
        b.age_weight +
        b.exploration_noise;
      expect(b.return_score).toBeCloseTo(sum, 10);
    });
  });

  describe("buildReturnSelectionDebug", () => {
    it("returns selected and topCandidates with tensionKinds", () => {
      const candidates = [
        makeCandidate({ artifact_id: "a1" }),
        makeCandidate({ artifact_id: "a2" }),
        makeCandidate({ artifact_id: "a3" }),
      ];
      const result = scoreReturnCandidates(candidates, makeContext());
      const debug = buildReturnSelectionDebug(result, ["identity_pressure"], 2);
      expect(debug.tensionKinds).toEqual(["identity_pressure"]);
      expect(debug.selected).not.toBeNull();
      expect(debug.topCandidates.length).toBeLessThanOrEqual(2);
      expect(debug.selected!.breakdown).toMatchObject({
        tension_alignment: expect.any(Number),
        recurrence_weight: expect.any(Number),
        critique_weight: expect.any(Number),
        age_weight: expect.any(Number),
        exploration_noise: expect.any(Number),
        return_score: expect.any(Number),
      });
    });
  });
});
