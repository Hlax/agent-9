/**
 * Naming readiness evaluator. Canon: docs/05_build/twin_naming_design.md.
 * Computes 0–1 score from identity coherence, source strength, annotations, recurrence, memory.
 */

import type { getSupabaseServer } from "@/lib/supabase-server";
import { getLatestCreativeState } from "@/lib/creative-state-load";

type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseServer>>;

export interface NamingReadinessResult {
  score: number;
  notes: string;
}

const WEIGHTS = {
  coherence: 0.25,
  sourceStrength: 0.2,
  annotationQuality: 0.15,
  recurrence: 0.15,
  memory: 0.1,
  harveySignal: 0.1,
  contradiction: 0.15,
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Compute naming readiness from current identity, sources, creative state, and memory.
 * Does not write to DB.
 */
export async function evaluateNamingReadiness(
  supabase: SupabaseClient
): Promise<NamingReadinessResult> {
  const [identityRes, sourcesResult, { state: creativeState }, memoryCountResult] = await Promise.all([
    supabase
      .from("identity")
      .select("summary, philosophy, embodiment_direction, habitat_direction")
      .eq("is_active", true)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("source_item")
      .select("source_type, identity_weight, tags, ontology_notes, identity_relevance_notes")
      .in("source_type", ["identity_seed", "reference"])
      .limit(30),
    getLatestCreativeState(supabase),
    supabase.from("memory_record").select("memory_record_id", { count: "exact", head: true }),
  ]);

  const identity = identityRes?.data ?? null;
  const sources = sourcesResult.data ?? [];
  const memoryCount = memoryCountResult.count ?? 0;

  const coherence = structuredCoherence(identity);
  const { strength: sourceStrength, harveySignal } = sourceSignals(sources);
  const annotationQuality = annotationQualityScore(sources);
  const recurrence = typeof creativeState.idea_recurrence === "number" ? creativeState.idea_recurrence : 0.5;
  const memory = memoryCount > 0 ? 0.5 + 0.5 * Math.min(1, memoryCount / 5) : 0.3;
  const contradiction = 0;

  const score = clamp01(
    WEIGHTS.coherence * coherence +
      WEIGHTS.sourceStrength * sourceStrength +
      WEIGHTS.annotationQuality * annotationQuality +
      WEIGHTS.recurrence * recurrence +
      WEIGHTS.memory * memory +
      WEIGHTS.harveySignal * harveySignal -
      WEIGHTS.contradiction * contradiction
  );

  const notes = [
    coherence >= 0.5 ? "Strong identity fields" : "Weak or missing identity fields",
    sourceStrength >= 0.5 ? "Good identity_seed/reference base" : "Few or light identity sources",
    annotationQuality >= 0.5 ? "Rich annotations" : "Sparse annotations",
    recurrence >= 0.5 ? "Recurrence present" : "Low recurrence",
    memoryCount > 0 ? `${memoryCount} memory records` : "No memory yet",
    contradiction > 0 ? "Some contradiction detected" : "No contradiction",
  ].join("; ");

  return { score, notes };
}

function structuredCoherence(identity: {
  summary?: string | null;
  philosophy?: string | null;
  embodiment_direction?: string | null;
  habitat_direction?: string | null;
} | null): number {
  if (!identity) return 0;
  const fields = [
    identity.summary?.trim(),
    identity.philosophy?.trim(),
    identity.embodiment_direction?.trim(),
    identity.habitat_direction?.trim(),
  ];
  const filled = fields.filter((f) => f && f.length > 0).length;
  const withContent = fields.filter((f) => f && f.length >= 50).length;
  return clamp01((filled / 4) * 0.6 + (withContent / 4) * 0.4);
}

function sourceSignals(
  sources: { source_type?: string | null; identity_weight?: number | null }[]
): { strength: number; harveySignal: number } {
  if (sources.length === 0) return { strength: 0, harveySignal: 0 };
  const identitySeedCount = sources.filter((s) => s.source_type === "identity_seed").length;
  const weights = sources.map((s) => (s.identity_weight != null ? s.identity_weight : 0.5));
  const avgWeight = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : 0.5;
  const strength = clamp01((Math.min(identitySeedCount, 5) / 5) * 0.6 + avgWeight * 0.4);
  const highWeightCount = sources.filter((s) => (s.identity_weight ?? 0) > 0.7).length;
  const harveySignal = clamp01((Math.min(identitySeedCount, 5) / 5) * 0.6 + (highWeightCount / Math.max(sources.length, 1)) * 0.4);
  return { strength, harveySignal };
}

function annotationQualityScore(
  sources: {
    tags?: string[] | null;
    ontology_notes?: string | null;
    identity_relevance_notes?: string | null;
  }[]
): number {
  if (sources.length === 0) return 0;
  const withAny = sources.filter(
    (s) =>
      (s.tags?.length ?? 0) > 0 || (s.ontology_notes?.trim()?.length ?? 0) > 0 || (s.identity_relevance_notes?.trim()?.length ?? 0) > 0
  ).length;
  const withMultiple = sources.filter((s) => {
    let n = 0;
    if (s.tags?.length) n++;
    if (s.ontology_notes?.trim()) n++;
    if (s.identity_relevance_notes?.trim()) n++;
    return n >= 2;
  }).length;
  return clamp01((withAny / sources.length) * 0.5 + (withMultiple / sources.length) * 0.5);
}
