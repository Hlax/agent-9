import {
  buildContinuityRows,
  buildContinuityAggregate,
  type ContinuitySessionRow,
} from "../runtime-continuity";

describe("runtime continuity helpers", () => {
  const baseSession = {
    decision_summary: {},
  } as any;

  it("buildContinuityRows flattens deliberation and trace data newest-first", () => {
    const sessions = [
      {
        session_id: "s1",
        created_at: "2026-03-10T10:00:00.000Z",
        trace: {
          artifact_id: "a1",
          proposal_id: "p1",
          proposal_type: "surface",
        },
        decision_summary: { confidence: 0.5 },
      },
      {
        session_id: "s2",
        created_at: "2026-03-11T10:00:00.000Z",
        trace: {
          artifact_id: "a2",
          proposal_id: null,
          proposal_type: null,
        },
        decision_summary: { confidence: 0.7 },
      },
    ] as any[];

    const traces = [
      {
        session_id: "s1",
        observations_json: {
          session_mode: "explore",
          selected_drive: "return",
          selection_source: "project_thread",
          narrative_state: "reflection",
        },
        tensions_json: {
          tension_kinds: ["unfinished_pull", "identity_pressure"],
        },
        hypotheses_json: {
          action_kind: "generate_avatar_candidate",
          confidence_band: "medium",
          selection_reason: "project_thread_default",
        },
        evidence_checked_json: {
          evidence_kinds: ["creative_state", "project_context"],
        },
        confidence: 0.63,
        created_at: "2026-03-10T10:01:00.000Z",
      },
      {
        session_id: "s2",
        observations_json: {
          session_mode: "return",
          selected_drive: "explore",
          selection_source: "archive",
          narrative_state: "return",
        },
        tensions_json: {
          tension_kinds: ["backlog_pressure"],
        },
        hypotheses_json: {
          action_kind: "resurface_archive",
          confidence_band: "high",
          selection_reason: "archive_return_due_to_mode",
        },
        evidence_checked_json: {
          evidence_kinds: ["creative_state", "archive"],
        },
        confidence: 0.9,
        created_at: "2026-03-11T10:01:00.000Z",
      },
    ] as any[];

    const proposals = [
      { proposal_record_id: "p1", proposal_role: "avatar_candidate" },
    ] as any[];

    const artifacts = [
      { artifact_id: "a1", artifact_role: "image_concept" },
      { artifact_id: "a2", artifact_role: "layout_concept" },
    ] as any[];

    const rows = buildContinuityRows({ sessions, traces, proposals, artifacts });

    expect(rows).toHaveLength(2);
    expect(rows[0].session_id).toBe("s1");
    expect(rows[1].session_id).toBe("s2");

    const first = rows[0];
    expect(first.session_mode).toBe("explore");
    expect(first.selected_drive).toBe("return");
    expect(first.selection_source).toBe("project_thread");
    expect(first.narrative_state).toBe("reflection");
    expect(first.action_kind).toBe("generate_avatar_candidate");
    expect(first.confidence_band).toBe("medium");
    expect(first.confidence).toBe(0.63);
    expect(first.selection_reason).toBe("project_thread_default");
    expect(first.tension_kinds).toEqual(["unfinished_pull", "identity_pressure"]);
    expect(first.evidence_kinds).toEqual(["creative_state", "project_context"]);
    expect(first.proposal_created).toBe(true);
    expect(first.proposal_type).toBe("surface");
    expect(first.proposal_role).toBe("avatar_candidate");
    expect(first.artifact_role).toBe("image_concept");
    expect(typeof first.summary_line).toBe("string");
    expect(first.summary_line.length).toBeGreaterThan(0);
  });

  it("buildContinuityAggregate computes counts and averages correctly", () => {
    const rows: ContinuitySessionRow[] = [
      {
        session_id: "s1",
        created_at: "2026-03-10T10:00:00.000Z",
        session_mode: "explore",
        selected_drive: "return",
        selection_source: "project_thread",
        narrative_state: "reflection",
        action_kind: "generate_avatar_candidate",
        confidence_band: "medium",
        confidence: 0.63,
        selection_reason: "project_thread_default",
        tension_kinds: ["unfinished_pull", "identity_pressure"],
        evidence_kinds: ["creative_state", "project_context"],
        proposal_created: true,
        proposal_type: "surface",
        proposal_role: "avatar_candidate",
        artifact_role: "image_concept",
        summary_line: "line1",
      },
      {
        session_id: "s2",
        created_at: "2026-03-11T10:00:00.000Z",
        session_mode: "return",
        selected_drive: "explore",
        selection_source: "archive",
        narrative_state: "return",
        action_kind: "resurface_archive",
        confidence_band: "high",
        confidence: 0.9,
        selection_reason: "archive_return_due_to_mode",
        tension_kinds: ["backlog_pressure", "unfinished_pull"],
        evidence_kinds: ["creative_state", "archive"],
        proposal_created: false,
        proposal_type: null,
        proposal_role: null,
        artifact_role: "layout_concept",
        summary_line: "line2",
      },
    ];

    const summary = buildContinuityAggregate(rows);

    expect(summary.total_sessions).toBe(2);
    expect(summary.narrative_counts).toEqual({
      reflection: 1,
      return: 1,
    });
    expect(summary.action_counts).toEqual({
      generate_avatar_candidate: 1,
      resurface_archive: 1,
    });
    expect(summary.tension_counts).toEqual({
      unfinished_pull: 2,
      identity_pressure: 1,
      backlog_pressure: 1,
    });
    expect(summary.average_confidence).toBeCloseTo((0.63 + 0.9) / 2, 6);
    expect(summary.proposal_session_count).toBe(1);
  });
});

