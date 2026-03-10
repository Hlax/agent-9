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

    const selectFields = "source_item_id, title, source_type, source_role, summary, content_text, content_uri, ingested_at, created_at, tags, ontology_notes, identity_relevance_notes, general_notes, media_kind, mime_type, preview_uri, extracted_text, transcript_text, identity_weight, origin_reference";
    let query = supabase
      .from("source_item")
      .select(selectFields)
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

/** Optional fields for create/update. Source-items never touch identity table. */
function parseOptionalBody(body: Record<string, unknown>) {
  const str = (key: string) => (typeof body[key] === "string" ? (body[key] as string).trim() || null : null);
  const num = (key: string) => (typeof body[key] === "number" && Number.isFinite(body[key]) ? (body[key] as number) : null);
  const arr = (key: string) => (Array.isArray(body[key]) ? (body[key] as string[]).filter((x) => typeof x === "string") : null);
  return {
    title: str("title"),
    source_type: str("source_type"),
    source_role: str("source_role"),
    summary: str("summary"),
    content_text: str("content_text"),
    content_uri: str("content_uri"),
    origin_reference: str("origin_reference"),
    tags: arr("tags"),
    ontology_notes: str("ontology_notes"),
    identity_relevance_notes: str("identity_relevance_notes"),
    general_notes: str("general_notes"),
    media_kind: str("media_kind"),
    mime_type: str("mime_type"),
    preview_uri: str("preview_uri"),
    extracted_text: str("extracted_text"),
    transcript_text: str("transcript_text"),
    identity_weight: num("identity_weight"),
  };
}

/**
 * POST /api/source-items — create one source item. Never creates or updates identity.
 * Body: title (required), source_type?, source_role?, summary?, content_text?, content_uri?, origin_reference?,
 *       tags?, ontology_notes?, identity_relevance_notes?, general_notes?, media_kind?, mime_type?, preview_uri?,
 *       extracted_text?, transcript_text?, identity_weight?
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

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const p = parseOptionalBody(body);
    const title = p.title ?? "";
    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const allowedTypes = ["identity_seed", "reference", "note", "prompt", "fragment", "upload"];
    const finalType = p.source_type && allowedTypes.includes(p.source_type) ? p.source_type : "reference";

    const insert: Record<string, unknown> = {
      title,
      source_type: finalType,
      project_id: null,
      summary: p.summary ?? null,
      content_text: p.content_text ?? null,
      content_uri: p.content_uri ?? null,
      origin_reference: p.origin_reference ?? null,
      source_role: p.source_role ?? null,
      tags: p.tags ?? null,
      ontology_notes: p.ontology_notes ?? null,
      identity_relevance_notes: p.identity_relevance_notes ?? null,
      general_notes: p.general_notes ?? null,
      media_kind: p.media_kind ?? null,
      mime_type: p.mime_type ?? null,
      preview_uri: p.preview_uri ?? null,
      extracted_text: p.extracted_text ?? null,
      transcript_text: p.transcript_text ?? null,
      identity_weight: p.identity_weight ?? null,
    };

    const { data: row, error } = await supabase
      .from("source_item")
      .insert(insert)
      .select()
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
