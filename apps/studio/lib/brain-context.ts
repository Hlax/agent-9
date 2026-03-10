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
  name_status: string | null;
  naming_readiness_score: number | null;
  naming_readiness_notes: string | null;
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
 * When project_id is provided, memory is filtered to that project (and null project) for continuity.
 */
export async function getBrainContext(
  supabase: SupabaseClient | null,
  options?: { identityId?: string | null; project_id?: string | null }
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
    retrieveMemory(fetcher, { limit: 10, project_id: options?.project_id ?? null }),
    getSourceContextForSession(supabase),
  ]);

  const identity: BrainContextIdentity | null = identityRow
    ? {
        identity_id: identityRow.identity_id,
        name: identityRow.name ?? null,
        name_status: identityRow.name_status ?? null,
        naming_readiness_score: identityRow.naming_readiness_score ?? null,
        naming_readiness_notes: identityRow.naming_readiness_notes ?? null,
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
    .select("identity_id, name, name_status, naming_readiness_score, naming_readiness_notes, summary, philosophy, embodiment_direction, habitat_direction")
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
 * Kept bounded to avoid prompt bloat. Used by session/generation path (no per-segment cap).
 */
export function buildWorkingContextString(ctx: BrainContextResult): string {
  const parts: string[] = [];
  if (ctx.identity) {
    const id = ctx.identity;
    const nameAccepted = id.name && id.name_status === "accepted";
    if (nameAccepted) parts.push(`Identity name: ${id.name}`);
    if (id.summary) parts.push(`Summary: ${id.summary.slice(0, 300)}`);
    if (id.philosophy) parts.push(`Philosophy: ${id.philosophy.slice(0, 300)}`);
    if (id.embodiment_direction) parts.push(`Embodiment direction: ${id.embodiment_direction.slice(0, 200)}`);
    if (id.habitat_direction) parts.push(`Habitat direction: ${id.habitat_direction.slice(0, 200)}`);
    if (!nameAccepted && (id.naming_readiness_score != null || id.naming_readiness_notes)) {
      parts.push(
        `Naming readiness: score=${id.naming_readiness_score ?? "—"}, notes=${(id.naming_readiness_notes ?? "").slice(0, 200)}`
      );
    }
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

/** Per-segment character budget for chat so source context is guaranteed. */
export const CHAT_CONTEXT_BUDGET = {
  identity: 800,
  creativeState: 200,
  memory: 600,
  source: 2400,
} as const;

/** Optional identity stability result to include in chat context (computed in chat route). */
export interface IdentityStabilityForContext {
  score: number;
}

/** Optional naming readiness when not yet stored on identity (e.g. evaluated on-demand in chat). */
export interface NamingReadinessForContext {
  score: number;
  notes: string;
}

function sliceToBudget(s: string, budget: number): string {
  if (s.length <= budget) return s;
  return s.slice(0, budget).trim();
}

/**
 * Build working context for chat with structured budgets. Guarantees source context
 * gets up to CHAT_CONTEXT_BUDGET.source chars so it is not crowded out by identity/memory.
 * Session/generation path continues to use buildWorkingContextString (full context).
 * Optionally include identityStability (computed in chat route) in the identity segment.
 * When name is not accepted, namingReadinessOverride (if provided) is used so the Twin always sees a score.
 */
export function buildChatContextWithBudget(
  ctx: BrainContextResult,
  identityStability?: IdentityStabilityForContext | null,
  namingReadinessOverride?: NamingReadinessForContext | null
): string {
  const parts: string[] = [];

  let identityBlock = "";
  if (ctx.identity) {
    const id = ctx.identity;
    const nameAccepted = id.name && id.name_status === "accepted";
    const line: string[] = [];
    if (nameAccepted) line.push(`Identity name: ${id.name}`);
    if (id.summary) line.push(`Summary: ${id.summary.slice(0, 300)}`);
    if (id.philosophy) line.push(`Philosophy: ${id.philosophy.slice(0, 300)}`);
    if (id.embodiment_direction) line.push(`Embodiment direction: ${id.embodiment_direction.slice(0, 200)}`);
    if (id.habitat_direction) line.push(`Habitat direction: ${id.habitat_direction.slice(0, 200)}`);
    if (!nameAccepted) {
      const score = namingReadinessOverride?.score ?? id.naming_readiness_score ?? null;
      const notes = namingReadinessOverride?.notes ?? id.naming_readiness_notes ?? "";
      line.push(
        `Naming readiness: score=${score != null ? score : "—"}, notes=${(notes || "").slice(0, 200)}`
      );
    }
    if (identityStability != null) {
      line.push(`Identity stability score: ${identityStability.score.toFixed(2)}`);
    }
    identityBlock = line.join("\n");
  }
  parts.push(sliceToBudget(identityBlock, CHAT_CONTEXT_BUDGET.identity));

  const creativeLine = `Creative state: tension=${ctx.creativeState.creative_tension.toFixed(2)} recurrence=${ctx.creativeState.idea_recurrence.toFixed(2)} reflection_need=${ctx.creativeState.reflection_need.toFixed(2)}`;
  parts.push(sliceToBudget(creativeLine, CHAT_CONTEXT_BUDGET.creativeState));

  const memoryBlock =
    ctx.memorySummaries.length > 0 ? "Recent memory:\n" + ctx.memorySummaries.join("\n") : "";
  parts.push(sliceToBudget(memoryBlock, CHAT_CONTEXT_BUDGET.memory));

  const sourceBlock = ctx.sourceSummary
    ? "Source context:\n" + ctx.sourceSummary
    : "Source context: (none)";
  parts.push(sliceToBudget(sourceBlock, CHAT_CONTEXT_BUDGET.source));

  return parts.filter(Boolean).join("\n\n");
}
