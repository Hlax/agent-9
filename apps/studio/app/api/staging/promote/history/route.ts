import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * GET /api/staging/promote/history — list recent habitat promotions (audit).
 * Auth required.
 */
export async function GET() {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ promotions: [] });

    const { data, error } = await supabase
      .from("habitat_promotion_record")
      .select("id, promoted_at, promoted_by, slugs_updated")
      .order("promoted_at", { ascending: false })
      .limit(20);

    if (error) return NextResponse.json({ promotions: [], error: error.message }, { status: 500 });
    return NextResponse.json({ promotions: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { promotions: [], error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
