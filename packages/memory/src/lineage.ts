/**
 * Lineage/archive helpers stub. Canon: idea lineage, archive entries, return potential.
 */

import type { ArchiveEntry } from "@twin/core";

export interface CreateArchiveEntryInput {
  project_id?: string | null;
  artifact_id?: string | null;
  idea_id?: string | null;
  idea_thread_id?: string | null;
  reason_paused: string | null;
  unresolved_question?: string | null;
  creative_pull?: number | null;
  recurrence_score?: number | null;
  notes_from_harvey?: string | null;
  last_session_id?: string | null;
}

/**
 * Stub: returns an archive entry shape. Caller persists to DB.
 */
export function createArchiveEntry(input: CreateArchiveEntryInput): ArchiveEntry {
  return {
    archive_entry_id: crypto.randomUUID(),
    project_id: input.project_id ?? null,
    artifact_id: input.artifact_id ?? null,
    idea_id: input.idea_id ?? null,
    idea_thread_id: input.idea_thread_id ?? null,
    reason_paused: input.reason_paused,
    unresolved_question: input.unresolved_question ?? null,
    creative_pull: input.creative_pull ?? null,
    recurrence_score: input.recurrence_score ?? null,
    notes_from_harvey: input.notes_from_harvey ?? null,
    last_session_id: input.last_session_id ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