describe("runtime continuity edge cases", () => {
  it("buildContinuityRows returns empty array when sessions is empty", () => {
    const rows = buildContinuityRows({ sessions: [], traces: [], proposals: [], artifacts: [] });
    expect(rows).toHaveLength(0);
  });

  it("buildContinuityRows handles sessions with no matching trace gracefully", () => {
    const sessions = [
      {
        session_id: "s-no-trace",
        created_at: "2026-03-10T10:00:00.000Z",
        trace: { artifact_id: "a1", proposal_id: null, proposal_type: null },
        decision_summary: {},
      },
    ] as any[];
    const rows = buildContinuityRows({ sessions, traces: [], proposals: [], artifacts: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0].session_id).toBe("s-no-trace");
    expect(rows[0].narrative_state).toBeNull();
    expect(rows[0].action_kind).toBeNull();
    expect(rows[0].tension_kinds).toEqual([]);
    expect(rows[0].evidence_kinds).toEqual([]);
  });

  it("buildContinuityRows picks the latest deliberation trace when multiple exist for one session", () => {
    const sessions = [
      {
        session_id: "s1",
        created_at: "2026-03-10T10:00:00.000Z",
        trace: {},
        decision_summary: {},
      },
    ] as any[];
    const traces = [
      {
        session_id: "s1",
        observations_json: { narrative_state: "expansion" },
        tensions_json: {},
        hypotheses_json: { action_kind: "continue_thread", confidence_band: "low" },
        evidence_checked_json: {},
        confidence: 0.3,
        created_at: "2026-03-10T10:00:00.000Z",
      },
      {
        session_id: "s1",
        observations_json: { narrative_state: "reflection" },
        tensions_json: {},
        hypotheses_json: { action_kind: "resurface_archive", confidence_band: "high" },
        evidence_checked_json: {},
        confidence: 0.9,
        created_at: "2026-03-10T10:01:00.000Z", // later timestamp
      },
    ] as any[];
    const rows = buildContinuityRows({ sessions, traces, proposals: [], artifacts: [] });
    expect(rows).toHaveLength(1);
    // Should use the latest trace (10:01), not the earliest
    expect(rows[0].narrative_state).toBe("reflection");
    expect(rows[0].action_kind).toBe("resurface_archive");
    expect(rows[0].confidence).toBe(0.9);
  });

  it("buildContinuityRows falls back to deriving confidence_band from numeric confidence when trace lacks it", () => {
    const sessions = [
      {
        session_id: "s1",
        created_at: "2026-03-10T10:00:00.000Z",
        trace: {},
        decision_summary: {},
      },
    ] as any[];
    const traces = [
      {
        session_id: "s1",
        observations_json: {},
        tensions_json: {},
        // No confidence_band in hypotheses_json
        hypotheses_json: {},
        evidence_checked_json: {},
        confidence: 0.8,
        created_at: "2026-03-10T10:00:00.000Z",
      },
    ] as any[];
    const rows = buildContinuityRows({ sessions, traces, proposals: [], artifacts: [] });
    expect(rows[0].confidence).toBe(0.8);
    expect(rows[0].confidence_band).toBe("high");
  });

  it("buildContinuityRows does not expose proposal_role when proposal_id is missing from trace", () => {
    const sessions = [
      {
        session_id: "s1",
        created_at: "2026-03-10T10:00:00.000Z",
        trace: { proposal_id: null },
        decision_summary: {},
      },
    ] as any[];
    const proposals = [{ proposal_record_id: "p1", proposal_role: "avatar_candidate" }] as any[];
    const rows = buildContinuityRows({ sessions, traces: [], proposals, artifacts: [] });
    expect(rows[0].proposal_created).toBe(false);
    expect(rows[0].proposal_role).toBeNull();
  });

  it("buildContinuityAggregate returns nulls/zeros for empty input", () => {
    const summary = buildContinuityAggregate([]);
    expect(summary.total_sessions).toBe(0);
    expect(summary.average_confidence).toBeNull();
    expect(summary.proposal_session_count).toBe(0);
    expect(summary.narrative_counts).toEqual({});
    expect(summary.action_counts).toEqual({});
    expect(summary.tension_counts).toEqual({});
  });
});

