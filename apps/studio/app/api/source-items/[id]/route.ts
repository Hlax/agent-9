import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/** Optional fields for update. Updating a source item must never create or update identity. */
function parseOptionalBody(body: Record<string, unknown>) {
  const str = (key: string) => (typeof body[key] === "string" ? (body[key] as string).trim() || null : undefined);
  const num = (key: string) => (typeof body[key] === "number" && Number.isFinite(body[key]) ? (body[key] as number) : undefined);
  const arr = (key: string) => (Array.isArray(body[key]) ? (body[key] as string[]).filter((x) => typeof x === "string") : undefined);
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
 * PATCH /api/source-items/[id] — update a source item (e.g. annotations). Never touches identity.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const p = parseOptionalBody(body);
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (p.title !== undefined) updates.title = p.title;
    if (p.source_type !== undefined) updates.source_type = p.source_type;
    if (p.source_role !== undefined) updates.source_role = p.source_role;
    if (p.summary !== undefined) updates.summary = p.summary;
    if (p.content_text !== undefined) updates.content_text = p.content_text;
    if (p.content_uri !== undefined) updates.content_uri = p.content_uri;
    if (p.origin_reference !== undefined) updates.origin_reference = p.origin_reference;
    if (p.tags !== undefined) updates.tags = p.tags;
    if (p.ontology_notes !== undefined) updates.ontology_notes = p.ontology_notes;
    if (p.identity_relevance_notes !== undefined) updates.identity_relevance_notes = p.identity_relevance_notes;
    if (p.general_notes !== undefined) updates.general_notes = p.general_notes;
    if (p.media_kind !== undefined) updates.media_kind = p.media_kind;
    if (p.mime_type !== undefined) updates.mime_type = p.mime_type;
    if (p.preview_uri !== undefined) updates.preview_uri = p.preview_uri;
    if (p.extracted_text !== undefined) updates.extracted_text = p.extracted_text;
    if (p.transcript_text !== undefined) updates.transcript_text = p.transcript_text;
    if (p.identity_weight !== undefined) updates.identity_weight = p.identity_weight;

    const { data, error } = await supabase
      .from("source_item")
      .update(updates)
      .eq("source_item_id", id)
      .select()
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: error.code === "PGRST116" ? 404 : 500 });
    }
    return NextResponse.json({ source_item: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
