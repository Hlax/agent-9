/**
 * Repetition detection: same critique outcome in recent artifacts.
 * Canon: stop-limit logic, critique loop detection.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getRepetitionWindow } from "./stop-limits";
import { REPETITION_THRESHOLD } from "./stop-limits";

/**
 * Returns true if the last N critique_record rows have at least REPETITION_THRESHOLD
 * with the same critique_outcome (including the one just added).
 * Used to bump reflection_need so the next session tends to reflect.
 */
export async function detectRepetition(
  supabase: SupabaseClient,
  currentOutcome: string | null
): Promise<boolean> {
  const window = getRepetitionWindow();
  const { data: rows } = await supabase
    .from("critique_record")
    .select("critique_outcome")
    .order("created_at", { ascending: false })
    .limit(window);

  if (!rows?.length) return false;
  const outcomes = rows.map((r) => (r.critique_outcome ?? "") as string);
  const same = outcomes.filter((o) => o === (currentOutcome ?? "")).length;
  return same >= REPETITION_THRESHOLD;
}
