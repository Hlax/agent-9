/**
 * Phase 2 capability-fit and confidence tests (trace-first).
 * Lightweight: confidence inferred vs defaulted, medium_fit from critique, extension_classification null when weak evidence.
 * No proposal behavior changes.
 */

import type { CritiqueRecord, EvaluationSignal } from "@twin/core";
import { applyCapabilityFit, applyConfidenceFromCritique } from "../session-runner";

/** Minimal state shape for Phase 2 helpers; cast to satisfy SessionExecutionState in tests. */
function stateWithCritique(critique: CritiqueRecord | null) {
  return {
    critique,
    evaluation: null as EvaluationSignal | null,
    decisionSummary: { confidence: 0.7, next_action: null, project_reason: null, thread_reason: null, idea_reason: null, rejected_alternatives: [] },
    medium_fit: null as "supported" | "partial" | "unsupported" | null,
    missing_capability: null as string | null,
    extension_classification: null as string | null,
    confidence_truth: null as "inferred" | "defaulted" | null,
  } as unknown as Parameters<typeof applyCapabilityFit>[0];
}

function stateWithEvaluation(evaluation: EvaluationSignal | null, decisionSummaryConfidence: number) {
  return {
    critique: null as CritiqueRecord | null,
    evaluation,
    decisionSummary: { confidence: decisionSummaryConfidence, next_action: null, project_reason: null, thread_reason: null, idea_reason: null, rejected_alternatives: [] },
    confidence_truth: null as "inferred" | "defaulted" | null,
  } as unknown as Parameters<typeof applyConfidenceFromCritique>[0];
}

describe("Phase 2: confidence from critique/evaluation", () => {
  it("evaluation present → confidence inferred from scores, confidence_truth = inferred", () => {
    const state = stateWithEvaluation(
      {
        evaluation_signal_id: "e1",
        target_type: "artifact",
        target_id: "a1",
        alignment_score: 0.8,
        emergence_score: 0.6,
        fertility_score: 0.7,
        pull_score: 0.75,
        recurrence_score: null,
        resonance_score: null,
        rationale: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      0.7
    );
    const out = applyConfidenceFromCritique(state);
    expect(out.confidence_truth).toBe("inferred");
    expect(out.decisionSummary.confidence).toBe(0.78); // (0.8 + 0.75) / 2 rounded to 2 decimals
  });

  it("evaluation absent → confidence remains defaulted, confidence_truth = defaulted", () => {
    const state = stateWithEvaluation(null, 0.7);
    const out = applyConfidenceFromCritique(state);
    expect(out.confidence_truth).toBe("defaulted");
    expect(out.decisionSummary.confidence).toBe(0.7);
  });
});

describe("Phase 2: capability-fit from critique", () => {
  it("critique with interactive note → medium_fit partial/unsupported, missing_capability interactive_ui", () => {
    const state = stateWithCritique({
      critique_record_id: "c1",
      artifact_id: "a1",
      session_id: "s1",
      intent_note: null,
      strength_note: null,
      originality_note: null,
      energy_note: null,
      potential_note: null,
      medium_fit_note: "This would work better as an interactive experience.",
      coherence_note: null,
      fertility_note: null,
      overall_summary: null,
      critique_outcome: "continue",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const out = applyCapabilityFit(state);
    expect(out.medium_fit).toBe("partial");
    expect(out.missing_capability).toBe("interactive_ui");
  });

  it("critique with stateful/dynamic note → missing_capability stateful_surface", () => {
    const state = stateWithCritique({
      critique_record_id: "c1",
      artifact_id: "a1",
      session_id: "s1",
      intent_note: null,
      strength_note: null,
      originality_note: null,
      energy_note: null,
      potential_note: null,
      medium_fit_note: "Needs a stateful surface to really work.",
      coherence_note: null,
      fertility_note: null,
      overall_summary: null,
      critique_outcome: "continue",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const out = applyCapabilityFit(state);
    expect(out.medium_fit).toBe("partial");
    expect(out.missing_capability).toBe("stateful_surface");
  });

  it("critique with no mismatch signal → medium_fit = supported", () => {
    const state = stateWithCritique({
      critique_record_id: "c1",
      artifact_id: "a1",
      session_id: "s1",
      intent_note: null,
      strength_note: null,
      originality_note: null,
      energy_note: null,
      potential_note: null,
      medium_fit_note: "Solid piece, fits the format well.",
      coherence_note: null,
      fertility_note: null,
      overall_summary: null,
      critique_outcome: "continue",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const out = applyCapabilityFit(state);
    expect(out.medium_fit).toBe("supported");
    expect(out.missing_capability).toBeNull();
    expect(out.extension_classification).toBeNull();
  });

  it("partial/unsupported may have extension_classification = null when evidence weak", () => {
    const state = stateWithCritique({
      critique_record_id: "c1",
      artifact_id: "a1",
      session_id: "s1",
      intent_note: null,
      strength_note: null,
      originality_note: null,
      energy_note: null,
      potential_note: null,
      medium_fit_note: null,
      coherence_note: null,
      fertility_note: null,
      overall_summary: null,
      critique_outcome: "reflect",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const out = applyCapabilityFit(state);
    expect(out.medium_fit).toBe("partial");
    expect(out.extension_classification).toBeNull();
  });

  it("archive_candidate without medium-mismatch note → partial (low value, not necessarily wrong medium)", () => {
    const state = stateWithCritique({
      critique_record_id: "c1",
      artifact_id: "a1",
      session_id: "s1",
      intent_note: null,
      strength_note: null,
      originality_note: null,
      energy_note: null,
      potential_note: null,
      medium_fit_note: "Not worth continuing.",
      coherence_note: null,
      fertility_note: null,
      overall_summary: null,
      critique_outcome: "archive_candidate",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const out = applyCapabilityFit(state);
    expect(out.medium_fit).toBe("partial");
  });

  it("stop outcome → unsupported", () => {
    const state = stateWithCritique({
      critique_record_id: "c1",
      artifact_id: "a1",
      session_id: "s1",
      intent_note: null,
      strength_note: null,
      originality_note: null,
      energy_note: null,
      potential_note: null,
      medium_fit_note: null,
      coherence_note: null,
      fertility_note: null,
      overall_summary: null,
      critique_outcome: "stop",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const out = applyCapabilityFit(state);
    expect(out.medium_fit).toBe("unsupported");
  });

  it("no proposal state changes: capability-fit only sets medium_fit, missing_capability, extension_classification", () => {
    const state = stateWithCritique({
      critique_record_id: "c1",
      artifact_id: "a1",
      session_id: "s1",
      intent_note: null,
      strength_note: null,
      originality_note: null,
      energy_note: null,
      potential_note: null,
      medium_fit_note: "interactive would be better",
      coherence_note: null,
      fertility_note: null,
      overall_summary: null,
      critique_outcome: "continue",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const out = applyCapabilityFit(state);
    expect(out.medium_fit).toBe("partial");
    expect(out.missing_capability).toBe("interactive_ui");
    expect(out).not.toHaveProperty("proposalCreated");
    expect(out).not.toHaveProperty("traceProposalId");
  });
});
