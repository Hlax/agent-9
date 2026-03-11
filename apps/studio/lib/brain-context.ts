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

/**
 * Translate numeric creative state into natural language phrases for LLM consumption.
 * Returns a concise string of comma-separated phrases (e.g. "high creative tension; recurring ideas").
 */

// Thresholds chosen to map the 0–1 creative state fields onto a readable 3-tier scale:
// "high" (top ~30%), "moderate/some" (middle ~40%), absent/low (bottom ~30%).
// These align with the natural distribution of evolved state values and were chosen so that
// a fresh default state (most fields at 0.5) reads as "moderate creative energy" without noise.
const STATE_NARRATIVE_THRESHOLDS = {
  tension: { high: 0.7, moderate: 0.45 },
  reflectionNeed: { strong: 0.65, some: 0.4 },
  ideaRecurrence: { recurring: 0.55, familiar: 0.35 },
  unfinishedProjects: { present: 0.55 },
  curiosityLevel: { high: 0.65, low: 0.3 },
  explorationRate: { converging: 0.3 },
} as const;

function narrativeCreativeState(state: CreativeStateFields): string {
  const t = STATE_NARRATIVE_THRESHOLDS;
  const phrases: string[] = [];

  if (state.creative_tension > t.tension.high) {
    phrases.push("high creative tension");
  } else if (state.creative_tension > t.tension.moderate) {
    phrases.push("moderate creative energy");
  } else {
    phrases.push("low creative pressure");
  }

  if (state.reflection_need > t.reflectionNeed.strong) {
    phrases.push("strong pull toward reflection");
  } else if (state.reflection_need > t.reflectionNeed.some) {
    phrases.push("some reflective need");
  }

  if (state.idea_recurrence > t.ideaRecurrence.recurring) {
    phrases.push("recurring ideas demanding attention");
  } else if (state.idea_recurrence > t.ideaRecurrence.familiar) {
    phrases.push("familiar ideas resurfacing");
  }

  if (state.unfinished_projects > t.unfinishedProjects.present) {
    phrases.push("unfinished work waiting to be continued");
  }

  if (state.curiosity_level > t.curiosityLevel.high) {
    phrases.push("high curiosity and exploratory drive");
  } else if (state.curiosity_level < t.curiosityLevel.low) {
    phrases.push("consolidating rather than exploring");
  }

  if (state.recent_exploration_rate < t.explorationRate.converging) {
    phrases.push("recent sessions converging rather than exploring");
  }

  return phrases.join("; ") || "balanced creative state";
}

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
 * Build an identity and voice context block for injection into the generation system prompt.
 * Includes identity, narrative creative state, and memory as "recently exploring".
 * Deliberately excludes source items so the generation system prompt stays voice-focused.
 * Callers pass this as `workingContext` to the generation pipeline.
 */
export function buildIdentityVoiceContext(ctx: BrainContextResult): string {
  const parts: string[] = [];
  if (ctx.identity) {
    const id = ctx.identity;
    const nameAccepted = id.name && id.name_status === "accepted";
    if (nameAccepted) {
      parts.push(`Identity: ${id.name}`);
    }
    if (id.summary) parts.push(`Summary: ${id.summary.slice(0, 300)}`);
    if (id.philosophy) parts.push(`Philosophy: ${id.philosophy.slice(0, 300)}`);
    if (id.embodiment_direction) parts.push(`Embodiment: ${id.embodiment_direction.slice(0, 200)}`);
    if (id.habitat_direction) parts.push(`Habitat direction: ${id.habitat_direction.slice(0, 200)}`);
  }
  const stateNarrative = narrativeCreativeState(ctx.creativeState);
  parts.push(`Current creative state: ${stateNarrative}`);
  if (ctx.memorySummaries.length > 0) {
    parts.push(
      "Recently exploring:\n" + ctx.memorySummaries.map((s) => `- ${s}`).join("\n")
    );
  }
  return parts.filter(Boolean).join("\n\n");
}

/**
 * Build a single Working Context string from brain context for the generation prompt.
 * Kept bounded to avoid prompt bloat. Used by session/generation path (no per-segment cap).
 * Uses narrative creative state and "Recently exploring" memory framing for better LLM utility.
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
  const stateNarrative = narrativeCreativeState(ctx.creativeState);
  parts.push(`Creative state: ${stateNarrative}`);
  if (ctx.memorySummaries.length > 0) {
    parts.push("Recently exploring:\n" + ctx.memorySummaries.map((s) => `- ${s}`).join("\n"));
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

  const creativeLine = `Creative state: ${narrativeCreativeState(ctx.creativeState)}`;
  parts.push(sliceToBudget(creativeLine, CHAT_CONTEXT_BUDGET.creativeState));

  const memoryBlock =
    ctx.memorySummaries.length > 0
      ? "Recently exploring:\n" + ctx.memorySummaries.map((s) => `- ${s}`).join("\n")
      : "";
  parts.push(sliceToBudget(memoryBlock, CHAT_CONTEXT_BUDGET.memory));

  const sourceBlock = ctx.sourceSummary
    ? "Source context:\n" + ctx.sourceSummary
    : "Source context: (none)";
  parts.push(sliceToBudget(sourceBlock, CHAT_CONTEXT_BUDGET.source));

  return parts.filter(Boolean).join("\n\n");
}
