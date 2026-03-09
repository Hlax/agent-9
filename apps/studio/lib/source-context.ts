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

export async function getSourceContextForSession(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data: rows, error } = await supabase
    .from("source_item")
    .select("title, source_type, summary, content_text")
    .in("source_type", [...SOURCE_TYPES_FOR_CONTEXT])
    .order("ingested_at", { ascending: false })
    .limit(MAX_ITEMS);

  if (error || !rows?.length) {
    return null;
  }

  const parts = rows.map((row: { title?: string; source_type?: string; summary?: string | null; content_text?: string | null }) => {
    const title = row.title?.trim() || "Untitled";
    const type = row.source_type || "reference";
    const summary = row.summary?.trim();
    const text = row.content_text?.trim();
    const content = [summary, text].filter(Boolean).join("\n").slice(0, MAX_TEXT_PER_ITEM);
    return `[${type}] ${title}\n${content}`;
  });

  return parts.join("\n\n---\n\n");
}
