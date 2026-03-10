/**
 * Rule-based retrieval of source items for session context (identity seed / reference).
 * Canon: docs/05_build/identity_seed_ingestion.md — simple, controlled retrieval.
 */

import type { getSupabaseServer } from "@/lib/supabase-server";

/** Use the same client type as the server so generics align. */
type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseServer>>;

const SOURCE_TYPES_FOR_CONTEXT = ["identity_seed", "reference"] as const;
const MAX_ITEMS = 15;
const MAX_TEXT_PER_ITEM = 2000;

type SourceRow = {
  title?: string | null;
  source_type?: string | null;
  source_role?: string | null;
  identity_weight?: number | null;
  summary?: string | null;
  content_text?: string | null;
  extracted_text?: string | null;
  transcript_text?: string | null;
  tags?: string[] | null;
  ontology_notes?: string | null;
  identity_relevance_notes?: string | null;
  general_notes?: string | null;
};

export async function getSourceContextForSession(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data: rows, error } = await supabase
    .from("source_item")
    .select("title, source_type, source_role, identity_weight, summary, content_text, extracted_text, transcript_text, tags, ontology_notes, identity_relevance_notes, general_notes")
    .in("source_type", [...SOURCE_TYPES_FOR_CONTEXT])
    .order("identity_weight", { ascending: false, nullsFirst: false })
    .order("ingested_at", { ascending: false })
    .limit(MAX_ITEMS);

  if (error || !rows?.length) {
    return null;
  }

  const parts = rows.map((row: SourceRow) => {
    const title = row.title?.trim() || "Untitled";
    const type = row.source_type || "reference";
    const role = row.source_role?.trim() ? ` role=${row.source_role}` : "";
    const weight = row.identity_weight != null ? ` weight=${row.identity_weight}` : "";
    const summary = row.summary?.trim();
    const text = row.content_text?.trim();
    const extracted = row.extracted_text?.trim();
    const transcript = row.transcript_text?.trim();
    const tags = row.tags?.length ? ` Tags: ${row.tags.join(", ")}.` : "";
    const ontology = row.ontology_notes?.trim() ? ` Ontology: ${row.ontology_notes.slice(0, 300)}.` : "";
    const relevance = row.identity_relevance_notes?.trim() ? ` Relevance: ${row.identity_relevance_notes.slice(0, 300)}.` : "";
    const general = row.general_notes?.trim() ? ` Notes: ${row.general_notes.slice(0, 300)}.` : "";
    const content = [summary, text, extracted, transcript].filter(Boolean).join("\n").slice(0, MAX_TEXT_PER_ITEM);
    const notes = [tags, ontology, relevance, general].filter(Boolean).join("");
    return `[${type}${role}${weight}] ${title}\n${content}${notes ? `\n${notes}` : ""}`;
  });

  return parts.join("\n\n---\n\n");
}
