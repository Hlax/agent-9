import { describe, it, expect } from "vitest";
import {
  classifyProposalLane,
  canCreateProposal,
  canTransitionProposalState,
  canPromoteProposalToStaging,
  canPromoteProposalToPublic,
  evaluateGovernanceGate,
  validateProposalType,
  GOVERNANCE_REASON_CODES,
  type LaneType,
} from "../proposal-governance";

describe("Governance V1: canon-driven lane classification", () => {
  it("classifies by proposal_type from canon (system_change → build_lane → surface)", () => {
    const res = classifyProposalLane({ proposal_type: "system_change" });
    expect(res.lane_type).toBe("surface");
    expect(res.canon_lane_id).toBe("build_lane");
    expect(res.reason_codes).toEqual([]);
    expect(res.classification_reason).toContain("primary_lane=build_lane");
  });

  it("classifies new_agent → system_lane → system", () => {
    const res = classifyProposalLane({ proposal_type: "new_agent" });
    expect(res.lane_type).toBe("system");
    expect(res.canon_lane_id).toBe("system_lane");
  });

  it("returns PROPOSAL_TYPE_NOT_IN_CANON and defaults to surface for unknown proposal_type", () => {
    const res = classifyProposalLane({ proposal_type: "unknown_type_xyz" });
    expect(res.lane_type).toBe("surface");
    expect(res.reason_codes).toContain(GOVERNANCE_REASON_CODES.PROPOSAL_TYPE_NOT_IN_CANON);
  });

  it("validateProposalType returns true for canon types", () => {
    expect(validateProposalType("schema_change")).toBe(true);
    expect(validateProposalType("refactor_plan")).toBe(true);
  });

  it("validateProposalType returns false for unknown types", () => {
    expect(validateProposalType("unknown_xyz")).toBe(false);
  });
});

describe("Governance V1: runner authority for proposal creation", () => {
  it("allows runner to create surface proposals", () => {
    const res = canCreateProposal("surface", "runner");
    expect(res.ok).toBe(true);
    expect(res.decision).toBe("allow");
    expect(res.reason_codes).toEqual([]);
  });

  it("blocks runner (agent_9) from creating medium (audit_lane) proposals when canon does not grant audit_lane", () => {
    const res = canCreateProposal("medium", "runner");
    expect(res.ok).toBe(false);
    expect(res.decision).toBe("block");
    expect(res.reason_codes).toContain(GOVERNANCE_REASON_CODES.AGENT_NOT_ALLOWED_FOR_LANE);
  });

  it("allows runner (agent_9) to create system proposals when canon grants lane_permissions", () => {
    const res = canCreateProposal("system", "runner");
    expect(res.ok).toBe(true);
    expect(res.decision).toBe("allow");
    expect(res.reason_codes).toEqual([]);
  });
});

