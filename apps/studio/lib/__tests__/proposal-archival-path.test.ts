/**
 * Tests for the system-initiated proposal archival path in manageProposals.
 *
 * When the session runner refreshes the newest active habitat_layout proposal
 * it archives older superseded ones. This test verifies that:
 *  - All states that the runner queries (pending_review, approved_for_staging, staged)
 *    allow a legal FSM transition to "archived".
 *  - Terminal states cannot be archived via the same path (defensive guard).
 *  - The archival path only fires for proposals satisfying the FSM guard.
 */

import { describe, it, expect } from "vitest";
import { isLegalProposalStateTransition } from "../governance-rules";

/** States that the runner's habitat_layout backlog query returns. */
const RUNNER_QUERY_STATES = ["pending_review", "approved_for_staging", "staged"] as const;

describe("manageProposals: system-initiated archival uses legal FSM transitions", () => {
  it.each(RUNNER_QUERY_STATES)(
    "state '%s' → archived is a legal FSM transition",
    (fromState) => {
      expect(isLegalProposalStateTransition(fromState, "archived")).toBe(true);
    }
  );

  it("all queried states allow → archived so FSM filter never drops any", () => {
    const legalCount = RUNNER_QUERY_STATES.filter((s) =>
      isLegalProposalStateTransition(s, "archived")
    ).length;
    expect(legalCount).toBe(RUNNER_QUERY_STATES.length);
  });
});

describe("manageProposals: terminal states are correctly blocked from archival", () => {
  const TERMINAL_STATES = ["published", "archived", "rejected", "ignored"] as const;

  it.each(TERMINAL_STATES)(
    "terminal state '%s' → archived is NOT a legal FSM transition",
    (terminalState) => {
      expect(isLegalProposalStateTransition(terminalState, "archived")).toBe(false);
    }
  );
});

describe("manageProposals: FSM filter logic", () => {
  it("filters only proposals whose current state allows → archived transition", () => {
    // Simulate a mixed set of proposals (the filter in the runner)
    const mockOlderProposals = [
      { proposal_record_id: "a", proposal_state: "pending_review" },
      { proposal_record_id: "b", proposal_state: "approved_for_staging" },
      { proposal_record_id: "c", proposal_state: "staged" },
      // Edge case: a proposal somehow in a terminal state would be skipped
      { proposal_record_id: "d", proposal_state: "published" },
    ];

    const legalToArchive = mockOlderProposals.filter((o) =>
      isLegalProposalStateTransition(o.proposal_state, "archived")
    );

    // All three non-terminal proposals pass; the published one is skipped
    expect(legalToArchive.map((o) => o.proposal_record_id)).toEqual(["a", "b", "c"]);
  });
});
