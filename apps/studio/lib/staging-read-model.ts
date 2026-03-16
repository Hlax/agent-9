import type { SupabaseClient } from "@supabase/supabase-js";
import { dbLaneToCanon, STAGEABLE_CANON_LANES, type LaneType, type CanonLaneId } from "@/lib/canon";

/**
 * Canonical, derived read model for grouped staging review.
 * Agent-9: buckets by canon lane_id; labels/descriptions from canon lane_map (injected by API).
 * Stageable lanes from canon (STAGEABLE_CANON_LANES); no lane_type === "surface" filtering.
 * Legacy StagingBuckets / classifyLaneBucket retained for backward compat only; prefer lanes keyed by lane_id.
 */

/** @deprecated Use lane_id. Legacy Twin bucket; retained for backward compat only. */
export type StagingLaneBucket =
  | "habitat"
  | "artifacts"
  | "critiques"
  | "extensions"
  | "system";

/** Derive canon lane_id from DB lane_type. */
export function deriveCanonLaneId(laneType: string | null): CanonLaneId {
  if (!laneType) return "build_lane";
  const t = laneType.toLowerCase() as LaneType;
  if (t !== "surface" && t !== "medium" && t !== "system") return "build_lane";
  return dbLaneToCanon(t);
}

/** Whether a canon lane_id is stageable (can transition to staging/public). */
export function isStageableCanonLane(laneId: string): boolean {
  return STAGEABLE_CANON_LANES.includes(laneId as CanonLaneId);
}

export interface RawStagingProposal {
  proposal_record_id: string;
  lane_type: string | null;
  target_type: string | null;
  target_surface: string | null;
  proposal_role: string | null;
  proposal_type: string | null;
  title: string | null;
  summary: string | null;
  proposal_state: string;
  review_note: string | null;
  habitat_payload_json: unknown;
  artifact_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  /**
   * Allowed reviewer actions derived from the proposal FSM / governance layer.
   * This is populated by the API layer; the pure read model treats it as
   * opaque metadata.
   */
  allowed_actions?: string[];
}

export interface RawStagingPage {
  slug: string;
  title: string | null;
  payload_json: unknown;
  source_proposal_id: string | null;
  updated_at: string | null;
}

export interface StagingProposalView {
  id: string;
  lane_type: string | null;
  /** Canon lane_id derived from lane_type. */
  lane_id: CanonLaneId;
  proposal_state: string;
  /** @deprecated Use lane_id. Set only by legacy adapter. */
  bucket?: StagingLaneBucket;
  group_key: string | null;
  title: string | null;
  summary: string | null;
  target_surface: string | null;
  proposal_role: string | null;
  proposal_type: string | null;
  target_type: string | null;
  artifact_id: string | null;
  review_note: string | null;
  created_at: string | null;
  updated_at: string | null;
  staging_slug: string | null;
  staging_title: string | null;
  allowed_actions: string[];
}

export interface HabitatGroup {
  slug: string;
  title: string | null;
  updated_at: string | null;
  proposals: StagingProposalView[];
}

/** Canon-native: buckets keyed by canon lane_id. Core structure; no Twin bucket semantics. */
export interface LanesBuckets {
  [lane_id: string]: {
    label?: string;
    description?: string;
    proposals: StagingProposalView[];
    /** For build_lane: layout groups by staging slug. */
    groups?: HabitatGroup[];
  };
}

/** Lane-native staging model only (no legacy buckets). Core read model output. */
export interface LaneNativeStagingModel {
  lanes: LanesBuckets;
  totals: { proposals: number; byLane: Record<string, number> };
}

/** @deprecated Use lanes. Legacy Twin buckets; retained for backward compat. */
export interface StagingBuckets {
  habitat: { groups: HabitatGroup[] };
  artifacts: { proposals: StagingProposalView[] };
  critiques: { proposals: StagingProposalView[] };
  extensions: { proposals: StagingProposalView[] };
  system: { proposals: StagingProposalView[] };
}

export interface StagingReviewModel {
  /** Canon-native: proposals grouped by lane_id; labels from lane_map when provided. */
  lanes: LanesBuckets;
  totals: {
    proposals: number;
    byLane: Record<string, number>;
    /** @deprecated Use byLane. */
    habitatGroups: number;
    artifacts: number;
    critiques: number;
    extensions: number;
    system: number;
  };
  /** @deprecated Use lanes. Legacy shape for backward compat. */
  buckets: StagingBuckets;
}

