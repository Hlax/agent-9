/**
 * Identity trajectory summary — derived ON READ only. Canon: docs/05_build/SNAPSHOT_LINEAGE_IDENTITY_TRAJECTORY_V1.md §3.
 * No trajectory_history table; no materialized trajectory. May warn/defer in policy; must not hard-block by itself.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_LAST_N = 10;

export interface TrajectorySummaryV1 {
  snapshot_ids_considered: string[];
  volatility_index: number;
  recurring_avatar: boolean;
  recurring_layout: boolean;
  reversion_detected: boolean;
  last_public_snapshot_id: string | null;
  interval_since_last_public_seconds: number | null;
}

interface SnapshotRow {
  snapshot_id: string;
  snapshot_kind: string;
  created_at: string;
  trait_summary: {
    avatar?: { avatar_artifact_id?: string | null };
    layout_signature?: { slugs?: string[] };
  } | null;
}

/**
 * Get trajectory summary for an identity from the last N snapshots (identity-scoped).
 * Trajectory is always derived from snapshot rows; never stored as a table.
 */
export async function getTrajectorySummary(
  supabase: SupabaseClient,
  identityId: string,
  lastN: number = DEFAULT_LAST_N
): Promise<TrajectorySummaryV1> {
  const { data: snapshots, error } = await supabase
    .from("habitat_snapshot")
    .select("snapshot_id, snapshot_kind, created_at, trait_summary")
    .eq("identity_id", identityId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, lastN));

  if (error || !Array.isArray(snapshots) || snapshots.length === 0) {
    return {
      snapshot_ids_considered: [],
      volatility_index: 0,
      recurring_avatar: false,
      recurring_layout: false,
      reversion_detected: false,
      last_public_snapshot_id: null,
      interval_since_last_public_seconds: null,
    };
  }

  const rows = snapshots as SnapshotRow[];
  const ids = rows.map((r) => r.snapshot_id);
  const publicSnapshots = rows.filter((r) => r.snapshot_kind === "public");
  const lastPublic = publicSnapshots[0] ?? null;
  const lastPublicId = lastPublic?.snapshot_id ?? null;
  const lastPublicAt = lastPublic?.created_at ? new Date(lastPublic.created_at).getTime() : null;
  const now = Date.now();
  const interval_since_last_public_seconds =
    lastPublicAt != null ? (now - lastPublicAt) / 1000 : null;

  // Volatility: share of consecutive pairs (by created_at order) with different layout or avatar
  const ordered = [...rows].reverse();
  let changes = 0;
  let pairs = 0;
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const curr = ordered[i];
    if (!prev || !curr) continue;
    const a = prev.trait_summary;
    const b = curr.trait_summary;
    const layoutA = JSON.stringify(a?.layout_signature?.slugs ?? []);
    const layoutB = JSON.stringify(b?.layout_signature?.slugs ?? []);
    const avatarA = a?.avatar?.avatar_artifact_id ?? null;
    const avatarB = b?.avatar?.avatar_artifact_id ?? null;
    if (layoutA !== layoutB || avatarA !== avatarB) changes++;
    pairs++;
  }
  const volatility_index = pairs > 0 ? changes / pairs : 0;

  // Recurring: same avatar or same layout appears in more than one snapshot
  const avatarIds = new Set(
    rows.map((r) => r.trait_summary?.avatar?.avatar_artifact_id).filter(Boolean)
  );
  const layoutSigs = new Set(
    rows.map((r) => JSON.stringify(r.trait_summary?.layout_signature?.slugs ?? []))
  );
  const recurring_avatar = avatarIds.size >= 1 && rows.some((r) => r.trait_summary?.avatar?.avatar_artifact_id);
  const recurring_layout = layoutSigs.size >= 1 && rows.length >= 2;

  // Reversion: trait reverted to an earlier value (e.g. avatar A -> B -> A)
  let reversion_detected = false;
  const seenAvatarIds = new Set<string>();
  let prevAvatar: string | null = null;
  for (const r of ordered) {
    const aid = r.trait_summary?.avatar?.avatar_artifact_id ?? null;
    if (aid != null) {
      if (seenAvatarIds.has(aid) && prevAvatar != null && prevAvatar !== aid) {
        reversion_detected = true;
        break;
      }
      seenAvatarIds.add(aid);
    }
    prevAvatar = aid;
  }

  return {
    snapshot_ids_considered: ids,
    volatility_index,
    recurring_avatar,
    recurring_layout,
    reversion_detected,
    last_public_snapshot_id: lastPublicId,
    interval_since_last_public_seconds,
  };
}
