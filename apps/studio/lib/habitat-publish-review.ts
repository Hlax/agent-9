import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveTraitSummaryFromStagingPages, type TraitSummary } from "./habitat-trait-summary";
import { getTrajectorySummary, type TrajectorySummaryV1 } from "./habitat-trajectory";

export type PublishSignificance = "none" | "minor" | "major";

export type PublishRecommendation =
  | "publish_ok"
  | "publish_ok_but_review"
  | "likely_duplicate"
  | "likely_reversion"
  | "defer_for_stability";

export interface HabitatDiffSummary {
  has_current_public: boolean;
  current_public_snapshot_id: string | null;

  avatar_changed: boolean;
  recurring_avatar_match: boolean;

  layout_changed: boolean;
  recurring_layout_match: boolean;

  blocks_added: number;
  blocks_removed: number;
  blocks_changed: number;

  extensions_changed: boolean;

  significance: PublishSignificance;
}

export interface PublishAdvisoryFlags {
  likely_duplicate: boolean;
  likely_reversion: boolean;
  high_recent_volatility: boolean;
  too_soon_since_last_public: boolean;
  no_current_public: boolean;
}

export interface PublishReadinessReviewV1 {
  identity_id: string;
  reviewed_at: string;

  diff: HabitatDiffSummary;
  trajectory: {
    volatility_index: number;
    recurring_avatar: boolean;
    recurring_layout: boolean;
    reversion_detected: boolean;
    last_public_snapshot_id: string | null;
    interval_since_last_public_seconds: number | null;
  };

  advisory_flags: PublishAdvisoryFlags;
  recommendation: PublishRecommendation;
  recommendation_notes: string[];
}

export interface PublishReadinessReviewParams {
  identityId: string;
  candidatePayload: unknown;
  lastN?: number;
}

interface SnapshotForReview {
  snapshot_id: string;
  created_at: string;
  trait_summary: TraitSummary | null;
  payload_json: unknown | null;
}

interface SnapshotFetchResult {
  snapshot: SnapshotForReview | null;
}

interface SnapshotLikePayload {
  pages: Array<{ slug: string; payload: unknown }>;
  avatarArtifactId: string | null;
  embodimentDirection: string | null;
  extensionIds: string[];
}

const HIGH_VOLATILITY_THRESHOLD = 0.7;
// Conservative: treat publishes within 1 hour as "too soon" when combined with high volatility.
const TOO_SOON_SECONDS = 60 * 60;
const MAX_LAST_N = 20;
const DEFAULT_LAST_N = 10;

export async function getPublishReadinessReview(
  supabase: SupabaseClient,
  params: PublishReadinessReviewParams
): Promise<PublishReadinessReviewV1> {
  const lastNRaw = params.lastN ?? DEFAULT_LAST_N;
  const lastN = Math.min(MAX_LAST_N, Math.max(1, lastNRaw));

  const [currentPublicResult, trajectory] = await Promise.all([
    getCurrentPublicSnapshotForIdentity(supabase, params.identityId),
    getTrajectorySummary(supabase, params.identityId, lastN),
  ]);

  const currentPublic = currentPublicResult.snapshot;

  const candidateSnapshotLike =
    extractSnapshotLikeFromPayload(params.candidatePayload) ??
    (await deriveSnapshotLikeFromStaging(supabase));

  const candidateTraitSummary = deriveTraitSummaryFromStagingPages(
    candidateSnapshotLike.pages.map((p) => ({ slug: p.slug, payload_json: p.payload })),
    candidateSnapshotLike.avatarArtifactId,
    candidateSnapshotLike.embodimentDirection,
    candidateSnapshotLike.extensionIds
  );

  const publicTraitSummary =
    currentPublic?.trait_summary ??
    (currentPublic?.payload_json
      ? deriveTraitSummaryFromPayloadLike(currentPublic.payload_json)
      : null);

  const diff = compareCandidateToPublic(
    candidateSnapshotLike,
    candidateTraitSummary,
    currentPublic,
    publicTraitSummary,
    trajectory
  );

  const advisory_flags = deriveAdvisoryFlags(diff, trajectory);
  const { recommendation, notes } = derivePublishRecommendation(diff, advisory_flags, trajectory);

  return {
    identity_id: params.identityId,
    reviewed_at: new Date().toISOString(),
    diff,
    trajectory: {
      volatility_index: trajectory.volatility_index,
      recurring_avatar: trajectory.recurring_avatar,
      recurring_layout: trajectory.recurring_layout,
      reversion_detected: trajectory.reversion_detected,
      last_public_snapshot_id: trajectory.last_public_snapshot_id,
      interval_since_last_public_seconds: trajectory.interval_since_last_public_seconds,
    },
    advisory_flags,
    recommendation,
    recommendation_notes: notes,
  };
}