describe("Governance V1: lane-aware proposal state transitions", () => {
  const actor = "human" as const;

  it("allows surface proposal to move to approved_for_staging", () => {
    const res = canPromoteProposalToStaging("surface", "pending_review", actor);
    expect(res.ok).toBe(true);
    expect(res.decision).toBe("allow");
  });

  it("blocks medium proposal from moving to approved_for_staging", () => {
    const res = canPromoteProposalToStaging("medium", "pending_review", actor);
    expect(res.ok).toBe(false);
    expect(res.reason_codes).toContain(GOVERNANCE_REASON_CODES.NON_SURFACE_STAGING_FORBIDDEN);
  });

  it("blocks system proposal from moving to approved_for_staging", () => {
    const res = canPromoteProposalToStaging("system", "pending_review", actor);
    expect(res.ok).toBe(false);
    expect(res.reason_codes).toContain(GOVERNANCE_REASON_CODES.NON_SURFACE_STAGING_FORBIDDEN);
  });

  it("allows surface proposal to move toward public (approved_for_publication)", () => {
    const res = canPromoteProposalToPublic("surface", "approved_for_staging", actor);
    expect(res.ok).toBe(true);
    expect(res.decision).toBe("allow");
  });

  it("blocks medium proposal from promotion toward public", () => {
    const res = canPromoteProposalToPublic("medium", "approved_for_staging", actor);
    expect(res.ok).toBe(false);
    expect(res.reason_codes).toContain(GOVERNANCE_REASON_CODES.NON_SURFACE_PUBLIC_PROMOTION_FORBIDDEN);
  });

  it("blocks system proposal from promotion toward public", () => {
    const res = canPromoteProposalToPublic("system", "approved_for_staging", actor);
    expect(res.ok).toBe(false);
    expect(res.reason_codes).toContain(GOVERNANCE_REASON_CODES.NON_SURFACE_PUBLIC_PROMOTION_FORBIDDEN);
  });

  it("marks illegal state transitions with ILLEGAL_PROPOSAL_STATE_TRANSITION", () => {
    const lanes: LaneType[] = ["surface", "medium", "system"];
    for (const lane of lanes) {
      const res = canTransitionProposalState({
        current_state: "pending_review",
        target_state: "published", // illegal skip in FSM
        lane_type: lane,
        actor_authority: actor,
      });
      expect(res.ok).toBe(false);
      expect(res.reason_codes).toContain(GOVERNANCE_REASON_CODES.ILLEGAL_PROPOSAL_STATE_TRANSITION);
    }
  });
});

describe("Governance V1: gate behavior", () => {
  it("treats defaulted confidence as a warning when minimum evidence is not known to be missing", () => {
    const res = evaluateGovernanceGate({
      lane_type: "surface",
      proposal_role: "habitat_layout",
      current_state: null,
      target_state: "pending_review",
      actor_authority: "runner",
      confidence_truth: "defaulted",
      duplicate_signal: null,
      has_minimum_evidence: true,
    });
    expect(res.ok).toBe(true);
    expect(res.decision).toBe("warn");
    expect(res.reason_codes).toContain(GOVERNANCE_REASON_CODES.CONFIDENCE_DEFAULTED_WARNING);
  });

  it("blocks when governance gate reports insufficient evidence for creation/promotion", () => {
    const res = evaluateGovernanceGate({
      lane_type: "surface",
      proposal_role: "habitat_layout",
      current_state: null,
      target_state: "pending_review",
      actor_authority: "runner",
      confidence_truth: "inferred",
      duplicate_signal: null,
      has_minimum_evidence: false,
    });
    expect(res.ok).toBe(false);
    expect(res.decision).toBe("block");
    expect(res.reason_codes).toContain(GOVERNANCE_REASON_CODES.INSUFFICIENT_EVIDENCE);
  });

  it("adds duplicate pressure as a warning when duplicate_signal is high", () => {
    const res = evaluateGovernanceGate({
      lane_type: "surface",
      proposal_role: "habitat_layout",
      current_state: null,
      target_state: "pending_review",
      actor_authority: "runner",
      confidence_truth: "inferred",
      duplicate_signal: 0.9,
      has_minimum_evidence: true,
    });
    expect(res.ok).toBe(true);
    expect(res.decision).toBe("warn");
    expect(res.reason_codes).toContain(GOVERNANCE_REASON_CODES.DUPLICATE_PRESSURE_WARNING);
  });

  it("blocks non-surface promotion to public in the gate itself", () => {
    const res = evaluateGovernanceGate({
      lane_type: "medium",
      proposal_role: "medium_extension",
      current_state: "approved_for_staging",
      target_state: "approved_for_publication",
      actor_authority: "human",
      confidence_truth: "inferred",
      duplicate_signal: null,
      has_minimum_evidence: true,
    });
    expect(res.ok).toBe(false);
    expect(res.decision).toBe("block");
    expect(res.reason_codes).toContain(GOVERNANCE_REASON_CODES.NON_SURFACE_PROMOTION_BLOCK);
  });
});

