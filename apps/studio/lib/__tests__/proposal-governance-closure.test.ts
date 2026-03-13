import { describe, it, expect } from "vitest";
import {
  classifyProposalLane,
  canCreateProposal,
  canRollbackProposalState,
  canTransitionProposalState,
  getProposalAuthority,
  type LaneType,
} from "../proposal-governance";

describe("Governance V1: API-facing classification helpers", () => {
  it("/api/proposals POST-style body classifies via governance (surface habitat)", () => {
    const lane = classifyProposalLane({
      requested_lane: "surface",
      proposal_role: "habitat_layout",
      target_surface: "staging_habitat",
      target_type: "concept",
    });
    expect(lane.lane_type).toBe("surface");
  });

  it("/api/proposals POST-style body supports system lane for human callers", () => {
    const lane = classifyProposalLane({
      requested_lane: "system",
      proposal_role: "system_proposal",
      target_surface: null,
      target_type: "governance_change",
    });
    const authority = getProposalAuthority("http_user");
    const res = canCreateProposal(lane.lane_type, authority);
    expect(lane.lane_type).toBe("system");
    expect(res.ok).toBe(true);
  });

  it("artifact create-proposal route style classification prefers governance mapping", () => {
    const lane = classifyProposalLane({
      requested_lane: "surface",
      proposal_role: "interactive_module",
      target_surface: "staging_habitat",
      target_type: "concept",
    });
    expect(lane.lane_type).toBe("surface");
  });

  it("chat name proposals resolve to surface lane through governance classification", () => {
    const lane = classifyProposalLane({
      requested_lane: "surface",
      proposal_role: "identity_name",
      target_surface: "identity",
      target_type: "identity_name",
    });
    const authority = getProposalAuthority("http_user");
    const res = canCreateProposal(lane.lane_type, authority);
    expect(lane.lane_type).toBe("surface");
    expect(res.ok).toBe(true);
  });
});

describe("Governance V1: rollback and staging→public transitions consult governance", () => {
  const human = getProposalAuthority("http_user");

  it("unpublish-style rollback from published to approved_for_staging is allowed for surface lane", () => {
    const res = canRollbackProposalState({
      current_state: "published",
      target_state: "approved_for_staging",
      lane_type: "surface",
      actor_authority: human,
    });
    expect(res.ok).toBe(true);
  });

  it("unpublish-style rollback from published to approved_for_staging is blocked for non-surface lanes", () => {
    const lanes: LaneType[] = ["medium", "system"];
    for (const lane of lanes) {
      const res = canRollbackProposalState({
        current_state: "published",
        target_state: "approved_for_staging",
        lane_type: lane,
        actor_authority: human,
      });
      expect(res.ok).toBe(false);
    }
  });

  it("staging→public bulk publish path uses canTransitionProposalState semantics", () => {
    const lanes: LaneType[] = ["surface", "medium", "system"];
    for (const lane of lanes) {
      const res = canTransitionProposalState({
        current_state: "approved_for_publication",
        target_state: "published",
        lane_type: lane,
        actor_authority: human,
      });
      if (lane === "surface") {
        expect(res.ok).toBe(true);
      } else {
        expect(res.ok).toBe(false);
      }
    }
  });
});

