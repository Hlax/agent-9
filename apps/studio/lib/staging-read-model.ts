import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Canonical, derived read model for grouped staging review.
 * This does NOT mutate any canonical records or staging tables; it only
 * aggregates existing rows into buckets for UI consumption.
 */

export type StagingLaneBucket =
  | "habitat"
  | "artifacts"
  | "critiques"
  | "extensions"
  | "system";

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
  proposal_state: string;
  bucket: StagingLaneBucket;
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

export interface StagingBuckets {
  habitat: {
    groups: HabitatGroup[];
  };
  artifacts: {
    proposals: StagingProposalView[];
  };
  critiques: {
    proposals: StagingProposalView[];
  };
  extensions: {
    proposals: StagingProposalView[];
  };
  system: {
    proposals: StagingProposalView[];
  };
}

export interface StagingReviewModel {
  buckets: StagingBuckets;
  totals: {
    proposals: number;
    habitatGroups: number;
    artifacts: number;
    critiques: number;
    extensions: number;
    system: number;
  };
}

/**
 * Pure helper: derive lane bucket from the canonical lane_type / role / target.
 */
export function classifyLaneBucket(input: {
  lane_type: string | null;
  proposal_role: string | null;
  target_type: string | null;
}): StagingLaneBucket {
  const lane = (input.lane_type ?? "").toLowerCase();
  const role = (input.proposal_role ?? "").toLowerCase();
  const targetType = (input.target_type ?? "").toLowerCase();

  if (lane === "artifact") {
    return "artifacts";
  }

  if (lane === "system") {
    return "system";
  }

  // Surface lane — further refine into habitat / critiques / extensions.
  if (role.includes("critique") || targetType === "critique") {
    return "critiques";
  }

  if (role.includes("extension") || targetType === "extension") {
    return "extensions";
  }

  // Default surface proposals (including habitat layout) go to the habitat bucket.
  return "habitat";
}

/**
 * Pure helper: compute grouped staging buckets from raw proposals and staging
 * pages. This is the core read model used by the API and UI.
 */
export function buildStagingBuckets(
  proposals: RawStagingProposal[],
  pages: RawStagingPage[]
): StagingReviewModel {
  const byProposalId = new Map<string, RawStagingProposal>();
  for (const p of proposals) {
    byProposalId.set(p.proposal_record_id, p);
  }

  const pageBySourceProposalId = new Map<string, RawStagingPage>();
  for (const page of pages) {
    if (page.source_proposal_id) {
      pageBySourceProposalId.set(page.source_proposal_id, page);
    }
  }

  const habitatGroupsBySlug = new Map<string, HabitatGroup>();
  const artifacts: StagingProposalView[] = [];
  const critiques: StagingProposalView[] = [];
  const extensions: StagingProposalView[] = [];
  const system: StagingProposalView[] = [];

  for (const raw of proposals) {
    const bucket = classifyLaneBucket({
      lane_type: raw.lane_type,
      proposal_role: raw.proposal_role,
      target_type: raw.target_type,
    });

    const stagingPage = pageBySourceProposalId.get(raw.proposal_record_id) ?? null;
    const stagingSlug = stagingPage?.slug ?? null;
    const stagingTitle = stagingPage?.title ?? null;

    const view: StagingProposalView = {
      id: raw.proposal_record_id,
      lane_type: raw.lane_type,
      proposal_state: raw.proposal_state,
      bucket,
      group_key: bucket === "habitat" ? stagingSlug ?? raw.target_surface ?? null : null,
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

    switch (bucket) {
      case "habitat": {
        const slug =
          view.group_key ??
          // Fallback grouping key when slug is unknown.
          `unmapped-${view.id}`;
        let group = habitatGroupsBySlug.get(slug);
        if (!group) {
          group = {
            slug,
            title: stagingTitle ?? view.title ?? slug,
            updated_at: stagingPage?.updated_at ?? view.updated_at ?? null,
            proposals: [],
          };
          habitatGroupsBySlug.set(slug, group);
        } else if (stagingPage?.updated_at) {
          // Keep the most recent updated_at for the group.
          if (!group.updated_at || group.updated_at < stagingPage.updated_at) {
            group.updated_at = stagingPage.updated_at;
          }
        }
        group.proposals.push(view);
        break;
      }
      case "artifacts":
        artifacts.push(view);
        break;
      case "critiques":
        critiques.push(view);
        break;
      case "extensions":
        extensions.push(view);
        break;
      case "system":
        system.push(view);
        break;
    }
  }

  const habitatGroups = Array.from(habitatGroupsBySlug.values()).sort((a, b) =>
    (a.slug ?? "").localeCompare(b.slug ?? "")
  );

  return {
    buckets: {
      habitat: { groups: habitatGroups },
      artifacts: { proposals: artifacts },
      critiques: { proposals: critiques },
      extensions: { proposals: extensions },
      system: { proposals: system },
    },
    totals: {
      proposals: proposals.length,
      habitatGroups: habitatGroups.length,
      artifacts: artifacts.length,
      critiques: critiques.length,
      extensions: extensions.length,
      system: system.length,
    },
  };
}

/**
 * DB-backed helper: load staging proposals + pages and build grouped buckets.
 * Kept thin so most behavior stays in the pure read model above.
 */
export async function getStagingReviewModel(
  supabase: SupabaseClient
): Promise<StagingReviewModel> {
  const [proposalRes, pageRes] = await Promise.all([
    supabase
      .from("proposal_record")
      .select(
        "proposal_record_id, lane_type, target_type, target_surface, proposal_role, proposal_type, title, summary, proposal_state, review_note, habitat_payload_json, artifact_id, created_at, updated_at"
      )
      // Exclude terminal states; staging review is focused on active proposals.
      .not("proposal_state", "in", ["archived", "rejected", "ignored", "published"])
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("staging_habitat_content")
      .select("slug, title, payload_json, source_proposal_id, updated_at"),
  ]);

  const proposals = (proposalRes.data ?? []) as RawStagingProposal[];
  const pages = (pageRes.data ?? []) as RawStagingPage[];

  return buildStagingBuckets(proposals, pages);
}

