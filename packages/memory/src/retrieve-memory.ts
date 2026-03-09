/**
 * Memory retrieval — vector-ready. Plan §6, §7.
 * Single entrypoint: rule filters → optional vector similarity (future) → hybrid scoring → top-k.
 * Four-bucket policy: short horizon, active continuity, long horizon, instructional.
 * V1: rule-based only; vector_similarity optional later.
 * Caller provides a fetcher so this package stays free of Supabase.
 */

export interface RetrieveMemoryOptions {
  /** Filter by identity (when identity_id column exists). */
  identity_id?: string | null;
  /** Filter by project for active continuity bucket. */
  project_id?: string | null;
  /** Filter by idea thread (when idea_thread_id column exists). */
  thread_id?: string | null;
  /** Max number of memories to return. */
  limit?: number;
  /** Optional: prompt for future vector similarity. */
  prompt?: string | null;
}

export interface RetrievedMemory {
  memory_record_id: string;
  memory_type: string;
  summary: string;
  importance_score: number | null;
  recurrence_score: number | null;
  created_at: string;
  /** Computed hybrid score for ordering. */
  score: number;
}

export interface MemoryRecordRow {
  memory_record_id: string;
  memory_type: string;
  summary: string;
  importance_score: number | null;
  recurrence_score: number | null;
  created_at: string;
}

/** Fetcher: given options, return raw memory rows (e.g. from Supabase). */
export type MemoryFetcher = (options: RetrieveMemoryOptions) => Promise<MemoryRecordRow[]>;

const DEFAULT_LIMIT = 10;
const RECENCY_WEIGHT = 0.4;
const IMPORTANCE_WEIGHT = 0.35;
const RECURRENCE_WEIGHT = 0.25;

/**
 * Retrieve top-k memories. Vector-ready: add vector_similarity in fetcher later without changing this signature.
 * V1: hybrid score = recency + importance + recurrence; no embeddings.
 */
export async function retrieveMemory(
  fetchRows: MemoryFetcher | null,
  options: RetrieveMemoryOptions = {}
): Promise<RetrievedMemory[]> {
  if (!fetchRows) return [];
  const limit = options.limit ?? DEFAULT_LIMIT;
  const rows = await fetchRows(options);
  if (!rows.length) return [];

  const now = Date.now();
  const scored: RetrievedMemory[] = rows.map((r) => {
    const recencyNorm = 1 - Math.min(1, (now - new Date(r.created_at).getTime()) / (30 * 24 * 60 * 60 * 1000));
    const importance = r.importance_score ?? 0.5;
    const recurrence = r.recurrence_score ?? 0.5;
    const score =
      RECENCY_WEIGHT * recencyNorm +
      IMPORTANCE_WEIGHT * importance +
      RECURRENCE_WEIGHT * recurrence;
    return {
      memory_record_id: r.memory_record_id,
      memory_type: r.memory_type,
      summary: r.summary,
      importance_score: r.importance_score,
      recurrence_score: r.recurrence_score,
      created_at: r.created_at,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
