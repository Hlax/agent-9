/**
 * Phase 3 extension proposal tests.
 * Eligibility gating (isExtensionProposalEligible) and contract sanity.
 * Plan: medium_plugin_refactor_plan.md §Phase 3, Phase 3 accepted contract.
 *
 * Integration scope (not covered here): cap reached → no create, duplicate (artifact_id + role) → no create,
 * eligible state creates exactly one extension proposal, concept/image proposal behavior unchanged,
 * extension creation sets traceProposalId / traceProposalType / proposalCreated. Consider full session
 * or manageProposals-with-mock-supabase tests in a follow-up. Phase 1 full session trace test
 * (requested_medium, executed_medium, fallback_reason, resolution_source persisted) remains queued.
 */

import type { Artifact, CritiqueRecord, EvaluationSignal } from "@twin/core";
import { isExtensionProposalEligible } from "../session-runner";

type ExtensionEligibilityState = Parameters<typeof isExtensionProposalEligible>[0];

function minimalArtifact(overrides?: Partial<Artifact>): Artifact {
  return {
    artifact_id: "a1",
    project_id: "p1",
    session_id: "s1",
    primary_idea_id: null,
    primary_thread_id: null,
    title: "Test",
    summary: "Summary",
    medium: "writing",
    lifecycle_status: "draft",
    current_approval_state: "pending_review",
    current_publication_state: "private",
    content_text: "",
    content_uri: null,
    preview_uri: null,
    notes: null,
    alignment_score: null,
    emergence_score: null,
    fertility_score: null,
    pull_score: null,
    recurrence_score: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function minimalCritique(overrides?: Partial<CritiqueRecord>): CritiqueRecord {
  return {
    critique_record_id: "c1",
    artifact_id: "a1",
    session_id: "s1",
    intent_note: null,
    strength_note: null,
    originality_note: null,
    energy_note: null,
    potential_note: null,
    medium_fit_note: "Would work better as interactive.",
    coherence_note: null,
    fertility_note: null,
    overall_summary: null,
    critique_outcome: "continue",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function eligibleState(overrides?: Partial<ExtensionEligibilityState>): ExtensionEligibilityState {
  return {
    primaryArtifact: minimalArtifact(),
    critique: minimalCritique(),
    medium_fit: "partial",
    extension_classification: "surface_environment_extension",
    missing_capability: "interactive_ui",
    ...overrides,
  } as ExtensionEligibilityState;
}

describe("Phase 3: extension proposal eligibility (isExtensionProposalEligible)", () => {
  it("eligible state returns true when all gating conditions are met", () => {
    const state = eligibleState();
    expect(isExtensionProposalEligible(state)).toBe(true);
  });

  it("missing primary artifact → no create", () => {
    expect(isExtensionProposalEligible(eligibleState({ primaryArtifact: null }))).toBe(false);
    expect(isExtensionProposalEligible(eligibleState({ primaryArtifact: undefined }))).toBe(false);
  });

  it("missing critique → no create", () => {
    expect(isExtensionProposalEligible(eligibleState({ critique: null }))).toBe(false);
    expect(isExtensionProposalEligible(eligibleState({ critique: undefined }))).toBe(false);
  });

  it("medium_fit = supported → no create", () => {
    expect(isExtensionProposalEligible(eligibleState({ medium_fit: "supported" }))).toBe(false);
  });

  it("medium_fit = null → no create", () => {
    expect(isExtensionProposalEligible(eligibleState({ medium_fit: null }))).toBe(false);
  });

  it("extension_classification = null → no create", () => {
    expect(
      isExtensionProposalEligible(eligibleState({ extension_classification: null }))
    ).toBe(false);
  });

  it("no rationale and no missing_capability → no create", () => {
    const state = eligibleState({
      missing_capability: null,
      critique: minimalCritique({ medium_fit_note: null, overall_summary: null }),
    });
    expect(isExtensionProposalEligible(state)).toBe(false);
  });

  it("rationale from medium_fit_note only (no missing_capability) → eligible", () => {
    const state = eligibleState({
      missing_capability: null,
      critique: minimalCritique({ medium_fit_note: "Needs interactive UI.", overall_summary: null }),
    });
    expect(isExtensionProposalEligible(state)).toBe(true);
  });

  it("rationale from overall_summary only (no missing_capability) → eligible", () => {
    const state = eligibleState({
      missing_capability: null,
      critique: minimalCritique({ medium_fit_note: null, overall_summary: "Better as another format." }),
    });
    expect(isExtensionProposalEligible(state)).toBe(true);
  });

  it("missing_capability set without rationale → eligible", () => {
    const state = eligibleState({
      critique: minimalCritique({ medium_fit_note: null, overall_summary: null }),
    });
    expect(isExtensionProposalEligible(state)).toBe(true);
  });

  it("medium_fit = unsupported with classification → eligible", () => {
    const state = eligibleState({ medium_fit: "unsupported" });
    expect(isExtensionProposalEligible(state)).toBe(true);
  });
});

describe("Phase 3: extension proposal creation and trace", () => {
  it("extension-eligible state has required fields for proposal (contract sanity)", () => {
    const state = eligibleState();
    expect(state.primaryArtifact?.artifact_id).toBeDefined();
    expect(state.extension_classification).toBe("surface_environment_extension");
    expect(state.medium_fit).toBe("partial");
    expect(isExtensionProposalEligible(state)).toBe(true);
  });
});
