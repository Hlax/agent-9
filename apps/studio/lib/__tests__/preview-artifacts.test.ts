import { buildPreviewArtifactsMap, resolveArtifactIds } from "../preview-artifacts";

describe("buildPreviewArtifactsMap", () => {
  it("builds a map keyed by artifact_id with sane defaults", () => {
    const rows = [
      {
        artifact_id: "a1",
        title: "Title A1",
        summary: "Summary A1",
        medium: "image",
        content_uri: "content://a1",
        preview_uri: "preview://a1",
        created_at: "2025-01-01T00:00:00.000Z",
      },
      {
        artifact_id: "a2",
        // missing optional fields should not break mapping
      },
    ];

    const map = buildPreviewArtifactsMap(rows);
    expect(map.size).toBe(2);
    const a1 = map.get("a1");
    const a2 = map.get("a2");
    expect(a1).toMatchObject({
      artifact_id: "a1",
      title: "Title A1",
      summary: "Summary A1",
      medium: "image",
      content_uri: "content://a1",
      preview_uri: "preview://a1",
    });
    expect(a2).toMatchObject({
      artifact_id: "a2",
      title: "a2",
      summary: null,
    });
  });

  it("skips rows without a valid string artifact_id", () => {
    const rows = [
      { artifact_id: null },
      { artifact_id: 123 },
      { artifact_id: "ok-id", title: "OK" },
    ];
    const map = buildPreviewArtifactsMap(rows as Array<Record<string, unknown>>);
    expect(map.size).toBe(1);
    expect(map.get("ok-id")?.title).toBe("OK");
  });
});

describe("resolveArtifactIds", () => {
  it("returns empty resolved and unresolved for empty ids", () => {
    const map = new Map();
    const { resolved, unresolved } = resolveArtifactIds([], map);
    expect(resolved).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it("returns all resolved when every id exists in map", () => {
    const rows = [
      { artifact_id: "x", title: "X", summary: null, medium: null, content_uri: null, preview_uri: null, created_at: "" },
      { artifact_id: "y", title: "Y", summary: null, medium: null, content_uri: null, preview_uri: null, created_at: "" },
    ];
    const map = buildPreviewArtifactsMap(rows as Array<Record<string, unknown>>);
    const { resolved, unresolved } = resolveArtifactIds(["x", "y"], map);
    expect(resolved).toHaveLength(2);
    expect(resolved[0].artifact_id).toBe("x");
    expect(resolved[1].artifact_id).toBe("y");
    expect(unresolved).toEqual([]);
  });

  it("returns all unresolved when map is empty", () => {
    const map = new Map();
    const { resolved, unresolved } = resolveArtifactIds(["a", "b"], map);
    expect(resolved).toEqual([]);
    expect(unresolved).toEqual(["a", "b"]);
  });

  it("splits resolved and unresolved preserving order", () => {
    const rows = [{ artifact_id: "hit", title: "Hit", summary: null, medium: null, content_uri: null, preview_uri: null, created_at: "" }];
    const map = buildPreviewArtifactsMap(rows as Array<Record<string, unknown>>);
    const { resolved, unresolved } = resolveArtifactIds(["miss", "hit", "also-miss"], map);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].artifact_id).toBe("hit");
    expect(unresolved).toEqual(["miss", "also-miss"]);
  });
});

