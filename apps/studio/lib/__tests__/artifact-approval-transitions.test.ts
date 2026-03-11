import { describe, it, expect } from "vitest";
import { ARTIFACT_APPROVAL_TRANSITIONS, isLegalArtifactApprovalTransition } from "../governance-rules";

describe("artifact approval FSM", () => {
  it("allows first-write from null to any approval action", () => {
    for (const next of Object.values(ARTIFACT_APPROVAL_TRANSITIONS).flat()) {
      expect(isLegalArtifactApprovalTransition(null, next)).toBe(true);
    }
  });

  it("treats same-state transition as idempotent", () => {
    expect(isLegalArtifactApprovalTransition("approved", "approved")).toBe(true);
    expect(isLegalArtifactApprovalTransition("archived", "archived")).toBe(true);
  });

  it("allows forward review flow from pending_review", () => {
    const from = "pending_review";
    const allowed = ARTIFACT_APPROVAL_TRANSITIONS[from]!;
    for (const to of allowed) {
      expect(isLegalArtifactApprovalTransition(from, to)).toBe(true);
    }
  });

  it("blocks reopening rejected and archived via approval API", () => {
    expect(isLegalArtifactApprovalTransition("rejected", "approved")).toBe(false);
    expect(isLegalArtifactApprovalTransition("rejected", "needs_revision")).toBe(false);
    expect(isLegalArtifactApprovalTransition("archived", "approved")).toBe(false);
    expect(isLegalArtifactApprovalTransition("archived", "needs_revision")).toBe(false);
  });

  it("allows approved → approved_for_publication and archival/rejection", () => {
    expect(isLegalArtifactApprovalTransition("approved", "approved_for_publication")).toBe(true);
    expect(isLegalArtifactApprovalTransition("approved", "archived")).toBe(true);
    expect(isLegalArtifactApprovalTransition("approved", "rejected")).toBe(true);
  });

  it("only allows approved_for_publication → archived", () => {
    expect(isLegalArtifactApprovalTransition("approved_for_publication", "archived")).toBe(true);
    expect(isLegalArtifactApprovalTransition("approved_for_publication", "approved")).toBe(false);
  });
});

