import { describe, it, expect } from "vitest";
import { computeEvaluationSignals } from "@twin/evaluation";
import type { EvaluationInput } from "@twin/evaluation";
import type { CritiqueRecord } from "@twin/core";

function makeInput(
  outcome: CritiqueRecord["critique_outcome"],
  overrides: Partial<CritiqueRecord> = {}
): EvaluationInput {
  return {
    target_type: "idea",
    target_id: "idea-1",
    critique: {
      critique_id: "c-1",
      session_id: "s-1",
      target_type: "artifact",
      target_id: "art-1",
      critique_outcome: outcome,
      intent_note: null,
      strength_note: null,
      potential_note: null,
      fertility_note: null,
      overall_summary: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    },
  };
}

describe("computeEvaluationSignals — recurrence_score influences idea selection priority", () => {
  it("returns non-null recurrence_score for 'continue' outcome", () => {
    const result = computeEvaluationSignals(makeInput("continue"));
    expect(result.recurrence_score).not.toBeNull();
    expect(result.recurrence_score).toBeGreaterThanOrEqual(0);
    expect(result.recurrence_score).toBeLessThanOrEqual(1);
  });

  it("returns non-null recurrence_score for 'branch' outcome", () => {
    const result = computeEvaluationSignals(makeInput("branch"));
    expect(result.recurrence_score).not.toBeNull();
    expect(result.recurrence_score).toBeGreaterThanOrEqual(0);
    expect(result.recurrence_score).toBeLessThanOrEqual(1);
  });

  it("returns non-null recurrence_score for 'shift_medium' outcome", () => {
    const result = computeEvaluationSignals(makeInput("shift_medium"));
    expect(result.recurrence_score).not.toBeNull();
    expect(result.recurrence_score).toBeGreaterThanOrEqual(0);
    expect(result.recurrence_score).toBeLessThanOrEqual(1);
  });

  it("returns recurrence_score = 0.6 for 'reflect' outcome", () => {
    const result = computeEvaluationSignals(makeInput("reflect"));
    expect(result.recurrence_score).toBe(0.6);
  });

  it("returns low recurrence_score for 'archive_candidate' outcome", () => {
    const result = computeEvaluationSignals(makeInput("archive_candidate"));
    expect(result.recurrence_score).not.toBeNull();
    expect(result.recurrence_score).toBeLessThan(0.5);
  });

  it("returns lowest recurrence_score for 'stop' outcome", () => {
    const result = computeEvaluationSignals(makeInput("stop"));
    expect(result.recurrence_score).not.toBeNull();
    expect(result.recurrence_score).toBeLessThanOrEqual(0.2);
  });

  it("recurrence_score ranks higher for 'reflect' than 'continue'", () => {
    const reflect = computeEvaluationSignals(makeInput("reflect"));
    const cont = computeEvaluationSignals(makeInput("continue"));
    expect(reflect.recurrence_score!).toBeGreaterThan(cont.recurrence_score!);
  });

  it("recurrence_score ranks higher for active outcomes than archive/stop", () => {
    const cont = computeEvaluationSignals(makeInput("continue"));
    const archive = computeEvaluationSignals(makeInput("archive_candidate"));
    const stop = computeEvaluationSignals(makeInput("stop"));
    expect(cont.recurrence_score!).toBeGreaterThan(archive.recurrence_score!);
    expect(archive.recurrence_score!).toBeGreaterThan(stop.recurrence_score!);
  });

  it("ranking weight formula (r*0.6 + p*0.4) produces higher weight for high recurrence_score", () => {
    // Mirrors the weighting in project-thread-selection.ts
    const weight = (r: number, p: number) => r * 0.6 + p * 0.4;

    const highRecurrence = computeEvaluationSignals(makeInput("reflect"));
    const lowRecurrence = computeEvaluationSignals(makeInput("stop"));

    const pull = 0.5; // neutral pull for comparison
    const highWeight = weight(highRecurrence.recurrence_score!, pull);
    const lowWeight = weight(lowRecurrence.recurrence_score!, pull);

    expect(highWeight).toBeGreaterThan(lowWeight);
  });

  it("returns null recurrence_score when no critique is provided", () => {
    const result = computeEvaluationSignals({
      target_type: "idea",
      target_id: "idea-1",
      critique: null,
    });
    expect(result.recurrence_score).toBeNull();
  });
});
