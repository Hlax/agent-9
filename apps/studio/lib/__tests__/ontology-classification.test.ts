import {
  classifyNarrativeState,
  classifyConfidenceBand,
  classifyActionKind,
  deriveTensionKinds,
  deriveEvidenceKinds,
  type OntologyState,
} from "../ontology-helpers";

function makeState(partial: Partial<OntologyState>): OntologyState {
  return {
    sessionMode: "explore" as any,
    selectedDrive: null,
    selectionSource: null,
    liveBacklog: 0,
    previousState: {
      reflection_need: 0,
      public_curation_backlog: 0,
      idea_recurrence: 0,
      avatar_alignment: 1,
    },
    repetitionDetected: false,
    archiveCandidateAvailable: false,
    selectedIdeaId: null,
    proposalCreated: false,
    traceProposalType: null,
    ...partial,
  };
}

describe("classifyNarrativeState", () => {
  it("returns 'return' for return mode", () => {
    const state = makeState({ sessionMode: "return" as any });
    expect(classifyNarrativeState(state)).toBe("return");
  });

  it("returns 'return' when selection source is archive", () => {
    const state = makeState({ selectionSource: "archive" });
    expect(classifyNarrativeState(state)).toBe("return");
  });

  it("returns 'stalled' when repetitionDetected is true", () => {
    const state = makeState({ repetitionDetected: true });
    expect(classifyNarrativeState(state)).toBe("stalled");
  });

  it("returns 'reflection' when reflection_need crosses threshold", () => {
    const low = makeState({ previousState: { reflection_need: 0.6, public_curation_backlog: 0, idea_recurrence: 0, avatar_alignment: 1 } });
    const high = makeState({ previousState: { reflection_need: 0.61, public_curation_backlog: 0, idea_recurrence: 0, avatar_alignment: 1 } });
    expect(classifyNarrativeState(low)).not.toBe("reflection");
    expect(classifyNarrativeState(high)).toBe("reflection");
  });

  it("returns 'curation_pressure' when backlog crosses threshold", () => {
    const low = makeState({ liveBacklog: 0.6 });
    const high = makeState({ liveBacklog: 0.61 });
    expect(classifyNarrativeState(low)).not.toBe("curation_pressure");
    expect(classifyNarrativeState(high)).toBe("curation_pressure");
  });

  it("returns 'expansion' by default", () => {
    const state = makeState({});
    expect(classifyNarrativeState(state)).toBe("expansion");
  });
});

describe("classifyConfidenceBand", () => {
  it("returns medium for null/undefined/NaN", () => {
    expect(classifyConfidenceBand(null)).toBe("medium");
    expect(classifyConfidenceBand(undefined)).toBe("medium");
    // eslint-disable-next-line no-restricted-globals
    expect(classifyConfidenceBand(NaN)).toBe("medium");
  });

  it("returns low for < 0.4", () => {
    expect(classifyConfidenceBand(0.0)).toBe("low");
    expect(classifyConfidenceBand(0.39)).toBe("low");
  });

  it("returns medium for 0.4 <= x < 0.7", () => {
    expect(classifyConfidenceBand(0.4)).toBe("medium");
    expect(classifyConfidenceBand(0.69)).toBe("medium");
  });

  it("returns high for >= 0.7", () => {
    expect(classifyConfidenceBand(0.7)).toBe("high");
    expect(classifyConfidenceBand(0.9)).toBe("high");
  });
});

describe("classifyActionKind", () => {
  it("returns resurface_archive when selectionSource is archive", () => {
    const state = makeState({ selectionSource: "archive" });
    expect(classifyActionKind(state)).toBe("resurface_archive");
  });

  it("returns generate_habitat_candidate when proposalCreated and traceProposalType=surface", () => {
    const state = makeState({ proposalCreated: true, traceProposalType: "surface" });
    expect(classifyActionKind(state)).toBe("generate_habitat_candidate");
  });

  it("returns generate_avatar_candidate when proposalCreated and traceProposalType=avatar", () => {
    const state = makeState({ proposalCreated: true, traceProposalType: "avatar" });
    expect(classifyActionKind(state)).toBe("generate_avatar_candidate");
  });

  it("returns continue_thread by default", () => {
    const state = makeState({});
    expect(classifyActionKind(state)).toBe("continue_thread");
  });
});

