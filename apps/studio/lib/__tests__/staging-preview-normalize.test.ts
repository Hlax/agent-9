import { describe, it, expect } from "vitest";
import { normalizePreviewSlug } from "../preview-slug";

describe("staging preview slug normalization", () => {
  it("falls back to home for missing or invalid slugs", () => {
    expect(normalizePreviewSlug(undefined)).toBe("home");
    expect(normalizePreviewSlug("")).toBe("home");
    expect(normalizePreviewSlug("unknown")).toBe("home");
  });

  it("accepts known habitat pages", () => {
    expect(normalizePreviewSlug("home")).toBe("home");
    expect(normalizePreviewSlug("works")).toBe("works");
    expect(normalizePreviewSlug("about")).toBe("about");
    expect(normalizePreviewSlug("installation")).toBe("installation");
  });
});

