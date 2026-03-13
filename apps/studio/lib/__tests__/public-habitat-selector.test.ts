import { selectHabitatPagePayloadFromSnapshot } from "../public-habitat-selector";

describe("public-habitat-selector", () => {
  it("selects the payload for the requested slug from snapshot payload", () => {
    const snapshotPayload = {
      habitat_pages: [
        { slug: "home", payload: { version: 1, page: "home", blocks: [{ id: "b1" }] } },
        { slug: "works", payload: { version: 1, page: "works", blocks: [{ id: "b2" }] } },
      ],
    };

    const home = selectHabitatPagePayloadFromSnapshot(snapshotPayload, "home");
    const works = selectHabitatPagePayloadFromSnapshot(snapshotPayload, "works");
    const about = selectHabitatPagePayloadFromSnapshot(snapshotPayload, "about");

    expect(home).toEqual({ version: 1, page: "home", blocks: [{ id: "b1" }] });
    expect(works).toEqual({ version: 1, page: "works", blocks: [{ id: "b2" }] });
    expect(about).toBeNull();
  });

  it("returns null when snapshot payload is malformed", () => {
    expect(selectHabitatPagePayloadFromSnapshot(null, "home")).toBeNull();
    expect(
      selectHabitatPagePayloadFromSnapshot({ habitat_pages: "not-an-array" }, "home")
    ).toBeNull();
  });
});
