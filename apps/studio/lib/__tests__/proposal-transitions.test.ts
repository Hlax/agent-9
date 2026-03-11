import { describe, it, expect } from "vitest";
import { isValidProposalTransition } from "../proposal-transitions";

describe("isValidProposalTransition", () => {
  describe("pending_review forward transitions", () => {
    it("allows pending_review → needs_revision", () => {
      expect(isValidProposalTransition("pending_review", "needs_revision")).toBe(true);
    });
    it("allows pending_review → approved_for_staging", () => {
      expect(isValidProposalTransition("pending_review", "approved_for_staging")).toBe(true);
    });
    it("allows pending_review → archived", () => {
      expect(isValidProposalTransition("pending_review", "archived")).toBe(true);
    });
    it("allows pending_review → rejected", () => {
      expect(isValidProposalTransition("pending_review", "rejected")).toBe(true);
    });
    it("allows pending_review → ignored", () => {
      expect(isValidProposalTransition("pending_review", "ignored")).toBe(true);
    });
    it("blocks pending_review → published (skip)", () => {
      expect(isValidProposalTransition("pending_review", "published")).toBe(false);
    });
    it("blocks pending_review → staged (skip)", () => {
      expect(isValidProposalTransition("pending_review", "staged")).toBe(false);
    });
    it("blocks pending_review → approved_for_publication (skip)", () => {
      expect(isValidProposalTransition("pending_review", "approved_for_publication")).toBe(false);
    });
  });

  describe("needs_revision forward transitions", () => {
    it("allows needs_revision → approved_for_staging", () => {
      expect(isValidProposalTransition("needs_revision", "approved_for_staging")).toBe(true);
    });
    it("allows needs_revision → archived", () => {
      expect(isValidProposalTransition("needs_revision", "archived")).toBe(true);
    });
    it("allows needs_revision → rejected", () => {
      expect(isValidProposalTransition("needs_revision", "rejected")).toBe(true);
    });
    it("blocks needs_revision → published (skip)", () => {
      expect(isValidProposalTransition("needs_revision", "published")).toBe(false);
    });
  });

  describe("approved_for_staging forward transitions", () => {
    it("allows approved_for_staging → staged", () => {
      expect(isValidProposalTransition("approved_for_staging", "staged")).toBe(true);
    });
    it("allows approved_for_staging → approved_for_publication", () => {
      expect(isValidProposalTransition("approved_for_staging", "approved_for_publication")).toBe(true);
    });
    it("allows approved_for_staging → archived", () => {
      expect(isValidProposalTransition("approved_for_staging", "archived")).toBe(true);
    });
    it("allows approved_for_staging → rejected", () => {
      expect(isValidProposalTransition("approved_for_staging", "rejected")).toBe(true);
    });
    it("blocks approved_for_staging → published (skip)", () => {
      expect(isValidProposalTransition("approved_for_staging", "published")).toBe(false);
    });
    it("blocks approved_for_staging → pending_review (backward)", () => {
      expect(isValidProposalTransition("approved_for_staging", "pending_review")).toBe(false);
    });
  });

  describe("staged forward transitions", () => {
    it("allows staged → approved_for_publication", () => {
      expect(isValidProposalTransition("staged", "approved_for_publication")).toBe(true);
    });
    it("allows staged → archived", () => {
      expect(isValidProposalTransition("staged", "archived")).toBe(true);
    });
    it("allows staged → rejected", () => {
      expect(isValidProposalTransition("staged", "rejected")).toBe(true);
    });
    it("blocks staged → published (skip)", () => {
      expect(isValidProposalTransition("staged", "published")).toBe(false);
    });
    it("blocks staged → pending_review (backward)", () => {
      expect(isValidProposalTransition("staged", "pending_review")).toBe(false);
    });
  });

  describe("approved_for_publication forward transitions", () => {
    it("allows approved_for_publication → published", () => {
      expect(isValidProposalTransition("approved_for_publication", "published")).toBe(true);
    });
    it("allows approved_for_publication → archived", () => {
      expect(isValidProposalTransition("approved_for_publication", "archived")).toBe(true);
    });
    it("blocks approved_for_publication → pending_review (backward)", () => {
      expect(isValidProposalTransition("approved_for_publication", "pending_review")).toBe(false);
    });
    it("blocks approved_for_publication → staged (backward)", () => {
      expect(isValidProposalTransition("approved_for_publication", "staged")).toBe(false);
    });
  });

  describe("terminal states block all PATCH transitions", () => {
    it("blocks published → any (use /unpublish route for rollback)", () => {
      expect(isValidProposalTransition("published", "archived")).toBe(false);
      expect(isValidProposalTransition("published", "approved_for_staging")).toBe(false);
    });
    it("blocks archived → any", () => {
      expect(isValidProposalTransition("archived", "pending_review")).toBe(false);
      expect(isValidProposalTransition("archived", "approved_for_staging")).toBe(false);
    });
    it("blocks rejected → any", () => {
      expect(isValidProposalTransition("rejected", "pending_review")).toBe(false);
    });
    it("blocks ignored → any", () => {
      expect(isValidProposalTransition("ignored", "pending_review")).toBe(false);
    });
  });

  describe("legacy approved state", () => {
    it("allows approved → approved_for_staging", () => {
      expect(isValidProposalTransition("approved", "approved_for_staging")).toBe(true);
    });
    it("allows approved → approved_for_publication", () => {
      expect(isValidProposalTransition("approved", "approved_for_publication")).toBe(true);
    });
    it("allows approved → archived", () => {
      expect(isValidProposalTransition("approved", "archived")).toBe(true);
    });
    it("allows approved → rejected", () => {
      expect(isValidProposalTransition("approved", "rejected")).toBe(true);
    });
    it("blocks approved → published (skip)", () => {
      expect(isValidProposalTransition("approved", "published")).toBe(false);
    });
  });

  describe("unknown states", () => {
    it("blocks unknown current state", () => {
      expect(isValidProposalTransition("unknown_state", "approved_for_staging")).toBe(false);
    });
    it("blocks unknown target state from valid current", () => {
      expect(isValidProposalTransition("pending_review", "unknown_state")).toBe(false);
    });
  });
});
