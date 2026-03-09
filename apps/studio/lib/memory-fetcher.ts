/**
 * Supabase-backed memory fetcher for retrieveMemory. Plan §6, §7.
 */

import type { getSupabaseServer } from "@/lib/supabase-server";
import type { MemoryRecordRow, RetrieveMemoryOptions } from "@twin/memory";

type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseServer>>;

const DEFAULT_FETCH_LIMIT = 20;

/**
 * Fetch raw memory rows from Supabase for retrieveMemory. Filters by project_id when provided.
 */
export async function createMemoryFetcher(supabase: SupabaseClient | null): Promise<((options: RetrieveMemoryOptions) => Promise<MemoryRecordRow[]>) | null> {
  if (!supabase) return null;
  return async (options: RetrieveMemoryOptions): Promise<MemoryRecordRow[]> => {
    const limit = options.limit ?? DEFAULT_FETCH_LIMIT;
    let query = supabase
      .from("memory_record")
      .select("memory_record_id, memory_type, summary, importance_score, recurrence_score, created_at")
      .order("created_at", { ascending: false })
      .limit(limit * 2);
    if (options.project_id) {
      query = query.or(`project_id.eq.${options.project_id},project_id.is.null`);
    }
    const { data, error } = await query;
    if (error) return [];
    return (data ?? []) as MemoryRecordRow[];
  };
}
