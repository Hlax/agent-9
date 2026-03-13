/**
 * Trait summary derivation for habitat snapshots. Canon: docs/05_build/SNAPSHOT_LINEAGE_IDENTITY_TRAJECTORY_V1.md §2.
 * block_profile uses CLOSED ENUM only: hero, text, artifact_grid, artifact, extension, other.
 * Unknown block types map to 'other'; no dynamic keys at runtime.
 */

/** V1 canonical block types for block_profile. Do not add keys at runtime. */
const BLOCK_PROFILE_KEYS = [
  "hero",
  "text",
  "artifact_grid",
  "artifact",
  "extension",
  "other",
] as const;

export type BlockProfileKey = (typeof BLOCK_PROFILE_KEYS)[number];

/** Map payload block type string to closed enum key. Everything unknown → other. */
function blockTypeToProfileKey(type: string): BlockProfileKey {
  switch (type) {
    case "hero":
      return "hero";
    case "text":
    case "quote":
      return "text";
    case "artifact_grid":
      return "artifact_grid";
    case "featured_artifact":
      return "artifact";
    case "extension":
      return "extension";
    default:
      return "other";
  }
}

export interface TraitSummaryAvatar {
  avatar_artifact_id: string | null;
  embodiment_length: 0 | 1 | 2; // 0 = none, 1 = short, 2 = long
}

export interface TraitSummaryLayout {
  slugs: string[];
  slug_count: number;
}

/** Counts by closed enum only. No arbitrary block names. */
export interface TraitSummaryBlockProfile {
  hero: number;
  text: number;
  artifact_grid: number;
  artifact: number;
  extension: number;
  other: number;
}

export interface TraitSummary {
  avatar: TraitSummaryAvatar;
  layout_signature: TraitSummaryLayout;
  block_profile: TraitSummaryBlockProfile;
  extension_profile: string[];
  theme_tone?: string | null;
}

const EMPTY_BLOCK_PROFILE: TraitSummaryBlockProfile = {
  hero: 0,
  text: 0,
  artifact_grid: 0,
  artifact: 0,
  extension: 0,
  other: 0,
};

function countBlocks(blocks: unknown[]): TraitSummaryBlockProfile {
  const counts = { ...EMPTY_BLOCK_PROFILE };
  for (const b of blocks) {
    const type = typeof b === "object" && b !== null && "type" in b ? String((b as { type: string }).type) : "";
    const key = blockTypeToProfileKey(type);
    counts[key]++;
  }
  return counts;
}

/** Derive embodiment_length from optional string. 0 = none, 1 = short (<=200), 2 = long. */
function embodimentLength(s: string | null | undefined): 0 | 1 | 2 {
  if (s == null || s.trim() === "") return 0;
  return s.length <= 200 ? 1 : 2;
}

/**
 * Build trait summary from staging rows (array of { slug, payload_json }) and optional avatar state.
 * Used at snapshot creation only; never recomputed (snapshot is immutable).
 */
export function deriveTraitSummaryFromStagingPages(
  pages: Array<{ slug: string; payload_json: unknown }>,
  avatarArtifactId: string | null,
  embodimentDirection: string | null | undefined,
  extensionIds: string[] = []
): TraitSummary {
  const slugs = pages.map((p) => p.slug).filter(Boolean);
  const allBlocks: unknown[] = [];
  for (const p of pages) {
    const payload = p.payload_json;
    if (payload && typeof payload === "object" && "blocks" in payload && Array.isArray((payload as { blocks: unknown[] }).blocks)) {
      allBlocks.push(...(payload as { blocks: unknown[] }).blocks);
    }
  }
  return {
    avatar: {
      avatar_artifact_id: avatarArtifactId ?? null,
      embodiment_length: embodimentLength(embodimentDirection),
    },
    layout_signature: { slugs, slug_count: slugs.length },
    block_profile: countBlocks(allBlocks),
    extension_profile: Array.isArray(extensionIds) ? extensionIds : [],
    theme_tone: null,
  };
}