describe("deriveTensionKinds", () => {
  it("returns stable ordering and only supported labels", () => {
    const state = makeState({
      liveBacklog: 0.7,
      archiveCandidateAvailable: true,
      previousState: {
        reflection_need: 0,
        public_curation_backlog: 0.8,
        idea_recurrence: 0.9,
        avatar_alignment: 0.1,
      },
    });
    const kinds = deriveTensionKinds(state);
    expect(kinds).toEqual([
      "backlog_pressure",
      "surface_pressure",
      "unfinished_pull",
      "recurrence_pull",
      "identity_pressure",
    ]);
  });

  it("does not return duplicates", () => {
    const state = makeState({
      liveBacklog: 0.8,
      archiveCandidateAvailable: true,
      previousState: {
        reflection_need: 0,
        public_curation_backlog: 0.9,
        idea_recurrence: 0.9,
        avatar_alignment: 0.1,
      },
    });
    const kinds = deriveTensionKinds(state);
    const set = new Set(kinds);
    expect(set.size).toBe(kinds.length);
  });
});

describe("deriveEvidenceKinds", () => {
  it("always includes creative_state and project_context", () => {
    const state = makeState({});
    const kinds = deriveEvidenceKinds(state);
    expect(kinds).toContain("creative_state");
    expect(kinds).toContain("project_context");
  });

  it("conditionally adds idea_context, archive, proposal_backlog with stable ordering", () => {
    const state = makeState({
      selectedIdeaId: "idea-1",
      archiveCandidateAvailable: true,
      liveBacklog: 1,
      previousState: {
        reflection_need: 0,
        public_curation_backlog: 0.5,
        idea_recurrence: 0,
        avatar_alignment: 1,
      },
    });
    const kinds = deriveEvidenceKinds(state);
    expect(kinds).toEqual([
      "creative_state",
      "project_context",
      "idea_context",
      "archive",
      "proposal_backlog",
    ]);
  });
});

describe("classifyNarrativeState priority ordering", () => {
  it("return mode takes priority over repetitionDetected (stalled)", () => {
    // If both return mode and repetition are true, return wins
    const state = makeState({ sessionMode: "return" as any, repetitionDetected: true });
    expect(classifyNarrativeState(state)).toBe("return");
  });

  it("archive selectionSource takes priority over reflection_need", () => {
    const state = makeState({
      selectionSource: "archive",
      previousState: { reflection_need: 0.9, public_curation_backlog: 0, idea_recurrence: 0, avatar_alignment: 1 },
    });
    expect(classifyNarrativeState(state)).toBe("return");
  });

  it("stalled takes priority over reflection_need", () => {
    const state = makeState({
      repetitionDetected: true,
      previousState: { reflection_need: 0.9, public_curation_backlog: 0, idea_recurrence: 0, avatar_alignment: 1 },
    });
    expect(classifyNarrativeState(state)).toBe("stalled");
  });

  it("public_curation_backlog alone can trigger curation_pressure", () => {
    const state = makeState({
      liveBacklog: 0,
      previousState: { reflection_need: 0, public_curation_backlog: 0.7, idea_recurrence: 0, avatar_alignment: 1 },
    });
    expect(classifyNarrativeState(state)).toBe("curation_pressure");
  });
});

describe("classifyActionKind edge cases", () => {
  it("does not return generate_habitat_candidate when proposalCreated is false", () => {
    const state = makeState({ proposalCreated: false, traceProposalType: "surface" });
    expect(classifyActionKind(state)).toBe("continue_thread");
  });

  it("does not return generate_avatar_candidate when proposalCreated is false", () => {
    const state = makeState({ proposalCreated: false, traceProposalType: "avatar" });
    expect(classifyActionKind(state)).toBe("continue_thread");
  });

  it("returns continue_thread for proposalCreated with unknown proposal type", () => {
    const state = makeState({ proposalCreated: true, traceProposalType: "unknown_type" });
    expect(classifyActionKind(state)).toBe("continue_thread");
  });
});

describe("deriveTensionKinds edge cases", () => {
  it("returns empty array when all signals are at baseline", () => {
    const state = makeState({
      liveBacklog: 0,
      archiveCandidateAvailable: false,
      previousState: { reflection_need: 0, public_curation_backlog: 0, idea_recurrence: 0, avatar_alignment: 1 },
    });
    expect(deriveTensionKinds(state)).toEqual([]);
  });

  it("avatar_alignment exactly at threshold does not trigger identity_pressure", () => {
    const state = makeState({
      previousState: { reflection_need: 0, public_curation_backlog: 0, idea_recurrence: 0, avatar_alignment: 0.4 },
    });
    expect(deriveTensionKinds(state)).not.toContain("identity_pressure");
  });

  it("avatar_alignment just below threshold triggers identity_pressure", () => {
    const state = makeState({
      previousState: { reflection_need: 0, public_curation_backlog: 0, idea_recurrence: 0, avatar_alignment: 0.39 },
    });
    expect(deriveTensionKinds(state)).toContain("identity_pressure");
  });
});

