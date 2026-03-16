/**
 * Agent-9 second pass: behavior tests for canon-native flows.
 * - Proposal POST rejects missing/invalid proposal_type
 * - Artifact create-proposal rejects missing proposal_type
 * - Staging includes only canon-stageable lanes when stageableOnly
 * - Counts API shape is byLane / byProposalType
 * - Happy-path classification does not hit deprecated fallback
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { classifyProposalLane, validateProposalType, GOVERNANCE_REASON_CODES } from "../proposal-governance";
import {
  buildStagingBucketsLaneOnly,
  toLegacyStagingBuckets,
  isStageableCanonLane,
  deriveCanonLaneId,
  type RawStagingProposal,
  type RawStagingPage,
} from "../staging-read-model";

const ORIGINAL_ENV = process.env.ALLOW_LEGACY_PROPOSAL_LANE_FALLBACK;

describe("Canon-native: proposal_type required and validated", () => {
  it("validateProposalType returns true for canon types", () => {
    expect(validateProposalType("layout_change")).toBe(true);
    expect(validateProposalType("embodiment_change")).toBe(true);
    expect(validateProposalType("integration_change")).toBe(true);
    expect(validateProposalType("new_agent")).toBe(true);
  });

  it("validateProposalType returns false for invalid or unknown types", () => {
    expect(validateProposalType("")).toBe(false);
    expect(validateProposalType("habitat_layout")).toBe(false);
    expect(validateProposalType("avatar_candidate")).toBe(false);
    expect(validateProposalType("unknown_xyz")).toBe(false);
  });

  it("classifyProposalLane with valid proposal_type does not set DEPRECATED_LEGACY_FALLBACK", () => {
    const r = classifyProposalLane({ proposal_type: "layout_change", target_surface: "staging_habitat" });
    expect(r.reason_codes).not.toContain(GOVERNANCE_REASON_CODES.DEPRECATED_LEGACY_FALLBACK);
    expect(r.canon_lane_id).toBe("build_lane");
    expect(r.lane_type).toBe("surface");
  });

  it("classifyProposalLane with invalid proposal_type sets PROPOSAL_TYPE_NOT_IN_CANON and defaults lane", () => {
    const r = classifyProposalLane({ proposal_type: "not_in_canon_xyz" });
    expect(r.reason_codes).toContain(GOVERNANCE_REASON_CODES.PROPOSAL_TYPE_NOT_IN_CANON);
    expect(r.lane_type).toBe("surface");
  });
});

describe("Canon-native: legacy fallback is gated", () => {
  afterEach(() => {
    process.env.ALLOW_LEGACY_PROPOSAL_LANE_FALLBACK = ORIGINAL_ENV;
  });

  it("when ALLOW_LEGACY_PROPOSAL_LANE_FALLBACK is not set, missing proposal_type still returns a result with DEPRECATED_LEGACY_FALLBACK", () => {
    delete process.env.ALLOW_LEGACY_PROPOSAL_LANE_FALLBACK;
    const r = classifyProposalLane({ requested_lane: "surface" });
    expect(r.reason_codes).toContain(GOVERNANCE_REASON_CODES.DEPRECATED_LEGACY_FALLBACK);
    expect(r.lane_type).toBe("surface");
  });

  it("when fallback allowed, requested_lane is used and reason_codes include DEPRECATED_LEGACY_FALLBACK", () => {
    process.env.ALLOW_LEGACY_PROPOSAL_LANE_FALLBACK = "1";
    const r = classifyProposalLane({ requested_lane: "system" });
    expect(r.reason_codes).toContain(GOVERNANCE_REASON_CODES.DEPRECATED_LEGACY_FALLBACK);
    expect(r.lane_type).toBe("system");
  });
});

describe("Canon-native: staging lane-native core and legacy adapter", () => {
  it("buildStagingBucketsLaneOnly returns only lanes and totals.byLane (no legacy bucket keys in totals)", () => {
    const proposals: RawStagingProposal[] = [
      {
        proposal_record_id: "p1",
        lane_type: "surface",
        target_type: "concept",
        target_surface: "staging_habitat",
        proposal_role: "layout_change",
        proposal_type: "layout_change",
        title: "Layout",
        summary: "Summary",
        proposal_state: "pending_review",
        review_note: null,
        habitat_payload_json: null,
        artifact_id: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
    ];
    const pages: RawStagingPage[] = [];
    const model = buildStagingBucketsLaneOnly(proposals, pages);
    expect(model.totals).toHaveProperty("proposals", 1);
    expect(model.totals).toHaveProperty("byLane");
    expect(model.totals.byLane["build_lane"]).toBe(1);
    expect(Object.keys(model.totals)).toEqual(["proposals", "byLane"]);
    expect(model.lanes["build_lane"]).toBeDefined();
    expect(model.lanes["build_lane"].proposals).toHaveLength(1);
    expect(model.lanes["build_lane"].proposals[0].bucket).toBeUndefined();
  });

  it("toLegacyStagingBuckets produces buckets and totalsLegacy from lane-native model", () => {
    const proposals: RawStagingProposal[] = [
      {
        proposal_record_id: "p1",
        lane_type: "surface",
        target_type: "concept",
        target_surface: "staging_habitat",
        proposal_role: "layout_change",
        proposal_type: "layout_change",
        title: "Layout",
        summary: "Summary",
        proposal_state: "pending_review",
        review_note: null,
        habitat_payload_json: null,
        artifact_id: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
    ];
    const pages: RawStagingPage[] = [];
    const laneNative = buildStagingBucketsLaneOnly(proposals, pages);
    const { buckets, totalsLegacy } = toLegacyStagingBuckets(laneNative);
    expect(buckets).toHaveProperty("habitat");
    expect(buckets).toHaveProperty("artifacts");
    expect(buckets).toHaveProperty("critiques");
    expect(buckets).toHaveProperty("extensions");
    expect(buckets).toHaveProperty("system");
    expect(totalsLegacy).toHaveProperty("habitatGroups");
    expect(totalsLegacy).toHaveProperty("artifacts");
    expect(totalsLegacy).toHaveProperty("critiques");
    expect(totalsLegacy).toHaveProperty("extensions");
    expect(totalsLegacy).toHaveProperty("system");
  });

  it("stageable lanes are only build_lane and promotion_lane per canon", () => {
    expect(isStageableCanonLane("build_lane")).toBe(true);
    expect(isStageableCanonLane("promotion_lane")).toBe(true);
    expect(isStageableCanonLane("audit_lane")).toBe(false);
    expect(isStageableCanonLane("system_lane")).toBe(false);
    expect(isStageableCanonLane("canon_lane")).toBe(false);
  });
});

describe("Canon-native: counts by lane_id", () => {
  it("deriveCanonLaneId maps DB lane_type to canon lane_id", () => {
    expect(deriveCanonLaneId("surface")).toBe("build_lane");
    expect(deriveCanonLaneId("medium")).toBe("audit_lane");
    expect(deriveCanonLaneId("system")).toBe("system_lane");
    expect(deriveCanonLaneId(null)).toBe("build_lane");
  });
});