/**
 * @deprecated Use deriveCanonLaneId. Legacy Twin bucket for backward compat.
 */
export function classifyLaneBucket(input: {
  lane_type: string | null;
  proposal_role: string | null;
  target_type: string | null;
}): StagingLaneBucket {
  const laneId = deriveCanonLaneId(input.lane_type);
  if (laneId === "system_lane") return "system";
  if (laneId === "audit_lane") {
    const role = (input.proposal_role ?? "").toLowerCase();
    const targetType = (input.target_type ?? "").toLowerCase();
    if (role.includes("critique") || targetType === "critique") return "critiques";
    return "extensions";
  }
  if (laneId === "build_lane" || laneId === "promotion_lane") {
    const role = (input.proposal_role ?? "").toLowerCase();
    const targetType = (input.target_type ?? "").toLowerCase();
    if (role.includes("critique") || targetType === "critique") return "critiques";
    if (role.includes("extension") || targetType === "extension" || targetType === "integration") return "extensions";
    return "habitat";
  }
  return "habitat";
}

/**
 * Core: build lane-native staging model only (canon lane_id, labels from lane_map).
 * No legacy Twin bucket semantics; use toLegacyStagingBuckets at the edge if needed.
 */
export function buildStagingBucketsLaneOnly(
  proposals: RawStagingProposal[],
  pages: RawStagingPage[],
  options?: { laneMap?: { lanes: Array<{ lane_id: string; label?: string; description?: string }> } }
): LaneNativeStagingModel {
  const pageBySourceProposalId = new Map<string, RawStagingPage>();
  for (const page of pages) {
    if (page.source_proposal_id) {
      pageBySourceProposalId.set(page.source_proposal_id, page);
    }
  }

  const lanes: LanesBuckets = {};
  const habitatGroupsBySlug = new Map<string, HabitatGroup>();

  for (const raw of proposals) {
    const lane_id = deriveCanonLaneId(raw.lane_type);
    const stagingPage = pageBySourceProposalId.get(raw.proposal_record_id) ?? null;
    const stagingSlug = stagingPage?.slug ?? null;
    const stagingTitle = stagingPage?.title ?? null;
    const group_key =
      lane_id === "build_lane" ? stagingSlug ?? raw.target_surface ?? null : null;

    const view: StagingProposalView = {
      id: raw.proposal_record_id,
      lane_type: raw.lane_type,
      lane_id,
      proposal_state: raw.proposal_state,
      group_key,
      title: raw.title,
      summary: raw.summary,
      target_surface: raw.target_surface,
      proposal_role: raw.proposal_role,
      proposal_type: raw.proposal_type,
      target_type: raw.target_type,
      artifact_id: raw.artifact_id,
      review_note: raw.review_note,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
      staging_slug: stagingSlug,
      staging_title: stagingTitle,
      allowed_actions: raw.allowed_actions ?? [],
    };

    if (!lanes[lane_id]) {
      const entry = options?.laneMap?.lanes.find((l) => l.lane_id === lane_id);
      lanes[lane_id] = {
        label: entry?.label,
        description: entry?.description,
        proposals: [],
      };
    }
    lanes[lane_id].proposals.push(view);

    if (lane_id === "build_lane" && (group_key || raw.target_surface === "staging_habitat")) {
      const slug = group_key ?? raw.target_surface ?? `unmapped-${view.id}`;
      let group = habitatGroupsBySlug.get(slug);
      if (!group) {
        group = {
          slug,
          title: stagingTitle ?? view.title ?? slug,
          updated_at: stagingPage?.updated_at ?? view.updated_at ?? null,
          proposals: [],
        };
        habitatGroupsBySlug.set(slug, group);
      } else if (stagingPage?.updated_at && (!group.updated_at || group.updated_at < stagingPage.updated_at)) {
        group.updated_at = stagingPage.updated_at;
      }
      group.proposals.push(view);
    }
  }

  const habitatGroups = Array.from(habitatGroupsBySlug.values()).sort((a, b) =>
    (a.slug ?? "").localeCompare(b.slug ?? "")
  );
  if (lanes["build_lane"]) {
    lanes["build_lane"].groups = habitatGroups;
  }

  const byLane: Record<string, number> = {};
  for (const [lid, data] of Object.entries(lanes)) {
    byLane[lid] = data.proposals.length;
  }

  return { lanes, totals: { proposals: proposals.length, byLane } };
}