async function getCurrentPublicSnapshotForIdentity(
  supabase: SupabaseClient,
  identityId: string
): Promise<SnapshotFetchResult> {
  const { data, error } = await supabase
    .from("habitat_snapshot")
    .select("snapshot_id, created_at, trait_summary, payload_json")
    .eq("identity_id", identityId)
    .eq("snapshot_kind", "public")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { snapshot: null };
  }

  const row = data as {
    snapshot_id: string;
    created_at: string;
    trait_summary: TraitSummary | null;
    payload_json: unknown | null;
  };

  return {
    snapshot: {
      snapshot_id: row.snapshot_id,
      created_at: row.created_at,
      trait_summary: row.trait_summary,
      payload_json: row.payload_json,
    },
  };
}

function extractSnapshotLikeFromPayload(raw: unknown): SnapshotLikePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const pagesRaw = obj.habitat_pages;
  if (!Array.isArray(pagesRaw)) return null;

  const pages: Array<{ slug: string; payload: unknown }> = [];
  for (const p of pagesRaw) {
    if (!p || typeof p !== "object") continue;
    const pr = p as { slug?: unknown; payload?: unknown };
    const slug = typeof pr.slug === "string" && pr.slug.trim() ? pr.slug.trim() : null;
    if (!slug) continue;
    pages.push({ slug, payload: pr.payload });
  }

  const avatarState = (obj.avatar_state ?? null) as
    | { avatar_artifact_id?: unknown; embodiment_direction?: unknown }
    | null;
  const avatarArtifactId =
    avatarState && typeof avatarState.avatar_artifact_id === "string"
      ? avatarState.avatar_artifact_id
      : null;
  const embodimentDirection =
    avatarState && typeof avatarState.embodiment_direction === "string"
      ? avatarState.embodiment_direction
      : null;

  const extensionsRaw = obj.extensions;
  const extensionIds: string[] = [];
  if (Array.isArray(extensionsRaw)) {
    for (const ext of extensionsRaw) {
      if (typeof ext === "string") {
        extensionIds.push(ext);
      } else if (ext && typeof ext === "object") {
        const eo = ext as { id?: unknown; extension_id?: unknown; key?: unknown; name?: unknown };
        const idLike =
          (typeof eo.id === "string" && eo.id) ||
          (typeof eo.extension_id === "string" && eo.extension_id) ||
          (typeof eo.key === "string" && eo.key) ||
          (typeof eo.name === "string" && eo.name);
        if (idLike) extensionIds.push(idLike);
      }
    }
  }

  return {
    pages,
    avatarArtifactId,
    embodimentDirection,
    extensionIds,
  };
}

async function deriveSnapshotLikeFromStaging(
  supabase: SupabaseClient
): Promise<SnapshotLikePayload> {
  const { data: stagingRows } = await supabase
    .from("staging_habitat_content")
    .select("slug, payload_json")
    .order("slug");

  const rows = (stagingRows ?? []) as Array<{ slug: string; payload_json: unknown }>;

  const { data: ident } = await supabase
    .from("identity")
    .select("active_avatar_artifact_id, embodiment_direction")
    .eq("is_active", true)
    .maybeSingle();

  const avatarArtifactId =
    (ident as { active_avatar_artifact_id?: string } | null)?.active_avatar_artifact_id ?? null;
  const embodimentDirection =
    (ident as { embodiment_direction?: string } | null)?.embodiment_direction ?? null;

  return {
    pages: rows.map((r) => ({ slug: r.slug, payload: r.payload_json })),
    avatarArtifactId,
    embodimentDirection,
    extensionIds: [],
  };
}

function deriveTraitSummaryFromPayloadLike(payload: unknown): TraitSummary {
  const snapshotLike = extractSnapshotLikeFromPayload(payload) ?? {
    pages: [],
    avatarArtifactId: null,
    embodimentDirection: null,
    extensionIds: [] as string[],
  };
  return deriveTraitSummaryFromStagingPages(
    snapshotLike.pages.map((p) => ({ slug: p.slug, payload_json: p.payload })),
    snapshotLike.avatarArtifactId,
    snapshotLike.embodimentDirection,
    snapshotLike.extensionIds
  );
}

