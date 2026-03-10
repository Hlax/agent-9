import { describe, it, expect } from "vitest";
import { passesStagingGate, isProposalIntent } from "../publish-gate";

describe("isProposalIntent", () => {
  it("returns false when no proposals and no artifact signals", () => {
    expect(isProposalIntent([], {})).toBe(false);
    expect(isProposalIntent([], { target_surface: null, artifact_role: null })).toBe(false);
  });

  it("returns true when proposals exist", () => {
    expect(isProposalIntent([{ proposal_state: "pending_review" }], {})).toBe(true);
  });

  it("returns true when artifact has a target_surface set", () => {
    expect(isProposalIntent([], { target_surface: "staging_habitat" })).toBe(true);
    expect(isProposalIntent([], { target_surface: "public_habitat" })).toBe(true);
  });

  it("returns true when artifact_role indicates deployment intent", () => {
    expect(isProposalIntent([], { artifact_role: "habitat_layout" })).toBe(true);
    expect(isProposalIntent([], { artifact_role: "layout_concept" })).toBe(true);
    expect(isProposalIntent([], { artifact_role: "surface_proposal" })).toBe(true);
  });

  it("returns true when a proposal has a deployment-intent proposal_role", () => {
    expect(isProposalIntent([{ proposal_state: "pending_review", proposal_role: "habitat_layout" }], {})).toBe(true);
  });

  it("returns true when a proposal has a target_surface set", () => {
    expect(isProposalIntent([{ proposal_state: "pending_review", target_surface: "staging_habitat" }], {})).toBe(true);
  });

  it("returns false for expressive writing with no proposal signals", () => {
    expect(isProposalIntent([], { artifact_role: "freeform_writing" })).toBe(false);
    expect(isProposalIntent([], { artifact_role: "image_concept" })).toBe(false);
  });
});

describe("passesStagingGate", () => {
  it("returns true when no proposals and artifact is not proposal-intent", () => {
    expect(passesStagingGate([])).toBe(true);
    expect(passesStagingGate([], {})).toBe(true);
    expect(passesStagingGate([], { target_surface: null, artifact_role: null })).toBe(true);
  });

  it("returns false when proposals exist but none passed staging (proposal-intent via proposals)", () => {
    expect(passesStagingGate([{ proposal_state: "pending_review" }])).toBe(false);
    expect(passesStagingGate([{ proposal_state: "rejected" }, { proposal_state: "pending_review" }])).toBe(false);
  });

  it("returns true when at least one proposal passed staging", () => {
    expect(passesStagingGate([{ proposal_state: "approved_for_staging" }])).toBe(true);
    expect(passesStagingGate([{ proposal_state: "pending_review" }, { proposal_state: "staged" }])).toBe(true);
    expect(passesStagingGate([{ proposal_state: "approved_for_publication" }])).toBe(true);
    expect(passesStagingGate([{ proposal_state: "published" }])).toBe(true);
  });

  it("returns false when artifact has target_surface but no staged proposals", () => {
    expect(passesStagingGate([], { target_surface: "staging_habitat" })).toBe(false);
  });

  it("returns false when artifact_role is deployment-intent but no staged proposals", () => {
    expect(passesStagingGate([], { artifact_role: "habitat_layout" })).toBe(false);
  });

  it("returns true for expressive artifacts without proposal signals", () => {
    expect(passesStagingGate([], { artifact_role: "freeform_writing" })).toBe(true);
    expect(passesStagingGate([], { artifact_role: null })).toBe(true);
    expect(passesStagingGate([], { target_surface: null })).toBe(true);
  });
});
