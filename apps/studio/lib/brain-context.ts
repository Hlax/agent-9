/**
 * Brain context (Working Context / Layer A). Plan §4, §7.
 * Assembles identity, last creative state, recent memory, source summary for the session.
 */

import type { getSupabaseServer } from "@/lib/supabase-server";
import { getLatestCreativeState } from "@/lib/creative-state-load";
import { getSourceContextForSession } from "@/lib/source-context";
import { retrieveMemory } from "@twin/memory";
import { createMemoryFetcher } from "@/lib/memory-fetcher";
import type { CreativeStateFields } from "@twin/evaluation";

type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseServer>>;

const MAX_MEMORY_SUMMARY_CHARS = 200;

export interface BrainContextIdentity {
  identity_id: string;
  name: string | null;
  summary: string | null;
  philosophy: string | null;
  embodiment_direction: string | null;
  habitat_direction: string | null;
}

export interface BrainContextResult {
  identity: BrainContextIdentity | null;
  creativeState: CreativeStateFields;
  memorySummaries: string[];
  sourceSummary: string | null;
}

/**
 * Load full brain context: identity, latest creative state, recent memory records, source summary.
 * Caller uses this to build the Working Context (Layer A) string for the LLM.
 */
export async function getBrainContext(
  supabase: SupabaseClient | null,
  _options?: { identityId?: string | null }
): Promise<BrainContextResult> {
  if (!supabase) {
    const { defaultCreativeState } = await import("@twin/evaluation");
    return {
      identity: null,
      creativeState: defaultCreativeState(),
      memorySummaries: [],
      sourceSummary: null,
    };
  }

  const fetcher = await createMemoryFetcher(supabase);
  const [identityRow, { state: creativeState }, retrievedMemories, sourceSummary] = await Promise.all([
    loadActiveIdentity(supabase),
    getLatestCreativeState(supabase),
    retrieveMemory(fetcher, { limit: 10 }),
    getSourceContextForSession(supabase),
  ]);

  const identity: BrainContextIdentity | null = identityRow
    ? {
        identity_id: identityRow.identity_id,
        name: identityRow.name ?? null,
        summary: identityRow.summary ?? null,
        philosophy: identityRow.philosophy ?? null,
        embodiment_direction: identityRow.embodiment_direction ?? null,
        habitat_direction: identityRow.habitat_direction ?? null,
      }
    : null;

  const memorySummaries = retrievedMemories.map((r) => {
    const s = r.summary.slice(0, MAX_MEMORY_SUMMARY_CHARS);
    return s ? `[${r.memory_type}] ${s}` : "";
  }).filter(Boolean);

  return {
    identity,
    creativeState,
    memorySummaries,
    sourceSummary,
  };
}

async function loadActiveIdentity(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("identity")
    .select("identity_id, name, summary, philosophy, embodiment_direction, habitat_direction")
    .eq("is_active", true)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data;
}

/**
 * Build a single Working Context string from brain context for the generation prompt.
 * Kept bounded to avoid prompt bloat.
 */
export function buildWorkingContextString(ctx: BrainContextResult): string {
  const parts: string[] = [];
  if (ctx.identity) {
    const id = ctx.identity;
    if (id.name) parts.push(`Identity name: ${id.name}`);
    if (id.summary) parts.push(`Summary: ${id.summary.slice(0, 300)}`);
    if (id.embodiment_direction) parts.push(`Embodiment direction: ${id.embodiment_direction.slice(0, 200)}`);
    if (id.habitat_direction) parts.push(`Habitat direction: ${id.habitat_direction.slice(0, 200)}`);
  }
  parts.push(
    `Creative state: tension=${ctx.creativeState.creative_tension.toFixed(2)} recurrence=${ctx.creativeState.idea_recurrence.toFixed(2)} reflection_need=${ctx.creativeState.reflection_need.toFixed(2)}`
  );
  if (ctx.memorySummaries.length > 0) {
    parts.push("Recent memory:\n" + ctx.memorySummaries.join("\n"));
  }
  if (ctx.sourceSummary) {
    parts.push("Source context:\n" + ctx.sourceSummary.slice(0, 3000));
  }
  return parts.join("\n\n");
}