function compareCandidateToPublic(
  candidate: SnapshotLikePayload,
  candidateTrait: TraitSummary,
  currentPublic: SnapshotForReview | null,
  publicTrait: TraitSummary | null,
  trajectory: TrajectorySummaryV1
): HabitatDiffSummary {
  const hasCurrent = Boolean(currentPublic && publicTrait);
  const currentPublicSnapshotId = currentPublic?.snapshot_id ?? null;

  if (!hasCurrent) {
    const totalBlocks = sumBlockProfile(candidateTrait.block_profile);
    const hasLayout = candidateTrait.layout_signature.slug_count > 0;
    const hasAvatar = !!candidateTrait.avatar.avatar_artifact_id;
    const hasExtensions = candidateTrait.extension_profile.length > 0;

    const anyChange = hasLayout || hasAvatar || totalBlocks > 0 || hasExtensions;
    const significance: PublishSignificance = anyChange ? "major" : "none";

    return {
      has_current_public: false,
      current_public_snapshot_id: currentPublicSnapshotId,
      avatar_changed: hasAvatar,
      recurring_avatar_match: false,
      layout_changed: hasLayout,
      recurring_layout_match: false,
      blocks_added: totalBlocks,
      blocks_removed: 0,
      blocks_changed: 0,
      extensions_changed: hasExtensions,
      significance,
    };
  }

  const publicTraitSafe = publicTrait as TraitSummary;

  const avatar_changed =
    (candidateTrait.avatar.avatar_artifact_id ?? null) !==
    (publicTraitSafe.avatar.avatar_artifact_id ?? null);

  const layout_changed =
    JSON.stringify(candidateTrait.layout_signature.slugs ?? []) !==
    JSON.stringify(publicTraitSafe.layout_signature.slugs ?? []);

  const candidateBlocks = flattenBlocks(candidate.pages);
  const publicBlocks = flattenBlocks(
    extractSnapshotLikeFromPayload(currentPublic?.payload_json ?? null)?.pages ?? []
  );
  const { added, removed, changed } = diffBlocksById(candidateBlocks, publicBlocks);

  const extensions_changed =
    JSON.stringify([...candidateTrait.extension_profile].sort()) !==
    JSON.stringify([...publicTraitSafe.extension_profile].sort());

  const significance = classifySignificance({
    avatar_changed,
    layout_changed,
    blocks_added: added,
    blocks_removed: removed,
    blocks_changed: changed,
    extensions_changed,
  });

  const recurring_avatar_match = !avatar_changed && trajectory.recurring_avatar;
  const recurring_layout_match = !layout_changed && trajectory.recurring_layout;

  return {
    has_current_public: true,
    current_public_snapshot_id: currentPublicSnapshotId,
    avatar_changed,
    recurring_avatar_match,
    layout_changed,
    recurring_layout_match,
    blocks_added: added,
    blocks_removed: removed,
    blocks_changed: changed,
    extensions_changed,
    significance,
  };
}

function sumBlockProfile(profile: TraitSummary["block_profile"]): number {
  return (
    profile.hero +
    profile.text +
    profile.artifact_grid +
    profile.artifact +
    profile.extension +
    profile.other
  );
}

interface FlatBlock {
  id: string;
  type: string;
  raw: unknown;
}

function flattenBlocks(
  pages: Array<{ slug: string; payload: unknown }>
): FlatBlock[] {
  const blocks: FlatBlock[] = [];
  for (const p of pages) {
    const payload = p.payload;
    if (!payload || typeof payload !== "object") continue;
    const obj = payload as { blocks?: unknown };
    if (!Array.isArray(obj.blocks)) continue;
    for (const b of obj.blocks) {
      if (!b || typeof b !== "object") continue;
      const bo = b as { id?: unknown; type?: unknown };
      const id = typeof bo.id === "string" ? bo.id : null;
      const type = typeof bo.type === "string" ? bo.type : "";
      if (!id) continue;
      blocks.push({ id, type, raw: b });
    }
  }
  return blocks;
}

