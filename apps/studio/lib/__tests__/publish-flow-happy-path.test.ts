import { selectHabitatPagePayloadFromSnapshot } from "../public-habitat-selector";

/**
 * This test exercises the snapshot-oriented public habitat selector on a
 * synthetic payload that matches the shape written by promoteStagingToPublic.
 *
 * It verifies that public resolution would pick the latest payload written
 * by promotion (habitat_pages entry), independent of staging state.
 */
describe("publish flow happy-path (snapshot selector oriented)", () => {
  it("resolves promoted payload from latest snapshot-like payload", () => {
    const firstSnapshot = {
      habitat_pages: [
        { slug: "home", payload: { version: 1, page: "home", blocks: [{ id: "b1", type: "hero" }] } },
      ],
      avatar_state: null,
      extensions: [],
    };

    const secondSnapshot = {
      habitat_pages: [
        { slug: "home", payload: { version: 1, page: "home", blocks: [{ id: "b2", type: "hero" }] } },
      ],
      avatar_state: null,
      extensions: [],
    };

    const resolvedFirst = selectHabitatPagePayloadFromSnapshot(firstSnapshot, "home");
    const resolvedSecond = selectHabitatPagePayloadFromSnapshot(secondSnapshot, "home");

    expect(resolvedFirst).toEqual({
      version: 1,
      page: "home",
      blocks: [{ id: "b1", type: "hero" }],
    });
    expect(resolvedSecond).toEqual({
      version: 1,
      page: "home",
      blocks: [{ id: "b2", type: "hero" }],
    });
  });
});
