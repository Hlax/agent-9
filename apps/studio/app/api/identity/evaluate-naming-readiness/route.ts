import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { evaluateNamingReadiness } from "@/lib/naming-readiness";

/**
 * POST /api/identity/evaluate-naming-readiness
 * Runs the naming readiness evaluator and writes score/notes/last_naming_evaluated_at to the active identity.
 */
export async function POST() {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    const { score, notes } = await evaluateNamingReadiness(supabase);
    const now = new Date().toISOString();

    const { data: identRow } = await supabase
      .from("identity")
      .select("identity_id")
      .eq("is_active", true)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (identRow?.identity_id) {
      await supabase
        .from("identity")
        .update({
          naming_readiness_score: score,
          naming_readiness_notes: notes,
          last_naming_evaluated_at: now,
          updated_at: now,
        })
        .eq("identity_id", identRow.identity_id);
    }

    return NextResponse.json({ score, notes });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Evaluation failed" },
      { status: 500 }
    );
  }
}
