import { describe, it, expect } from "vitest";
import {
  defaultCreativeState,
  updateCreativeState,
  stateToSnapshotRow,
} from "@twin/evaluation";
import type { EvaluationSignal } from "@twin/core";
import { getLatestCreativeState } from "../creative-state-load";
import {
  getActiveIntent,
  updateSessionIntent,
  type IntentUpdateInput,
} from "../session-intent";

/**
 * Neutral evaluation helper mirroring neutralEvaluationSignalForNoArtifact in session-runner.
 * Kept in tests so we can exercise the no-artifact continuity contract without touching runtime code.
 */
function neutralEvalForNoArtifact(sessionId: string): EvaluationSignal {
  const now = new Date().toISOString();
  return {
    evaluation_signal_id: "eval-no-artifact",
    target_type: "session",
    target_id: sessionId,
    alignment_score: 0.5,
    emergence_score: 0.5,
    fertility_score: 0.5,
    pull_score: 0.5,
    recurrence_score: 0.2,
    resonance_score: 0.5,
    rationale: "no-artifact session; neutral signal for state evolution",
    created_at: now,
    updated_at: now,
  };
}

/** Minimal Supabase-like stub for creative_state_snapshot read path. */
function makeSupabaseForSnapshot(row: Record<string, unknown>) {
  const query = {
    select() {
      return query;
    },
    order() {
      return query;
    },
    limit() {
      return query;
    },
    maybeSingle() {
      return Promise.resolve({ data: row, error: null });
    },
  };
  return {
    from(table: string) {
      expect(table).toBe("creative_state_snapshot");
      return query;
    },
  } as unknown;
}

interface RuntimeIntentRow {
  intent_id: string;
  created_at: string;
  updated_at: string;
  status: string;
  intent_kind: string;
  target_project_id: string | null;
  target_thread_id: string | null;
  target_artifact_family: string | null;
  reason_summary: string | null;
  evidence_json: Record<string, unknown> | null;
  confidence: number | null;
  exit_conditions_json: Record<string, unknown> | null;
  source_session_id: string | null;
  last_reinforced_session_id: string | null;
}

/** Supabase-like stub for runtime_intent read/write path used by updateSessionIntent + getActiveIntent. */
function makeSupabaseForIntent(initialRows: RuntimeIntentRow[] = []) {
  const store: RuntimeIntentRow[] = [...initialRows];

  const tableApi = {
    _statusFilter: undefined as string | undefined,

    // Read path used by getActiveIntent
    select() {
      return tableApi;
    },
    eq(column: string, value: string) {
      if (column === "status") {
        tableApi._statusFilter = value;
      }
      return tableApi;
    },
    order() {
      return tableApi;
    },
    limit() {
      return tableApi;
    },
    async maybeSingle() {
      const status = tableApi._statusFilter;
      const candidates = status
        ? store.filter((r) => r.status === status)
        : store.slice();
      const latest =
        candidates.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
      return { data: latest, error: null };
    },

    // Write paths used by updateSessionIntent
    update(patch: Partial<RuntimeIntentRow>) {
      return {
        async eq(column: string, value: string) {
          if (column === "intent_id") {
            const idx = store.findIndex((r) => r.intent_id === value);
            if (idx !== -1) {
              store[idx] = { ...store[idx], ...patch, updated_at: new Date().toISOString() };
            }
          }
          return { error: null };
        },
      };
    },

    insert(row: Record<string, unknown>) {
      const intentId = `intent-${store.length + 1}`;
      const now = new Date().toISOString();
      const full: RuntimeIntentRow = {
        intent_id: intentId,
        created_at: now,
        updated_at: now,
        status: String(row.status ?? "active"),
        intent_kind: String(row.intent_kind ?? "explore"),
        target_project_id: (row.target_project_id as string | null) ?? null,
        target_thread_id: (row.target_thread_id as string | null) ?? null,
        target_artifact_family: (row.target_artifact_family as string | null) ?? null,
        reason_summary: (row.reason_summary as string | null) ?? null,
        evidence_json: (row.evidence_json as Record<string, unknown> | null) ?? null,
        confidence: (row.confidence as number | null) ?? null,
        exit_conditions_json:
          (row.exit_conditions_json as Record<string, unknown> | null) ?? null,
        source_session_id: (row.source_session_id as string | null) ?? null,
        last_reinforced_session_id:
          (row.last_reinforced_session_id as string | null) ?? null,
      };
      store.push(full);
      return {
        select() {
          return {
            async single() {
              return { data: { intent_id: intentId }, error: null };
            },
          };
        },
      };
    },
  };

  const supabase = {
    from(table: string) {
      expect(table).toBe("runtime_intent");
      return tableApi;
    },
    /** Expose store for assertions. */
    _store: store,
  };

  return supabase as unknown as {
    from(table: string): typeof tableApi;
    _store: RuntimeIntentRow[];
  };
}

describe("no-artifact session continuity — creative_state_snapshot", () => {
  it("persists a snapshot that the next continuity load can see", async () => {
    const sessionId = "sess-no-artifact-1";
    const previous = {
      ...defaultCreativeState(),
      reflection_need: 0.7,
      unfinished_projects: 0.2,
    };

    const evalSignal = neutralEvalForNoArtifact(sessionId);
    const next = updateCreativeState(previous, evalSignal, {
      isReflection: true,
      repetitionDetected: false,
    });

    const row = stateToSnapshotRow(
      next,
      sessionId,
      "no-artifact session; neutral signal for state evolution",
    );

    const supabase = makeSupabaseForSnapshot(row);
    const { state, snapshotId } = await getLatestCreativeState(
      supabase as Parameters<typeof getLatestCreativeState>[0],
    );

    expect(snapshotId).toBe(row.state_snapshot_id);
    expect(state.reflection_need).toBeCloseTo(next.reflection_need, 5);
    expect(state.unfinished_projects).toBeCloseTo(next.unfinished_projects, 5);
  });
});

describe("no-artifact session continuity — runtime_intent", () => {
  it("creates or updates an active intent that the next continuity load can see", async () => {
    const supabase = makeSupabaseForIntent();

    const input: IntentUpdateInput = {
      sessionId: "sess-no-artifact-2",
      sessionMode: "reflect",
      selectedProjectId: "proj-1",
      selectedThreadId: "thread-1",
      selectedIdeaId: null,
      confidence: 0.8,
      repetitionDetected: false,
      proposalCreated: false,
      recurrenceUpdated: false,
      returnSuccessTrend: 0.6,
      repetitionPenalty: 0.1,
      recommendedNextActionKind: null,
    };

    const result = await updateSessionIntent(
      supabase as Parameters<typeof updateSessionIntent>[0],
      input,
      null,
    );

    expect(result.updated).toBe(true);
    expect(result.newIntentId).toBeTruthy();
    const created = supabase._store.find((r) => r.intent_id === result.newIntentId);
    expect(created).toBeDefined();
    expect(created!.status).toBe("active");
    expect(created!.source_session_id).toBe(input.sessionId);

    const active = await getActiveIntent(
      supabase as Parameters<typeof getActiveIntent>[0],
    );

    expect(active).not.toBeNull();
    expect(active!.intent_id).toBe(result.newIntentId);
    expect(active!.intent_kind).toBe("reflect");
    expect(active!.source_session_id).toBe(input.sessionId);
  });
});

