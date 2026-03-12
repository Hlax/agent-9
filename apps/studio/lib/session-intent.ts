/**
 * Session Intent / Continuity Layer (Active Session Intent).
 * Thin layer above the closed runtime loop: "Given what just happened across recent
 * sessions, what is this system trying to do next?" Produces a small intent packet
 * that biases mode/drive/focus softly — never a hard lock.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type IntentStatus = "active" | "fulfilled" | "abandoned" | "superseded";
export type IntentKind = "explore" | "refine" | "consolidate" | "reflect" | "return";

export interface RuntimeIntentRow {
  intent_id: string;
  created_at: string;
  updated_at: string;
  status: IntentStatus;
  intent_kind: IntentKind;
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

/** Normalized intent for session-runner (no DB-only fields). */
export interface ActiveIntent {
  intent_id: string;
  intent_kind: IntentKind;
  target_project_id: string | null;
  target_thread_id: string | null;
  target_artifact_family: string | null;
  reason_summary: string | null;
  confidence: number | null;
  source_session_id: string | null;
  last_reinforced_session_id: string | null;
}

/**
 * Load the latest active intent (status = 'active'). At most one active intent at a time.
 * Returns null when no active intent or when supabase is null.
 */
export async function getActiveIntent(
  supabase: SupabaseClient | null
): Promise<ActiveIntent | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("runtime_intent")
    .select("intent_id, intent_kind, target_project_id, target_thread_id, target_artifact_family, reason_summary, confidence, source_session_id, last_reinforced_session_id")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as ActiveIntent;
}

/** Input for post-session intent update (avoid coupling to full SessionExecutionState). */
export interface IntentUpdateInput {
  sessionId: string;
  sessionMode: string;
  selectedProjectId: string | null;
  selectedThreadId: string | null;
  selectedIdeaId: string | null;
  confidence: number;
  repetitionDetected: boolean;
  proposalCreated: boolean;
  recurrenceUpdated: boolean;
  /** From synthesis pressure: return_success_trend (0–1). */
  returnSuccessTrend?: number;
  /** From synthesis pressure: repetition_without_movement_penalty (0–1). */
  repetitionPenalty?: number;
}

export type IntentOutcome = "continue" | "fulfill" | "abandon" | "supersede" | "create";

/**
 * Decide intent outcome after a session: continue, fulfill, abandon, supersede, or create new.
 * Minimal v1 rules; intent is revisable — soft commitment only.
 */
export function deriveIntentOutcome(
  current: ActiveIntent | null,
  input: IntentUpdateInput
): IntentOutcome {
  const conf = input.confidence;
  const rep = input.repetitionDetected;
  const penalty = input.repetitionPenalty ?? 0;
  const trend = input.returnSuccessTrend ?? 0.5;

  if (!current) {
    return "create";
  }

  // Abandon: repeated low confidence or repetition without movement
  if (conf < 0.4 || (rep && penalty > 0.5)) {
    return "abandon";
  }

  // Same thread reinforced (session selected same project/thread as intent target)
  const sameThread =
    (current.target_project_id && current.target_project_id === input.selectedProjectId) ||
    (current.target_thread_id && current.target_thread_id === input.selectedThreadId);

  if (sameThread && conf >= 0.5 && !rep) {
    return "continue";
  }

  // Fulfill: strong result (proposal created or recurrence updated, good confidence)
  if ((input.proposalCreated || input.recurrenceUpdated) && conf >= 0.6 && trend >= 0.5) {
    return "fulfill";
  }

  // Supersede: session went somewhere else and had decent outcome (different thread, good conf)
  if (!sameThread && input.selectedProjectId && conf >= 0.5) {
    return "supersede";
  }

  return "continue";
}

/** Map session mode to intent_kind for new intents. */
export function intentKindFromSessionMode(mode: string): IntentKind {
  switch (mode) {
    case "reflect":
      return "reflect";
    case "return":
      return "return";
    case "explore":
      return "explore";
    case "continue":
      return "refine";
    case "rest":
      return "consolidate";
    default:
      return "explore";
  }
}

const NOW = () => new Date().toISOString();

/**
 * After trajectory review: update or create runtime intent.
 * Call from session-runner on both artifact and no-artifact paths when supabase + session exist.
 * Does not fail the session on error — returns null and caller can log.
 */
export async function updateSessionIntent(
  supabase: SupabaseClient | null,
  input: IntentUpdateInput,
  currentIntent: ActiveIntent | null
): Promise<{ updated: boolean; newIntentId: string | null }> {
  if (!supabase) return { updated: false, newIntentId: null };
  const outcome = deriveIntentOutcome(currentIntent, input);

  try {
    if (currentIntent && outcome !== "create") {
      const status: IntentStatus =
        outcome === "continue" ? "active" : outcome === "fulfill" ? "fulfilled" : outcome === "abandon" ? "abandoned" : "superseded";
      const { error: updateError } = await supabase
        .from("runtime_intent")
        .update({
          updated_at: NOW(),
          status,
          last_reinforced_session_id: outcome === "continue" ? input.sessionId : currentIntent.last_reinforced_session_id,
        })
        .eq("intent_id", currentIntent.intent_id);
      if (updateError) {
        console.warn("[session-intent] update failed", updateError);
        return { updated: false, newIntentId: null };
      }
      if (outcome === "continue") return { updated: true, newIntentId: currentIntent.intent_id };
      // fulfilled/abandoned/superseded: fall through to optionally create new
    }

    if (outcome === "create" || outcome === "fulfill" || outcome === "abandon" || outcome === "supersede") {
      const intent_kind = intentKindFromSessionMode(input.sessionMode);
      const row = {
        status: "active" as const,
        intent_kind,
        target_project_id: input.selectedProjectId ?? null,
        target_thread_id: input.selectedThreadId ?? null,
        target_artifact_family: null as string | null,
        reason_summary: `Session ${input.sessionId}: ${input.sessionMode} → ${intent_kind}`,
        evidence_json: {
          confidence: input.confidence,
          repetition_detected: input.repetitionDetected,
          proposal_created: input.proposalCreated,
          recurrence_updated: input.recurrenceUpdated,
        } as Record<string, unknown>,
        confidence: input.confidence,
        exit_conditions_json: null as Record<string, unknown> | null,
        source_session_id: input.sessionId,
        last_reinforced_session_id: input.sessionId,
      };
      const { data: inserted, error: insertError } = await supabase
        .from("runtime_intent")
        .insert(row)
        .select("intent_id")
        .single();
      if (insertError) {
        console.warn("[session-intent] insert failed", insertError);
        return { updated: false, newIntentId: null };
      }
      return { updated: true, newIntentId: (inserted as { intent_id: string })?.intent_id ?? null };
    }

    return { updated: true, newIntentId: currentIntent?.intent_id ?? null };
  } catch (e) {
    console.warn("[session-intent] error", e);
    return { updated: false, newIntentId: null };
  }
}
