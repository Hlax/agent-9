/**
 * Memory record helper stub. Canon: memory records are distinct from source items and artifacts.
 */

import type { MemoryRecord } from "@twin/core";

export interface CreateMemoryRecordInput {
  project_id?: string | null;
  memory_type: string;
  summary: string;
  details?: string | null;
  source_session_id?: string | null;
  source_artifact_id?: string | null;
  importance_score?: number | null;
  recurrence_score?: number | null;
}

/**
 * Stub: returns a memory record shape. Caller persists to DB.
 */
export function createMemoryRecord(input: CreateMemoryRecordInput): MemoryRecord {
  return {
    memory_record_id: crypto.randomUUID(),
    project_id: input.project_id ?? null,
    memory_type: input.memory_type,
    summary: input.summary,
    details: input.details ?? null,
    source_session_id: input.source_session_id ?? null,
    source_artifact_id: input.source_artifact_id ?? null,
    importance_score: input.importance_score ?? null,
    recurrence_score: input.recurrence_score ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
