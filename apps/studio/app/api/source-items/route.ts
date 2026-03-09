import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/source-items — list source items (identity seed / reference).
 * Query: type=identity_seed|reference (optional filter), limit (default 50).
 */
export async function GET(request: Request) {
  try {
    const authClient = await createClient().catch(() => null);
    if (authClient) {
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ source_items: [] });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);

    let query = supabase
      .from("source_item")
      .select("source_item_id, title, source_type, summary, content_text, content_uri, ingested_at, created_at")
      .order("ingested_at", { ascending: false })
      .limit(limit);

    if (type && ["identity_seed", "reference", "note", "prompt", "fragment", "upload"].includes(type)) {
      query = query.eq("source_type", type);
    }

    const { data: source_items, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ source_items: source_items ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/source-items — create one source item (identity seed / reference).
 * Body: { title, source_type, summary?, content_text? }
 */
export async function POST(request: Request) {
  try {
    const authClient = await createClient().catch(() => null);
    if (authClient) {
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const source_type = typeof body.source_type === "string" ? body.source_type.trim() : "reference";
    const summary = typeof body.summary === "string" ? body.summary.trim() || null : null;
    const content_text = typeof body.content_text === "string" ? body.content_text.trim() || null : null;

    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const allowedTypes = ["identity_seed", "reference", "note", "prompt", "fragment", "upload"];
    const finalType = allowedTypes.includes(source_type) ? source_type : "reference";

    const { data: row, error } = await supabase
      .from("source_item")
      .insert({
        title,
        source_type: finalType,
        summary,
        content_text,
        project_id: null,
        content_uri: null,
        origin_reference: null,
      })
      .select("source_item_id, title, source_type, summary, content_text, ingested_at, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ source_item: row });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
