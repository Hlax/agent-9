import {
  buildStagingBuckets,
  classifyLaneBucket,
  type RawStagingPage,
  type RawStagingProposal,
} from "../staging-read-model";

describe("staging-read-model", () => {
  it("classifies lane buckets from canon lane_id and role/target (DB lane_type: surface | medium | system)", () => {
    expect(
      classifyLaneBucket({ lane_type: "system", proposal_role: null, target_type: null })
    ).toBe("system");
    expect(
      classifyLaneBucket({
        lane_type: "surface",
        proposal_role: "critique_layout",
        target_type: null,
      })
    ).toBe("critiques");
    expect(
      classifyLaneBucket({
        lane_type: "surface",
        proposal_role: "extension_layout",
        target_type: null,
      })
    ).toBe("extensions");
    expect(
      classifyLaneBucket({
        lane_type: "surface",
        proposal_role: "habitat_layout",
        target_type: "surface",
      })
    ).toBe("habitat");
    // Unknown lane_type maps to build_lane → habitat when no role/target match
    expect(
      classifyLaneBucket({ lane_type: "artifact", proposal_role: null, target_type: null })
    ).toBe("habitat");
  });

  it("groups habitat proposals by staging slug when available", () => {
    const proposals: RawStagingProposal[] = [
      {
        proposal_record_id: "p1",
        lane_type: "surface",
        target_type: "surface",
        target_surface: "home",
        proposal_role: "habitat_layout",
        proposal_type: "layout",
        title: "Update hero",
        summary: "Change hero text",
        proposal_state: "approved_for_staging",
        review_note: null,
        habitat_payload_json: null,
        artifact_id: null,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
        allowed_actions: ["approve_for_publication"],
      },
      {
        proposal_record_id: "p2",
        lane_type: "surface",
        target_type: "surface",
        target_surface: "home",
        proposal_role: "habitat_layout",
        proposal_type: "layout",
        title: "Add artifact block",
        summary: "Show recent artifact",
        proposal_state: "approved_for_staging",
        review_note: null,
        habitat_payload_json: null,
        artifact_id: null,
        created_at: "2024-01-02T00:00:00.000Z",
        updated_at: "2024-01-02T00:00:00.000Z",
        allowed_actions: ["approve_for_publication"],
      },
    ];

    const pages: RawStagingPage[] = [
      {
        slug: "home",
        title: "Home",
        payload_json: { version: 1, page: "home", blocks: [] },
        source_proposal_id: "p1",
        updated_at: "2024-01-02T00:00:00.000Z",
      },
    ];

    const model = buildStagingBuckets(proposals, pages);
    expect(model.totals.proposals).toBe(2);
    expect(model.totals.habitatGroups).toBe(1);

    const group = model.buckets.habitat.groups[0];
    expect(group.slug).toBe("home");
    expect(group.proposals.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  });

  it("places proposals into legacy buckets when appropriate (canon lane_id + role/target)", () => {
    const proposals: RawStagingProposal[] = [
      {
        proposal_record_id: "a1",
        lane_type: "surface",
        target_type: "concept",
        target_surface: "staging_habitat",
        proposal_role: "layout_change",
        proposal_type: "layout_change",
        title: "Layout",
        summary: null,
        proposal_state: "approved_for_staging",
        review_note: null,
        habitat_payload_json: null,
        artifact_id: "art1",
        created_at: null,
        updated_at: null,
        allowed_actions: [],
      },
      {
        proposal_record_id: "c1",
        lane_type: "surface",
        target_type: "critique",
        target_surface: null,
        proposal_role: "critique_layout",
        proposal_type: "layout",
        title: "Critique tweak",
        summary: null,
        proposal_state: "approved_for_staging",
        review_note: null,
        habitat_payload_json: null,
        artifact_id: null,
        created_at: null,
        updated_at: null,
        allowed_actions: [],
      },
      {
        proposal_record_id: "s1",
        lane_type: "system",
        target_type: "system",
        target_surface: null,
        proposal_role: "system_proposal",
        proposal_type: "workflow",
        title: "System change",
        summary: null,
        proposal_state: "approved_for_staging",
        review_note: null,
        habitat_payload_json: null,
        artifact_id: null,
        created_at: null,
        updated_at: null,
        allowed_actions: [],
      },
    ];

    const pages: RawStagingPage[] = [];

    const model = buildStagingBuckets(proposals, pages);
    expect(model.buckets.habitat.groups.flatMap((g) => g.proposals.map((p) => p.id))).toContain("a1");
    expect(model.buckets.critiques.proposals.map((p) => p.id)).toEqual(["c1"]);
    expect(model.buckets.system.proposals.map((p) => p.id)).toEqual(["s1"]);
  });
});
