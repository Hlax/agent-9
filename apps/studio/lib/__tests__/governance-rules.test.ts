import { describe, it, expect } from "vitest";
import { isLegalProposalStateTransition, getNextLegalProposalActions } from "../governance-rules";

describe("isLegalProposalStateTransition", () => {
  describe("pending_review happy paths", () => {
    it("allows pending_review → needs_revision", () => {
      expect(isLegalProposalStateTransition("pending_review", "needs_revision")).toBe(true);
    });
    it("allows pending_review → approved_for_staging", () => {
      expect(isLegalProposalStateTransition("pending_review", "approved_for_staging")).toBe(true);
    });
    it("allows pending_review → archived", () => {
      expect(isLegalProposalStateTransition("pending_review", "archived")).toBe(true);
    });
    it("allows pending_review → rejected", () => {
      expect(isLegalProposalStateTransition("pending_review", "rejected")).toBe(true);
    });
    it("allows pending_review → ignored", () => {
      expect(isLegalProposalStateTransition("pending_review", "ignored")).toBe(true);
    });
  });

  describe("pending_review illegal jumps", () => {
    it("blocks pending_review → published (skip)", () => {
      expect(isLegalProposalStateTransition("pending_review", "published")).toBe(false);
    });
    it("blocks pending_review → staged (skip)", () => {
      expect(isLegalProposalStateTransition("pending_review", "staged")).toBe(false);
    });
    it("blocks pending_review → approved_for_publication (skip)", () => {
      expect(isLegalProposalStateTransition("pending_review", "approved_for_publication")).toBe(false);
    });
  });

  describe("approved_for_staging happy paths", () => {
    it("allows approved_for_staging → staged", () => {
      expect(isLegalProposalStateTransition("approved_for_staging", "staged")).toBe(true);
    });
    it("allows approved_for_staging → approved_for_publication", () => {
      expect(isLegalProposalStateTransition("approved_for_staging", "approved_for_publication")).toBe(true);
    });
    it("allows approved_for_staging → archived", () => {
      expect(isLegalProposalStateTransition("approved_for_staging", "archived")).toBe(true);
    });
    it("allows approved_for_staging → rejected", () => {
      expect(isLegalProposalStateTransition("approved_for_staging", "rejected")).toBe(true);
    });
  });

  describe("approved_for_staging illegal jumps", () => {
    it("blocks approved_for_staging → published (skip)", () => {
      expect(isLegalProposalStateTransition("approved_for_staging", "published")).toBe(false);
    });
    it("blocks approved_for_staging → pending_review (backward)", () => {
      expect(isLegalProposalStateTransition("approved_for_staging", "pending_review")).toBe(false);
    });
  });

  describe("staged happy paths", () => {
    it("allows staged → approved_for_publication", () => {
      expect(isLegalProposalStateTransition("staged", "approved_for_publication")).toBe(true);
    });
    it("allows staged → archived", () => {
      expect(isLegalProposalStateTransition("staged", "archived")).toBe(true);
    });
    it("allows staged → rejected", () => {
      expect(isLegalProposalStateTransition("staged", "rejected")).toBe(true);
    });
  });

  describe("staged illegal jumps", () => {
    it("blocks staged → published (skip)", () => {
      expect(isLegalProposalStateTransition("staged", "published")).toBe(false);
    });
    it("blocks staged → pending_review (backward)", () => {
      expect(isLegalProposalStateTransition("staged", "pending_review")).toBe(false);
    });
  });

  describe("approved_for_publication happy paths", () => {
    it("allows approved_for_publication → published", () => {
      expect(isLegalProposalStateTransition("approved_for_publication", "published")).toBe(true);
    });
    it("allows approved_for_publication → archived", () => {
      expect(isLegalProposalStateTransition("approved_for_publication", "archived")).toBe(true);
    });
  });

  describe("approved_for_publication illegal jumps", () => {
    it("blocks approved_for_publication → pending_review (backward)", () => {
      expect(isLegalProposalStateTransition("approved_for_publication", "pending_review")).toBe(false);
    });
    it("blocks approved_for_publication → staged (backward)", () => {
      expect(isLegalProposalStateTransition("approved_for_publication", "staged")).toBe(false);
    });
  });

  describe("terminal states are final (no forward transitions)", () => {
    it("blocks published → any", () => {
      expect(isLegalProposalStateTransition("published", "archived")).toBe(false);
      expect(isLegalProposalStateTransition("published", "approved_for_staging")).toBe(false);
    });
    it("blocks archived → any", () => {
      expect(isLegalProposalStateTransition("archived", "pending_review")).toBe(false);
    });
    it("blocks rejected → any", () => {
      expect(isLegalProposalStateTransition("rejected", "pending_review")).toBe(false);
    });
    it("blocks ignored → any", () => {
      expect(isLegalProposalStateTransition("ignored", "pending_review")).toBe(false);
    });
  });

  describe("unknown states", () => {
    it("blocks unknown current state", () => {
      expect(isLegalProposalStateTransition("unknown_state", "approved_for_staging")).toBe(false);
    });
    it("blocks unknown target state from valid current", () => {
      expect(isLegalProposalStateTransition("pending_review", "unknown_state")).toBe(false);
    });
  });
});

describe("getNextLegalProposalActions", () => {
  it("returns next states for pending_review", () => {
    expect(getNextLegalProposalActions("pending_review")).toEqual([
      "needs_revision",
      "approved_for_staging",
      "archived",
      "rejected",
      "ignored",
      "approved",
    ]);
  });
  it("returns next states for approved_for_staging", () => {
    expect(getNextLegalProposalActions("approved_for_staging")).toEqual([
      "staged", "approved_for_publication", "archived", "rejected",
    ]);
  });
  it("returns empty for terminal published", () => {
    expect(getNextLegalProposalActions("published")).toEqual([]);
  });
  it("returns empty for unknown state", () => {
    expect(getNextLegalProposalActions("unknown")).toEqual([]);
  });
});

describe("pending_review_can_transition_to_approved", () => {
  it("includes approved as a legal next state for pending_review", () => {
    const next = getNextLegalProposalActions("pending_review");
    expect(next).toContain("approved");
  });
});