function diffBlocksById(
  candidateBlocks: FlatBlock[],
  publicBlocks: FlatBlock[]
): { added: number; removed: number; changed: number } {
  const publicById = new Map<string, FlatBlock>();
  for (const b of publicBlocks) {
    publicById.set(b.id, b);
  }

  const candidateById = new Map<string, FlatBlock>();
  for (const b of candidateBlocks) {
    candidateById.set(b.id, b);
  }

  let added = 0;
  let removed = 0;
  let changed = 0;

  for (const [id, cb] of candidateById.entries()) {
    const pb = publicById.get(id);
    if (!pb) {
      added++;
      continue;
    }
    const same = JSON.stringify(cb.raw) === JSON.stringify(pb.raw);
    if (!same) changed++;
  }

  for (const id of publicById.keys()) {
    if (!candidateById.has(id)) {
      removed++;
    }
  }

  return { added, removed, changed };
}

interface SignificanceInput {
  avatar_changed: boolean;
  layout_changed: boolean;
  blocks_added: number;
  blocks_removed: number;
  blocks_changed: number;
  extensions_changed: boolean;
}

function classifySignificance(input: SignificanceInput): PublishSignificance {
  const {
    avatar_changed,
    layout_changed,
    blocks_added,
    blocks_removed,
    blocks_changed,
    extensions_changed,
  } = input;

  const anyBlocks = blocks_added > 0 || blocks_removed > 0 || blocks_changed > 0;
  const totalBlockDelta = blocks_added + blocks_removed + blocks_changed;

  if (
    !avatar_changed &&
    !layout_changed &&
    !anyBlocks &&
    !extensions_changed
  ) {
    return "none";
  }

  const largeBlockChange = totalBlockDelta >= 5;
  const avatarAndLayoutShift = avatar_changed && layout_changed;
  const meaningfulExtensionCluster = extensions_changed;

  if (largeBlockChange || avatarAndLayoutShift || meaningfulExtensionCluster) {
    return "major";
  }

  return "minor";
}

function deriveAdvisoryFlags(
  diff: HabitatDiffSummary,
  trajectory: TrajectorySummaryV1
): PublishAdvisoryFlags {
  const no_current_public = !diff.has_current_public;

  const likely_duplicate = !no_current_public && diff.significance === "none";

  const likely_reversion =
    !no_current_public &&
    trajectory.reversion_detected &&
    !diff.avatar_changed &&
    !diff.layout_changed;

  const high_recent_volatility =
    trajectory.volatility_index >= HIGH_VOLATILITY_THRESHOLD;

  const too_soon_since_last_public =
    trajectory.interval_since_last_public_seconds != null &&
    trajectory.interval_since_last_public_seconds < TOO_SOON_SECONDS;

  return {
    likely_duplicate,
    likely_reversion,
    high_recent_volatility,
    too_soon_since_last_public,
    no_current_public,
  };
}

function derivePublishRecommendation(
  diff: HabitatDiffSummary,
  flags: PublishAdvisoryFlags,
  trajectory: TrajectorySummaryV1
): { recommendation: PublishRecommendation; notes: string[] } {
  const notes: string[] = [];

  if (!diff.has_current_public) {
    notes.push("No current public snapshot found for identity; treating this as a first publish or bootstrap case.");
    return {
      recommendation: "publish_ok_but_review",
      notes,
    };
  }

  if (flags.likely_duplicate) {
    notes.push("Candidate habitat appears materially identical to current public snapshot.");
    return { recommendation: "likely_duplicate", notes };
  }

  if (flags.likely_reversion) {
    notes.push("Trajectory indicates a reversion pattern and candidate matches a prior recurring avatar/layout shape.");
    return { recommendation: "likely_reversion", notes };
  }

  if (
    flags.high_recent_volatility &&
    flags.too_soon_since_last_public &&
    diff.significance === "minor"
  ) {
    notes.push(
      `High recent volatility (${trajectory.volatility_index.toFixed(
        2
      )}) with short interval since last public and only minor diff; consider deferring for stability.`
    );
    return { recommendation: "defer_for_stability", notes };
  }

  if (diff.significance === "major" && !flags.high_recent_volatility) {
    notes.push("Substantial habitat change detected (major diff) without strong volatility warnings; recommend human review before publish.");
    return { recommendation: "publish_ok_but_review", notes };
  }

  if (diff.significance === "minor" && !flags.high_recent_volatility) {
    notes.push("Minor habitat change with low volatility; publish appears reasonable.");
    return { recommendation: "publish_ok", notes };
  }

  notes.push(
    "Defaulting to conservative advisory: changes detected under mixed trajectory signals; recommend human review before publish."
  );
  return { recommendation: "publish_ok_but_review", notes };
}

