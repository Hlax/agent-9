/**
 * GET /api/staging/trajectory — identity-scoped trajectory summary (derived on read).
 * Canon: docs/05_build/SNAPSHOT_LINEAGE_IDENTITY_TRAJECTORY_V1.md §3.
 * Query: identity_id (required), last_n (optional, default 10).
 * Used for publish stability (warn/defer only) and observability; no hard block.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getActiveIdentityId } from "@/lib/staging-composition";
import { getTrajectorySummary } from "@/lib/habitat-trajectory";

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    const { searchParams } = new URL(request.url);
    let identityId = searchParams.get("identity_id");
    if (!identityId) {
      identityId = await getActiveIdentityId(supabase);
      if (!identityId) return NextResponse.json({ error: "No active identity" }, { status: 404 });
    }
    const lastN = Math.min(20, Math.max(1, parseInt(searchParams.get("last_n") ?? "10", 10) || 10));

    const summary = await getTrajectorySummary(supabase, identityId, lastN);
    return NextResponse.json({ identity_id: identityId, last_n: lastN, trajectory: summary });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
