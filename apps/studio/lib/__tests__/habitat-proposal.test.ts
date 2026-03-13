import { describe, it, expect } from "vitest";
import {
  generateHabitatProposals,
  type HabitatProposalGenerationContext,
  type HabitatProposalV1,
} from "../habitat-proposal";

function makeCtx(
  overrides: Partial<HabitatProposalGenerationContext> = {}
): HabitatProposalGenerationContext {
  return {
    identityId: "identity-1",
    sessionId: "session-1",
    milestoneArtifact: null,
    previousFocus: null,
    currentFocus: null,
    decisionConfidence: 0.8,
    now: "2026-03-13T00:00:00.000Z",
    proposalIdFactory: () => "fixed-id",
    ...overrides,
  };
}

describe("generateHabitatProposals — V1 contract", () => {
  it("produces no proposals when nothing meaningful changed", () => {
    const ctx = makeCtx();
    const proposals = generateHabitatProposals(ctx);
    expect(proposals).toHaveLength(0);
  });

  it("emits update_current_focus when focus changes materially", () => {
    const ctx = makeCtx({
      previousFocus: "Old focus",
      currentFocus: "Closing the first publish governance loop",
    });
    const proposals = generateHabitatProposals(ctx);
    expect(proposals).toHaveLength(1);
    const p = proposals[0] as HabitatProposalV1;
    expect(p.change_type).toBe("update_current_focus");
    expect(p.target_surface).toBe("home");
    expect(p.source_reason).toContain("Current focus changed materially");
    expect(p.proposed_payload).toEqual({
      block_type: "focus",
      operation: "upsert",
      content: {
        label: "Current Focus",
        text: "Closing the first publish governance loop",
      },
    });
  });

  it("emits add_recent_artifact and add_summary_block for milestone artifacts", () => {
    const ctx = makeCtx({
      milestoneArtifact: {
        artifact_id: "art-1",
        title: "Stage 2 editing workflow complete",
        summary:
          "Added bounded staging edits, publish review, and promotion flow.",
        isMilestone: true,
      },
    });
    const proposals = generateHabitatProposals(ctx);
    expect(proposals.length).toBe(2);
    const types = proposals.map((p) => p.change_type).sort();
    expect(types).toEqual(["add_recent_artifact", "add_summary_block"]);

    const recent = proposals.find(
      (p) => p.change_type === "add_recent_artifact"
    ) as HabitatProposalV1;
    const summary = proposals.find(
      (p) => p.change_type === "add_summary_block"
    ) as HabitatProposalV1;

    expect(recent.proposed_payload).toEqual({
      block_type: "artifact",
      operation: "append",
      content: {
        title: "Stage 2 editing workflow complete",
        artifact_id: "art-1",
        summary:
          "Added bounded staging edits, publish review, and promotion flow.",
      },
    });

    expect(summary.proposed_payload).toEqual({
      block_type: "text",
      operation: "append",
      content: {
        title: "Latest update",
        text: "Added bounded staging edits, publish review, and promotion flow.",
      },
    });
  });
}

