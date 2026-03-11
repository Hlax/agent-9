import type { SupabaseClient } from "@supabase/supabase-js";

export interface DeliberationTraceInput {
  supabase: SupabaseClient;
  session_id: string;
  observations_json?: Record<string, unknown> | null;
  state_summary?: string | null;
  tensions_json?: Record<string, unknown> | null;
  hypotheses_json?: Record<string, unknown> | null;
  evidence_checked_json?: Record<string, unknown> | null;
  rejected_alternatives_json?: Record<string, unknown> | null;
  chosen_action?: string | null;
  confidence?: number | null;
  execution_mode?: string | null;
  human_gate_reason?: string | null;
  outcome_summary?: string | null;
}

/**
 * Persist a structured deliberation_trace row derived from runtime execution state.
 * Call this once per session (or per major stage) with structured JSON first,
 * narrative fields second.
 */
export async function writeDeliberationTrace(input: DeliberationTraceInput): Promise<void> {
  const now = new Date().toISOString();
  const row = {
    session_id: input.session_id,
    observations_json: input.observations_json ?? null,
    state_summary: input.state_summary ?? null,
    tensions_json: input.tensions_json ?? null,
    hypotheses_json: input.hypotheses_json ?? null,
    evidence_checked_json: input.evidence_checked_json ?? null,
    rejected_alternatives_json: input.rejected_alternatives_json ?? null,
    chosen_action: input.chosen_action ?? null,
    confidence: input.confidence ?? null,
    execution_mode: input.execution_mode ?? null,
    human_gate_reason: input.human_gate_reason ?? null,
    outcome_summary: input.outcome_summary ?? null,
    created_at: now,
    updated_at: now,
  };
  const { error } = await input.supabase.from("deliberation_trace").insert(row);
  if (error) {
    throw new Error(`deliberation_trace insert failed: ${error.message}`);
  }
}

