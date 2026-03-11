import { describe, it, expect } from "vitest";
import { createArchiveEntry } from "@twin/memory";

describe("createArchiveEntry", () => {
  it("returns an object with all required fields populated", () => {
    const entry = createArchiveEntry({
      project_id: "proj-1",
      artifact_id: "art-1",
      idea_id: "idea-1",
      idea_thread_id: "thread-1",
      reason_paused: "Strong archive candidate with unresolved narrative tension.",
      creative_pull: 0.75,
      recurrence_score: 0.4,
      last_session_id: "sess-1",
    });

    expect(entry.archive_entry_id).toBeTruthy();
    expect(entry.project_id).toBe("proj-1");
    expect(entry.artifact_id).toBe("art-1");
    expect(entry.idea_id).toBe("idea-1");
    expect(entry.idea_thread_id).toBe("thread-1");
    expect(entry.reason_paused).toBe("Strong archive candidate with unresolved narrative tension.");
    expect(entry.creative_pull).toBe(0.75);
    expect(entry.recurrence_score).toBe(0.4);
    expect(entry.last_session_id).toBe("sess-1");
    expect(entry.created_at).toBeTruthy();
    expect(entry.updated_at).toBeTruthy();
  });

  it("generates a unique archive_entry_id on each call", () => {
    const input = {
      project_id: "proj-1",
      artifact_id: "art-1",
      reason_paused: "archive_candidate",
    };
    const a = createArchiveEntry(input);
    const b = createArchiveEntry(input);
    expect(a.archive_entry_id).not.toBe(b.archive_entry_id);
  });

  it("sets reason_paused to null when explicitly provided as null", () => {
    const entry = createArchiveEntry({
      artifact_id: "art-2",
      reason_paused: null,
    });
    expect(entry.reason_paused).toBeNull();
  });

  it("defaults optional fields to null when not provided", () => {
    const entry = createArchiveEntry({ reason_paused: "paused" });
    expect(entry.project_id).toBeNull();
    expect(entry.artifact_id).toBeNull();
    expect(entry.idea_id).toBeNull();
    expect(entry.idea_thread_id).toBeNull();
    expect(entry.unresolved_question).toBeNull();
    expect(entry.creative_pull).toBeNull();
    expect(entry.recurrence_score).toBeNull();
    expect(entry.notes_from_harvey).toBeNull();
    expect(entry.last_session_id).toBeNull();
  });

  it("maps creative_pull from pull_score analog and recurrence_score correctly", () => {
    // Mirrors how session-runner passes evaluation.pull_score → creative_pull
    // and evaluation.recurrence_score → recurrence_score.
    const pullScore = 0.82;
    const recurrenceScore = 0.31;

    const entry = createArchiveEntry({
      artifact_id: "art-3",
      project_id: "proj-3",
      last_session_id: "sess-3",
      reason_paused: "archive_candidate",
      creative_pull: pullScore,
      recurrence_score: recurrenceScore,
    });

    expect(entry.creative_pull).toBe(pullScore);
    expect(entry.recurrence_score).toBe(recurrenceScore);
  });
});
