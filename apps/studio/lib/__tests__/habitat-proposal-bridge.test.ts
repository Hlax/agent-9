import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  generateHabitatProposals,
  type HabitatProposalGenerationContext,
  type TwinHabitatProposal,
  toBridgeHabitatProposalV1,
  toBridgeHabitatProposalV1List,
} from "../habitat-proposal";
import type { HabitatProposalV1 } from "@twin/core";

const LabHabitatProposalV1Schema = z
  .object({
    proposal_id: z.string(),
    identity_id: z.string().nullable(),
    proposal_kind: z.literal("habitat_update"),
    target_surface: z.literal("home"),
    change_type: z.enum([
      "update_current_focus",
      "add_recent_artifact",
      "add_summary_block",
    ]),
    source_session_id: z.string().nullable(),
    source_artifact_id: z.string().nullable(),
    source_reason: z.string(),
    proposed_payload: z.record(z.unknown()),
  })
  .strict();

function makeCtx(
  overrides: Partial<HabitatProposalGenerationContext> = {}
): HabitatProposalGenerationContext {
  return {
    identityId: "identity-1",
    sessionId: "session-1",
    milestoneArtifact: null,
    previousFocus: "Old focus",
    currentFocus: "New focus",
    decisionConfidence: 0.9,
    now: "2026-03-13T00:00:00.000Z",
    proposalIdFactory: () => "fixed-id",
    ...overrides,
  };
}

describe("HabitatProposalV1 → LabHabitatProposalV1 bridge", () => {
  it("preserves only the strict lab contract fields", () => {
    const [rich] = generateHabitatProposals(makeCtx());
    expect(rich).toBeDefined();

    const bridged = toBridgeHabitatProposalV1(rich as TwinHabitatProposal) as HabitatProposalV1;

    const keys = Object.keys(bridged).sort();
    expect(keys).toEqual([
      "change_type",
      "identity_id",
      "proposal_id",
      "proposal_kind",
      "proposed_payload",
      "source_artifact_id",
      "source_reason",
      "source_session_id",
      "target_surface",
    ]);

    // Regression: extra internal fields must not cross the bridge.
    expect("confidence" in bridged).toBe(false);
    expect("created_at" in bridged).toBe(false);
    expect("status" in bridged).toBe(false);
  });

  it("produces payloads that pass the strict lab validator", () => {
    const rich = generateHabitatProposals(makeCtx());
    const bridged = toBridgeHabitatProposalV1List(rich as TwinHabitatProposal[]);
    expect(bridged.length).toBeGreaterThan(0);

    for (const p of bridged) {
      const parsed = LabHabitatProposalV1Schema.safeParse(p);
      expect(parsed.success).toBe(true);
    }
  });
});
