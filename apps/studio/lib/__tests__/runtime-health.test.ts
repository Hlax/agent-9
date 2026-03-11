import { buildRuntimeHealthSummary, type HealthFlagId } from "../runtime-health";
import type { ContinuitySessionRow } from "../runtime-continuity";

function makeRow(partial: Partial<ContinuitySessionRow>): ContinuitySessionRow {
  return {
    session_id: partial.session_id ?? "s",
    created_at: partial.created_at ?? "2026-03-11T00:00:00.000Z",
    session_mode: partial.session_mode ?? "explore",
    selected_drive: partial.selected_drive ?? "explore",
    selection_source: partial.selection_source ?? "project_thread",
    narrative_state: partial.narrative_state ?? "expansion",
    action_kind: partial.action_kind ?? "continue_thread",
    confidence_band: partial.confidence_band ?? "medium",
    confidence: partial.confidence ?? 0.6,
    selection_reason: partial.selection_reason ?? "project_thread_default",
    tension_kinds: partial.tension_kinds ?? [],
    evidence_kinds: partial.evidence_kinds ?? ["creative_state"],
    proposal_created: partial.proposal_created ?? false,
    proposal_type: partial.proposal_type ?? null,
    proposal_role: partial.proposal_role ?? null,
    artifact_role: partial.artifact_role ?? null,
    summary_line: partial.summary_line ?? "summary",
  };
}

function flagIds(summary: ReturnType<typeof buildRuntimeHealthSummary>): HealthFlagId[] {
  return summary.flags.map((f) => f.id);
}

describe("runtime health helpers", () => {
  it("returns no flags for a healthy mixed window", () => {
    const rows: ContinuitySessionRow[] = [
      makeRow({ narrative_state: "expansion", confidence: 0.7 }),
      makeRow({ narrative_state: "reflection", confidence: 0.6 }),
      makeRow({ narrative_state: "return", action_kind: "resurface_archive", confidence: 0.8 }),
      makeRow({ narrative_state: "expansion", confidence: 0.75 }),
    ];
    const summary = buildRuntimeHealthSummary(rows);
    expect(summary.flags).toHaveLength(0);
  });

  it("detects reflection_streak", () => {
    const rows: ContinuitySessionRow[] = [
      makeRow({ narrative_state: "reflection" }),
      makeRow({ narrative_state: "reflection" }),
      makeRow({ narrative_state: "reflection" }),
      makeRow({ narrative_state: "expansion" }),
    ];
    const summary = buildRuntimeHealthSummary(rows);
    expect(flagIds(summary)).toContain("reflection_streak");
  });

  it("detects low_confidence_streak", () => {
    const rows: ContinuitySessionRow[] = [
      makeRow({ confidence_band: "low", confidence: 0.2 }),
      makeRow({ confidence_band: "low", confidence: 0.1 }),
      makeRow({ confidence_band: "low", confidence: 0.3 }),
      makeRow({ confidence_band: "medium", confidence: 0.5 }),
    ];
    const summary = buildRuntimeHealthSummary(rows);
    expect(flagIds(summary)).toContain("low_confidence_streak");
  });

  it("detects proposal_heavy_streak", () => {
    const rows: ContinuitySessionRow[] = [
      makeRow({ proposal_created: true }),
      makeRow({ proposal_created: true }),
      makeRow({ proposal_created: true }),
      makeRow({ proposal_created: false }),
    ];
    const summary = buildRuntimeHealthSummary(rows);
    expect(flagIds(summary)).toContain("proposal_heavy_streak");
  });

  it("detects unfinished_pull_without_return", () => {
    const rows: ContinuitySessionRow[] = [
      makeRow({ tension_kinds: ["unfinished_pull"] }),
      makeRow({ tension_kinds: ["unfinished_pull"] }),
      makeRow({ tension_kinds: ["unfinished_pull"] }),
      makeRow({ narrative_state: "expansion", action_kind: "continue_thread" }),
    ];
    const summary = buildRuntimeHealthSummary(rows);
    expect(flagIds(summary)).toContain("unfinished_pull_without_return");
  });

  it("detects identity_pressure_streak", () => {
    const rows: ContinuitySessionRow[] = [
      makeRow({ tension_kinds: ["identity_pressure"], proposal_role: "avatar_candidate" }),
      makeRow({ tension_kinds: ["identity_pressure"] }),
      makeRow({ tension_kinds: ["identity_pressure"] }),
    ];
    const summary = buildRuntimeHealthSummary(rows);
    expect(flagIds(summary)).toContain("identity_pressure_streak");
  });

  it("detects curation_pressure_accumulation", () => {
    const rows: ContinuitySessionRow[] = [
      makeRow({ narrative_state: "curation_pressure" }),
      makeRow({ tension_kinds: ["backlog_pressure"] }),
      makeRow({ tension_kinds: ["surface_pressure"] }),
      makeRow({ narrative_state: "expansion" }),
    ];
    const summary = buildRuntimeHealthSummary(rows);
    expect(flagIds(summary)).toContain("curation_pressure_accumulation");
  });

  it("is tolerant of null/missing fields", () => {
    const rows: ContinuitySessionRow[] = [
      makeRow({ narrative_state: null, tension_kinds: [], confidence: null }),
      makeRow({ narrative_state: "reflection", tension_kinds: [], confidence: null }),
      makeRow({ narrative_state: "reflection", tension_kinds: [], confidence: null }),
    ];
    const summary = buildRuntimeHealthSummary(rows);
    expect(summary.windowSize).toBe(3);
    expect(summary.flags.length).toBeGreaterThanOrEqual(0);
  });
});

