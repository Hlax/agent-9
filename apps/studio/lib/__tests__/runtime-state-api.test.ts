import { mapSessionTraceRow } from "../runtime-state-api";

describe("mapSessionTraceRow", () => {
  const baseRow = {
    session_id: "s1",
    trace: null,
    decision_summary: null,
    created_at: "2026-03-10T10:00:00.000Z",
  };

  it("returns null for all fields when trace is null", () => {
    const result = mapSessionTraceRow(baseRow);
    expect(result.session_id).toBe("s1");
    expect(result.mode).toBeNull();
    expect(result.metabolism_mode).toBeNull();
    expect(result.drive).toBeNull();
    expect(result.requested_medium).toBeNull();
    expect(result.executed_medium).toBeNull();
    expect(result.fallback_reason).toBeNull();
    expect(result.resolution_source).toBeNull();
    expect(result.medium_fit).toBeNull();
    expect(result.missing_capability).toBeNull();
    expect(result.extension_classification).toBeNull();
    expect(result.confidence_truth).toBeNull();
  });

  it("reads session_mode (not mode) from the trace for the mode field", () => {
    const row = {
      ...baseRow,
      trace: { session_mode: "explore", mode: "should-not-appear" },
    };
    const result = mapSessionTraceRow(row);
    expect(result.mode).toBe("explore");
  });

  it("returns null for mode when trace has no session_mode field", () => {
    const row = { ...baseRow, trace: { mode: "old-field" } };
    const result = mapSessionTraceRow(row);
    // The field written by writeTraceAndDeliberation is session_mode, not mode.
    // Stale rows without session_mode should surface as null.
    expect(result.mode).toBeNull();
  });

  it("maps metabolism_mode from the trace", () => {
    const row = { ...baseRow, trace: { metabolism_mode: "slow" } };
    expect(mapSessionTraceRow(row).metabolism_mode).toBe("slow");
  });

  it("maps all Phase 1 medium-resolution fields", () => {
    const row = {
      ...baseRow,
      trace: {
        requested_medium: "writing",
        executed_medium: "concept",
        fallback_reason: "capability_gap",
        resolution_source: "registry",
      },
    };
    const result = mapSessionTraceRow(row);
    expect(result.requested_medium).toBe("writing");
    expect(result.executed_medium).toBe("concept");
    expect(result.fallback_reason).toBe("capability_gap");
    expect(result.resolution_source).toBe("registry");
  });

  it("maps all Phase 2 capability-fit fields", () => {
    const row = {
      ...baseRow,
      trace: {
        medium_fit: "partial",
        missing_capability: "image_generation",
      },
    };
    const result = mapSessionTraceRow(row);
    expect(result.medium_fit).toBe("partial");
    expect(result.missing_capability).toBe("image_generation");
  });

  it("maps all Phase 3 extension-proposal fields", () => {
    const row = {
      ...baseRow,
      trace: {
        extension_classification: "surface_environment_extension",
        confidence_truth: 0.87,
      },
    };
    const result = mapSessionTraceRow(row);
    expect(result.extension_classification).toBe("surface_environment_extension");
    expect(result.confidence_truth).toBe(0.87);
  });

  it("maps a fully-populated trace correctly", () => {
    const row = {
      ...baseRow,
      trace: {
        session_mode: "return",
        metabolism_mode: "fast",
        drive: "archive",
        project_name: "proj",
        thread_name: "thread",
        idea_summary: "idea",
        artifact_id: "art-1",
        proposal_id: "prop-1",
        proposal_type: "surface",
        tokens_used: 512,
        requested_medium: "image",
        executed_medium: "image",
        fallback_reason: null,
        resolution_source: "registry",
        medium_fit: "full",
        missing_capability: null,
        extension_classification: null,
        confidence_truth: 0.95,
      },
    };
    const result = mapSessionTraceRow(row);
    expect(result.mode).toBe("return");
    expect(result.metabolism_mode).toBe("fast");
    expect(result.drive).toBe("archive");
    expect(result.project).toBe("proj");
    expect(result.thread).toBe("thread");
    expect(result.idea).toBe("idea");
    expect(result.artifact_id).toBe("art-1");
    expect(result.proposal_id).toBe("prop-1");
    expect(result.proposal_type).toBe("surface");
    expect(result.tokens_used).toBe(512);
    expect(result.requested_medium).toBe("image");
    expect(result.executed_medium).toBe("image");
    expect(result.fallback_reason).toBeNull();
    expect(result.resolution_source).toBe("registry");
    expect(result.medium_fit).toBe("full");
    expect(result.missing_capability).toBeNull();
    expect(result.extension_classification).toBeNull();
    expect(result.confidence_truth).toBe(0.95);
    expect(result.created_at).toBe("2026-03-10T10:00:00.000Z");
  });
});
