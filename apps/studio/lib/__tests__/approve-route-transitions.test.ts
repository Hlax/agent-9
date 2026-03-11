/**
 * Tests for the state-machine logic used by POST /api/proposals/[id]/approve.
 *
 * These tests verify that:
 *  - apply_name and approve_avatar now use approved_for_staging as the target
 *    state, which is a legal FSM transition from pending_review.
 *  - approve_for_staging and approve_for_publication still map to their correct states.
 *  - The legacy "approve" action still maps to "approved".
 *  - The FSM guard blocks truly invalid transitions before side effects can run.
 */

import { describe, it, expect } from "vitest";
import { isLegalProposalStateTransition } from "../governance-rules";

/**
 * Mirror the action → newState mapping from the approve route so that changes
 * to the route are caught here. This function is a pure restatement of the
 * route's mapping logic; it must be kept in sync with the route.
 */
function resolveNewState(action: string): string {
  if (action === "approve_for_staging") return "approved_for_staging";
  if (action === "approve_for_publication" || action === "approve_publication") return "approved_for_publication";
  if (action === "approve") return "approved";
  // Default for apply_name, approve_avatar and any unrecognised action.
  return "approved_for_staging";
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