/**
 * Legacy adapter: project lane-native model to Twin bucket shape for backward compat.
 * Use at API edge only; core read model is lane-native only.
 */
export function toLegacyStagingBuckets(laneNative: LaneNativeStagingModel): {
  buckets: StagingBuckets;
  totalsLegacy: { habitatGroups: number; artifacts: number; critiques: number; extensions: number; system: number };
} {
  const artifacts: StagingProposalView[] = [];
  const critiques: StagingProposalView[] = [];
  const extensions: StagingProposalView[] = [];
  const system: StagingProposalView[] = [];
  const habitatGroups: HabitatGroup[] = [];

  for (const [laneId, data] of Object.entries(laneNative.lanes)) {
    if (laneId === "build_lane" && data.groups) {
      habitatGroups.push(...data.groups);
    }
    for (const v of data.proposals ?? []) {
      const bucket = classifyLaneBucket({
        lane_type: v.lane_type,
        proposal_role: v.proposal_role,
        target_type: v.target_type,
      });
      (v as StagingProposalView & { bucket: StagingLaneBucket }).bucket = bucket;
      switch (bucket) {
        case "artifacts":
          artifacts.push(v);
          break;
        case "critiques":
          critiques.push(v);
          break;
        case "extensions":
          extensions.push(v);
          break;
        case "system":
          system.push(v);
          break;
        default:
          break;
      }
    }
  }
  const dedupedGroups = Array.from(new Map(habitatGroups.map((g) => [g.slug, g])).values()).sort((a, b) =>
    (a.slug ?? "").localeCompare(b.slug ?? "")
  );

  return {
    buckets: {
      habitat: { groups: dedupedGroups },
      artifacts: { proposals: artifacts },
      critiques: { proposals: critiques },
      extensions: { proposals: extensions },
      system: { proposals: system },
    },
    totalsLegacy: {
      habitatGroups: dedupedGroups.length,
      artifacts: artifacts.length,
      critiques: critiques.length,
      extensions: extensions.length,
      system: system.length,
    },
  };
}

/** Build full StagingReviewModel (lane-native + legacy buckets) for backward-compat API. Prefer buildStagingBucketsLaneOnly + toLegacyStagingBuckets at edge. */
export function buildStagingBuckets(
  proposals: RawStagingProposal[],
  pages: RawStagingPage[],
  options?: { laneMap?: { lanes: Array<{ lane_id: string; label?: string; description?: string }> } }
): StagingReviewModel {
  const laneNative = buildStagingBucketsLaneOnly(proposals, pages, options);
  const { buckets, totalsLegacy } = toLegacyStagingBuckets(laneNative);
  return {
    lanes: laneNative.lanes,
    totals: {
      ...laneNative.totals,
      ...totalsLegacy,
    },
    buckets,
  };
}

/**
 * DB-backed helper: load staging proposals + pages and build grouped buckets by canon lane_id.
 * Injects lane labels from canon. Optionally filter to stageable lanes only.
 */
export async function getStagingReviewModel(
  supabase: SupabaseClient,
  options?: { stageableOnly?: boolean }
): Promise<StagingReviewModel> {
  const [proposalRes, pageRes] = await Promise.all([
    supabase
      .from("proposal_record")
      .select(
        "proposal_record_id, lane_type, target_type, target_surface, proposal_role, proposal_type, title, summary, proposal_state, review_note, habitat_payload_json, artifact_id, created_at, updated_at"
      )
      .not("proposal_state", "in", ["archived", "rejected", "ignored", "published"])
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("staging_habitat_content")
      .select("slug, title, payload_json, source_proposal_id, updated_at"),
  ]);

  let proposals = (proposalRes.data ?? []) as RawStagingProposal[];
  if (options?.stageableOnly) {
    proposals = proposals.filter((p) => isStageableCanonLane(deriveCanonLaneId(p.lane_type)));
  }

  const pages = (pageRes.data ?? []) as RawStagingPage[];
  const { getLaneMap } = await import("@/lib/canon");
  const laneMap = getLaneMap();

  return buildStagingBuckets(proposals, pages, { laneMap });
}

