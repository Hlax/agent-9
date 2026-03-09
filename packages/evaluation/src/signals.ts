/**
 * Evaluation signals: derive structured scores from critique (and context).
 * Canon: docs/03_governance/evaluation_signals.md. Evaluation is distinct from critique and approval.
 */

import type { CritiqueRecord, EvaluationSignal } from "@twin/core";

export interface EvaluationInput {
  target_type: "artifact" | "idea" | "idea_thread" | "session";
  target_id: string;
  /** Critique record to derive signals from. */
  critique?: CritiqueRecord | null;
  /** Optional: prior context for recurrence. */
  priorSummary?: string | null;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Derive alignment_score, emergence_score, fertility_score, pull_score, recurrence_score
 * from the critique record. Scores 0.0–1.0. Does not write approval or publication.
 */
export function computeEvaluationSignals(input: EvaluationInput): EvaluationSignal {
  const now = new Date().toISOString();
  const c = input.critique;

  if (!c) {
    return {
      evaluation_signal_id: crypto.randomUUID(),
      target_type: input.target_type,
      target_id: input.target_id,
      alignment_score: 0.5,
      emergence_score: 0.5,
      fertility_score: 0.5,
      pull_score: 0.5,
      recurrence_score: null,
      resonance_score: null,
      rationale: "No critique provided.",
      created_at: now,
      updated_at: now,
    };
  }

  const outcome = c.critique_outcome ?? "continue";
  const hasNotes =
    [c.intent_note, c.strength_note, c.potential_note, c.fertility_note].filter(
      (n) => n && n.length > 0
    ).length;

  const base = 0.4 + (hasNotes / 4) * 0.3;

  let alignment_score = base;
  let emergence_score = base;
  let fertility_score = base;
  let pull_score = base;
  let recurrence_score: number | null = null;

  switch (outcome) {
    case "continue":
      pull_score = 0.7;
      fertility_score = 0.6;
      break;
    case "branch":
      emergence_score = 0.75;
      fertility_score = 0.8;
      pull_score = 0.6;
      break;
    case "shift_medium":
      emergence_score = 0.65;
      alignment_score = 0.5;
      break;
    case "reflect":
      recurrence_score = 0.6;
      pull_score = 0.5;
      break;
    case "archive_candidate":
      pull_score = 0.35;
      fertility_score = 0.35;
      alignment_score = 0.45;
      break;
    case "stop":
      pull_score = 0.25;
      fertility_score = 0.3;
      alignment_score = 0.4;
      break;
    default:
      break;
  }

  if (c.fertility_note && c.fertility_note.length > 20) {
    fertility_score = clamp01(fertility_score + 0.1);
  }
  if (c.strength_note && c.strength_note.length > 20) {
    alignment_score = clamp01(alignment_score + 0.1);
  }

  const rationale =
    c.overall_summary?.slice(0, 500) ?? `Derived from outcome: ${outcome}.`;

  return {
    evaluation_signal_id: crypto.randomUUID(),
    target_type: input.target_type,
    target_id: input.target_id,
    alignment_score: clamp01(alignment_score),
    emergence_score: clamp01(emergence_score),
    fertility_score: clamp01(fertility_score),
    pull_score: clamp01(pull_score),
    recurrence_score: recurrence_score !== null ? clamp01(recurrence_score) : null,
    resonance_score: null,
    rationale,
    created_at: now,
    updated_at: now,
  };
}
