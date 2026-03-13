import { PROPOSAL_STATE_TRANSITIONS } from "../governance-rules";
import { canTransitionProposalState, getProposalAuthority, type LaneType } from "../proposal-governance";

describe("staging proposal inline actions", () => {
  it("only offers actions that are legal per FSM and lane guards", () => {
    const lane: LaneType = "surface";
    const authority = getProposalAuthority("reviewer");
    const current = "pending_review";

    const legalTargets = PROPOSAL_STATE_TRANSITIONS[current];
    expect(legalTargets).toContain("approved_for_staging");
    expect(legalTargets).toContain("needs_revision");
    expect(legalTargets).toContain("rejected");
    expect(legalTargets).toContain("ignored");

    const checkApproveForStaging = canTransitionProposalState({
      current_state: current,
      target_state: "approved_for_staging",
      lane_type: lane,
      actor_authority: authority,
    });
    expect(checkApproveForStaging.ok).toBe(true);

    const checkIllegal = canTransitionProposalState({
      current_state: current,
      target_state: "published",
      lane_type: lane,
      actor_authority: authority,
    });
    expect(checkIllegal.ok).toBe(false);
  });
});
