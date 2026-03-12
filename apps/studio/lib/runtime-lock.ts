/**
 * Runtime lock (lease) for cron session runner.
 * Prevents overlapping runs when multiple cron triggers fire; lock auto-expires via locked_until.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const LOCK_ID = "default";

/** Lease duration in minutes. Lock auto-expires so a crashed runner does not block forever. */
export const LOCK_LEASE_MINUTES = 2;

export interface LockResult {
  acquired: boolean;
  ownerId?: string;
}

/**
 * Try to acquire the runtime lock. Only one row exists; we claim it if locked_until <= now.
 * Sets locked_until = now() + lease, owner_id = ownerId.
 */
export async function tryAcquireRuntimeLock(
  supabase: SupabaseClient | null,
  ownerId: string,
  leaseMinutes: number = LOCK_LEASE_MINUTES
): Promise<LockResult> {
  if (!supabase) return { acquired: false };

  const now = new Date().toISOString();
  const lockedUntil = new Date(Date.now() + leaseMinutes * 60 * 1000).toISOString();

  const { data: row, error: fetchError } = await supabase
    .from("runtime_lock")
    .select("lock_id, locked_until, owner_id")
    .eq("lock_id", LOCK_ID)
    .maybeSingle();

  if (fetchError) {
    console.error("[runtime-lock] fetch error", { error: fetchError.message });
    return { acquired: false };
  }

  const existingUntil = row?.locked_until ? new Date(row.locked_until as string).getTime() : 0;
  if (existingUntil > Date.now()) {
    console.log("[runtime-lock] lock held by another runner", {
      locked_until: row?.locked_until,
      owner_id: row?.owner_id,
    });
    return { acquired: false, ownerId: (row?.owner_id as string) ?? undefined };
  }

  // Atomic claim: only update if lock is still expired (avoids race when multiple crons wake).
  const { data: updated, error: updateError } = await supabase
    .from("runtime_lock")
    .update({
      locked_until: lockedUntil,
      owner_id: ownerId,
      updated_at: now,
    })
    .eq("lock_id", LOCK_ID)
    .lte("locked_until", now)
    .select("lock_id")
    .maybeSingle();

  if (updateError || !updated) {
    if (updateError) {
      console.error("[runtime-lock] update (claim) error", { error: updateError.message });
    } else {
      console.log("[runtime-lock] lock lost to another runner (race)");
    }
    return { acquired: false };
  }

  console.log("[runtime-lock] lock acquired", { owner_id: ownerId, locked_until: lockedUntil });
  return { acquired: true, ownerId };
}

/**
 * Release the runtime lock by setting locked_until = now() so the next wake can claim.
 */
export async function releaseRuntimeLock(supabase: SupabaseClient | null): Promise<void> {
  if (!supabase) return;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("runtime_lock")
    .update({ locked_until: now, updated_at: now })
    .eq("lock_id", LOCK_ID);

  if (error) {
    console.error("[runtime-lock] release error", { error: error.message });
    return;
  }
  console.log("[runtime-lock] lock released");
}
