/**
 * Helper for selecting a single habitat page payload from a snapshot payload.
 * This is snapshot-oriented and does not touch staging or live tables.
 */

export interface SnapshotHabitatPage {
  slug?: unknown;
  payload?: unknown;
}

export interface SnapshotPayloadLike {
  habitat_pages?: unknown;
}

export function selectHabitatPagePayloadFromSnapshot(
  snapshotPayload: unknown,
  slug: string
): unknown | null {
  if (!snapshotPayload || typeof snapshotPayload !== "object") return null;
  const obj = snapshotPayload as SnapshotPayloadLike;
  const pagesRaw = obj.habitat_pages;
  if (!Array.isArray(pagesRaw)) return null;

  const page = pagesRaw.find((p) => {
    if (!p || typeof p !== "object") return false;
    const pr = p as SnapshotHabitatPage;
    return typeof pr.slug === "string" && pr.slug === slug;
  }) as SnapshotHabitatPage | undefined;

  if (!page || !page.payload || typeof page.payload !== "object") return null;
  return page.payload;
}

