/**
 * Tests for session-intent: intentKindFromSessionMode (including
 * recommendedNextActionKind feed-forward) and deriveIntentOutcome.
 */

import {
  intentKindFromSessionMode,
  deriveIntentOutcome,
  type IntentUpdateInput,
  type ActiveIntent,
} from "../session-intent";

// ---------------------------------------------------------------------------
// intentKindFromSessionMode — baseline (no recommendation)
// ---------------------------------------------------------------------------

describe("intentKindFromSessionMode — session mode baseline", () => {
  it("reflect → reflect", () => {
    expect(intentKindFromSessionMode("reflect")).toBe("reflect");
  });

  it("return → return", () => {
    expect(intentKindFromSessionMode("return")).toBe("return");
  });

  it("explore → explore", () => {
    expect(intentKindFromSessionMode("explore")).toBe("explore");
  });

  it("continue → refine", () => {
    expect(intentKindFromSessionMode("continue")).toBe("refine");
  });

  it("rest → consolidate", () => {
    expect(intentKindFromSessionMode("rest")).toBe("consolidate");
  });

  it("unknown mode defaults to explore", () => {
    expect(intentKindFromSessionMode("unknown_mode")).toBe("explore");
  });
});

// ---------------------------------------------------------------------------
// intentKindFromSessionMode — recommendedNextActionKind feed-forward (trajectory review)
// ---------------------------------------------------------------------------

describe("intentKindFromSessionMode — recommendedNextActionKind feed-forward", () => {
  it("resurface_archive → return (overrides explore session mode)", () => {
    expect(intentKindFromSessionMode("explore", "resurface_archive")).toBe("return");
  });

  it("resurface_archive → return (overrides reflect session mode)", () => {
    expect(intentKindFromSessionMode("reflect", "resurface_archive")).toBe("return");
  });

  it("generate_habitat_candidate → consolidate (overrides explore session mode)", () => {
    expect(intentKindFromSessionMode("explore", "generate_habitat_candidate")).toBe("consolidate");
  });

  it("generate_habitat_candidate → consolidate (overrides return session mode)", () => {
    expect(intentKindFromSessionMode("return", "generate_habitat_candidate")).toBe("consolidate");
  });

  it("null recommendedNextActionKind falls back to session mode", () => {
    expect(intentKindFromSessionMode("reflect", null)).toBe("reflect");
    expect(intentKindFromSessionMode("explore", null)).toBe("explore");
  });

  it("undefined recommendedNextActionKind falls back to session mode", () => {
    expect(intentKindFromSessionMode("continue", undefined)).toBe("refine");
  });

  it("unknown recommendation falls back to session mode", () => {
    // An unrecognized recommendation string should not override session mode.
    expect(intentKindFromSessionMode("explore", "unknown_future_action")).toBe("explore");
  });
});

// ---------------------------------------------------------------------------
// deriveIntentOutcome
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<IntentUpdateInput> = {}): IntentUpdateInput {
  return {
    sessionId: "s-001",
    sessionMode: "explore",
    selectedProjectId: "proj-1",
    selectedThreadId: "thread-1",
    selectedIdeaId: null,
    confidence: 0.65,
    repetitionDetected: false,
    proposalCreated: false,
    recurrenceUpdated: false,
    ...overrides,
  };
}

function makeIntent(overrides: Partial<ActiveIntent> = {}): ActiveIntent {
  return {
    intent_id: "intent-001",
    intent_kind: "explore",
    target_project_id: "proj-1",
    target_thread_id: "thread-1",
    target_artifact_family: null,
    reason_summary: null,
    confidence: 0.65,
    source_session_id: "s-000",
    last_reinforced_session_id: "s-000",
    ...overrides,
  };
}

describe("deriveIntentOutcome", () => {
  it("returns 'create' when no current intent", () => {
    expect(deriveIntentOutcome(null, makeInput())).toBe("create");
  });

  it("returns 'abandon' when confidence is low", () => {
    expect(deriveIntentOutcome(makeIntent(), makeInput({ confidence: 0.3 }))).toBe("abandon");
  });

  it("returns 'abandon' when repetition detected with high penalty", () => {
    expect(
      deriveIntentOutcome(
        makeIntent(),
        makeInput({ repetitionDetected: true, repetitionPenalty: 0.6 })
      )
    ).toBe("abandon");
  });

  it("returns 'continue' when same thread and good confidence", () => {
    const intent = makeIntent({ target_thread_id: "thread-1" });
    const input = makeInput({ selectedThreadId: "thread-1", confidence: 0.7 });
    expect(deriveIntentOutcome(intent, input)).toBe("continue");
  });

  it("returns 'fulfill' when proposal created with good confidence and trend", () => {
    const input = makeInput({
      proposalCreated: true,
      confidence: 0.75,
      returnSuccessTrend: 0.6,
      selectedProjectId: "proj-other", // different thread so no 'continue'
      selectedThreadId: "thread-other",
    });
    expect(deriveIntentOutcome(makeIntent(), input)).toBe("fulfill");
  });

  it("returns 'supersede' when session moved to different thread with good confidence", () => {
    const intent = makeIntent({ target_project_id: "proj-1", target_thread_id: "thread-1" });
    const input = makeInput({ selectedProjectId: "proj-2", selectedThreadId: "thread-2", confidence: 0.6 });
    expect(deriveIntentOutcome(intent, input)).toBe("supersede");
  });
});
