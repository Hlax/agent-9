import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { promoteStagingToPublic } from "@/lib/staging-composition";

/**
 * POST /api/staging/promote — push current staging composition to public (human-only).
 * Copies staging_habitat_content → public_habitat_content and records promotion.
 * No runner or Twin self-publish; auth required.
 */
export async function POST() {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    const promotedBy = user.email ?? user.id ?? "operator";
    const result = await promoteStagingToPublic(supabase, promotedBy);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      promotion_id: result.promotionId,
      slugs_updated: result.slugsUpdated,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
