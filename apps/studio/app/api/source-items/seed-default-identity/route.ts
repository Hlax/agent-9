import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * POST /api/source-items/seed-default-identity — one-time seed of personality + taste as two identity_seed source items.
 * Body: { personalityMarkdown?: string, tasteMarkdown?: string }.
 * Creates at most two items; never touches identity. Use then run bootstrap from Identity page.
 */
export async function POST(request: Request) {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const personalityMarkdown = typeof body.personalityMarkdown === "string" ? body.personalityMarkdown.trim() : "";
    const tasteMarkdown = typeof body.tasteMarkdown === "string" ? body.tasteMarkdown.trim() : "";

    if (!personalityMarkdown && !tasteMarkdown) {
      return NextResponse.json(
        { error: "Provide at least one of personalityMarkdown or tasteMarkdown" },
        { status: 400 }
      );
    }

    const created: unknown[] = [];

    if (personalityMarkdown) {
      const { data: row, error } = await supabase
        .from("source_item")
        .insert({
          title: "Harvey identity seed (personality)",
          source_type: "identity_seed",
          source_role: "identity_seed",
          content_text: personalityMarkdown.slice(0, 500000),
          project_id: null,
          summary: null,
          content_uri: null,
          origin_reference: null,
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      created.push(row);
    }

    if (tasteMarkdown) {
      const { data: row, error } = await supabase
        .from("source_item")
        .insert({
          title: "Harvey taste profile",
          source_type: "identity_seed",
          source_role: "identity_seed",
          content_text: tasteMarkdown.slice(0, 500000),
          project_id: null,
          summary: null,
          content_uri: null,
          origin_reference: null,
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      created.push(row);
    }

    return NextResponse.json({ source_items: created, count: created.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Seed failed" },
      { status: 500 }
    );
  }
}
