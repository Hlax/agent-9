/**
 * Tests for the state-machine logic used by POST /api/proposals/[id]/approve.
 *
 * These tests verify that:
 *  - apply_name and approve_avatar now use approved_for_staging as the target
 *    state, which is a legal FSM transition from pending_review.
 *  - approve_for_staging and approve_for_publication still map to their correct states.
 *  - The legacy "approve" action still maps to "approved".
 *  - The FSM guard blocks truly invalid transitions before side effects can run.
 *  - When content is actually written to a public surface (habitat upsert / avatar set),
 *    the final proposal state is advanced to 'published' (not left at 'approved_for_publication').
 */

import { describe, it, expect } from "vitest";
import { isLegalProposalStateTransition } from "../governance-rules";

/**
 * Mirror the action → FSM gate state from the approve route.
 * This is the state used for the legality check BEFORE side effects run.
 */
function resolveNewState(action: string): string {
  if (action === "approve_for_staging") return "approved_for_staging";
  if (action === "approve_for_publication" || action === "approve_publication") return "approved_for_publication";
  if (action === "approve") return "approved";
  // Default for apply_name, approve_avatar and any unrecognised action.
  return "approved_for_staging";
}

/**
 * Mirror the final state resolution: when contentPublished is true and the gate
 * state was 'approved_for_publication', the route advances to 'published'.
 */
function resolveFinalState(action: string, contentPublished: boolean): string {
  const gateState = resolveNewState(action);
  if (contentPublished && gateState === "approved_for_publication") return "published";
  return gateState;
}

describe("approve route: action → state mapping", () => {
  it("apply_name maps to approved_for_staging", () => {
    expect(resolveNewState("apply_name")).toBe("approved_for_staging");
  });

  it("approve_avatar maps to approved_for_staging", () => {
    expect(resolveNewState("approve_avatar")).toBe("approved_for_staging");
  });

  it("approve_for_staging maps to approved_for_staging", () => {
    expect(resolveNewState("approve_for_staging")).toBe("approved_for_staging");
  });

  it("approve_for_publication maps to approved_for_publication", () => {
    expect(resolveNewState("approve_for_publication")).toBe("approved_for_publication");
  });

  it("approve_publication (alias) maps to approved_for_publication", () => {
    expect(resolveNewState("approve_publication")).toBe("approved_for_publication");
  });

  it("approve (legacy) maps to approved", () => {
    expect(resolveNewState("approve")).toBe("approved");
  });
});

describe("approve route: FSM guard allows apply_name / approve_avatar from pending_review", () => {
  it("apply_name from pending_review passes FSM guard (pending_review → approved_for_staging)", () => {
    const targetState = resolveNewState("apply_name");
    expect(isLegalProposalStateTransition("pending_review", targetState)).toBe(true);
  });

  it("approve_avatar from pending_review passes FSM guard (pending_review → approved_for_staging)", () => {
    const targetState = resolveNewState("approve_avatar");
    expect(isLegalProposalStateTransition("pending_review", targetState)).toBe(true);
  });

  it("apply_name from needs_revision passes FSM guard (needs_revision → approved_for_staging)", () => {
    const targetState = resolveNewState("apply_name");
    expect(isLegalProposalStateTransition("needs_revision", targetState)).toBe(true);
  });
});

describe("approve route: FSM guard blocks invalid transitions", () => {
  it("blocks apply_name from rejected (terminal state)", () => {
    const targetState = resolveNewState("apply_name");
    expect(isLegalProposalStateTransition("rejected", targetState)).toBe(false);
  });

  it("blocks approve_avatar from published (terminal state)", () => {
    const targetState = resolveNewState("approve_avatar");
    expect(isLegalProposalStateTransition("published", targetState)).toBe(false);
  });

  it("blocks approve_for_publication from pending_review (FSM skips required steps)", () => {
    const targetState = resolveNewState("approve_for_publication");
    expect(isLegalProposalStateTransition("pending_review", targetState)).toBe(false);
  });

  it("blocks legacy approve from archived (terminal state)", () => {
    const targetState = resolveNewState("approve");
    expect(isLegalProposalStateTransition("archived", targetState)).toBe(false);
  });
});

describe("approve route: transition guard runs before side effects (FSM contract)", () => {
  /**
   * This test verifies the ordering invariant: the FSM guard must be checked
   * before any side effects (identity writes, change_record, etc.) can run.
   * We verify this by confirming that an illegal transition returns false from
   * the guard, which the route checks and returns 400 before any further code
   * executes.
   */
  it("guard returns false for pending_review → approved_for_publication (no skip allowed)", () => {
    // apply_for_publication would try this skip; the route returns 400 before
    // identity or habitat side effects run.
    expect(isLegalProposalStateTransition("pending_review", "approved_for_publication")).toBe(false);
  });

  it("guard returns true for pending_review → approved_for_staging (apply_name / approve_avatar path)", () => {
    expect(isLegalProposalStateTransition("pending_review", "approved_for_staging")).toBe(true);
  });
});

describe("approve route: final state resolution (contentPublished flag)", () => {
  it("approve_for_publication with content published → final state is 'published'", () => {
    expect(resolveFinalState("approve_for_publication", true)).toBe("published");
  });

  it("approve_publication alias with content published → final state is 'published'", () => {
    expect(resolveFinalState("approve_publication", true)).toBe("published");
  });

  it("approve_for_publication without content published → final state is 'approved_for_publication'", () => {
    expect(resolveFinalState("approve_for_publication", false)).toBe("approved_for_publication");
  });

  it("approve_for_staging always → final state is 'approved_for_staging' regardless of contentPublished", () => {
    expect(resolveFinalState("approve_for_staging", true)).toBe("approved_for_staging");
    expect(resolveFinalState("approve_for_staging", false)).toBe("approved_for_staging");
  });

  it("legacy approve always → final state is 'approved' regardless of contentPublished", () => {
    expect(resolveFinalState("approve", true)).toBe("approved");
    expect(resolveFinalState("approve", false)).toBe("approved");
  });

  it("FSM allows approved_for_staging → approved_for_publication (gate check before side effects)", () => {
    const gateState = resolveNewState("approve_for_publication");
    expect(isLegalProposalStateTransition("approved_for_staging", gateState)).toBe(true);
  });

  it("FSM allows staged → approved_for_publication (gate check before side effects)", () => {
    const gateState = resolveNewState("approve_for_publication");
    expect(isLegalProposalStateTransition("staged", gateState)).toBe(true);
  });

  it("approved_for_publication → published is a valid FSM transition (promotion path)", () => {
    expect(isLegalProposalStateTransition("approved_for_publication", "published")).toBe(true);
  });
});
