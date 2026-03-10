/**
 * Identity signal weighting model. Canon: twin_seed_quality_and_identity_signal_model.md.
 * Computes identity_stability_score from seeds, convergence, session/artifact/memory evidence,
 * evaluation consistency, and contradiction penalty. Seeds influence strongly early; experience
 * signals grow over time.
 */

import type { getSupabaseServer } from "@/lib/supabase-server";
import { getLatestCreativeState } from "@/lib/creative-state-load";

type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseServer>>;

export interface IdentityStabilityResult {
  score: number;
  breakdown: {
    seed_strength: number;
    source_convergence: number;
    session_evidence: number;
    artifact_pattern_strength: number;
    memory_confirmation: number;
    evaluation_consistency: number;
    contradiction_penalty: number;
  };
}

const WEIGHTS = {
  seed_strength: 0.3,
  source_convergence: 0.2,
  session_evidence: 0.15,
  artifact_pattern_strength: 0.15,
  memory_confirmation: 0.1,
  evaluation_consistency: 0.1,
  contradiction_penalty: 0.15,
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Compute identity stability score from current DB state.
 * Some signals are heuristic in V1 (e.g. source_convergence, artifact_pattern_strength).
 */
export async function computeIdentityStabilityScore(
  supabase: SupabaseClient
): Promise<IdentityStabilityResult> {
  const [
    identityRes,
    sourcesResult,
    sessionCountRes,
    artifactCountRes,
    memoryCountRes,
    { state: creativeState },
  ] = await Promise.all([
    supabase
      .from("identity")
      .select("summary, philosophy, embodiment_direction, habitat_direction")
      .eq("is_active", true)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("source_item")
      .select("source_type, identity_weight, tags, ontology_notes, identity_relevance_notes")
      .in("source_type", ["identity_seed", "reference"])
      .limit(50),
    supabase.from("creative_session").select("session_id", { count: "exact", head: true }),
    supabase.from("artifact").select("artifact_id", { count: "exact", head: true }),
    supabase.from("memory_record").select("memory_record_id", { count: "exact", head: true }),
    getLatestCreativeState(supabase),
  ]);

  const identity = identityRes?.data ?? null;
  const sources = sourcesResult.data ?? [];
  const sessionCount = sessionCountRes.count ?? 0;
  const artifactCount = artifactCountRes.count ?? 0;
  const memoryCount = memoryCountRes.count ?? 0;

  const seed_strength = computeSeedStrength(sources);
  const source_convergence = computeSourceConvergence(sources);
  const session_evidence = clamp01(Math.min(1, sessionCount / 10));
  const artifact_pattern_strength = clamp01(Math.min(1, artifactCount / 8));
  const memory_confirmation = memoryCount > 0 ? 0.5 + 0.5 * Math.min(1, memoryCount / 5) : 0.3;
  const evaluation_consistency = (creativeState.identity_stability + creativeState.idea_recurrence) / 2;
  const contradiction_penalty = 0;

  const score = clamp01(
    WEIGHTS.seed_strength * seed_strength +
      WEIGHTS.source_convergence * source_convergence +
      WEIGHTS.session_evidence * session_evidence +
      WEIGHTS.artifact_pattern_strength * artifact_pattern_strength +
      WEIGHTS.memory_confirmation * memory_confirmation +
      WEIGHTS.evaluation_consistency * evaluation_consistency -
      WEIGHTS.contradiction_penalty * contradiction_penalty
  );

  return {
    score,
    breakdown: {
      seed_strength,
      source_convergence,
      session_evidence,
      artifact_pattern_strength,
      memory_confirmation,
      evaluation_consistency,
      contradiction_penalty,
    },
  };
}

function computeSeedStrength(
  sources: {
    source_type?: string | null;
    identity_weight?: number | null;
    tags?: string[] | null;
    ontology_notes?: string | null;
    identity_relevance_notes?: string | null;
  }[]
): number {
  if (sources.length === 0) return 0;
  const identitySeedCount = sources.filter((s) => s.source_type === "identity_seed").length;
  const weights = sources.map((s) => (s.identity_weight != null ? s.identity_weight : 0.5));
  const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length;
  const annotationFactor = sources.filter(
    (s) =>
      (s.tags?.length ?? 0) > 0 ||
      (s.ontology_notes?.trim()?.length ?? 0) > 0 ||
      (s.identity_relevance_notes?.trim()?.length ?? 0) > 0
  ).length / Math.max(sources.length, 1);
  const annotationQuality = 0.5 + 0.5 * annotationFactor;
  const seedFactor = Math.min(1, identitySeedCount / 5) * 0.6 + 0.4;
  return clamp01(avgWeight * annotationQuality * seedFactor);
}

function computeSourceConvergence(
  sources: { identity_weight?: number | null; source_type?: string | null }[]
): number {
  if (sources.length < 2) return sources.length > 0 ? 0.6 : 0.5;
  const weights = sources.map((s) => (s.identity_weight != null ? s.identity_weight : 0.5));
  const mean = weights.reduce((a, b) => a + b, 0) / weights.length;
  const variance = weights.reduce((sum, w) => sum + (w - mean) ** 2, 0) / weights.length;
  const lowVariance = Math.max(0, 1 - variance * 4);
  return clamp01(0.3 + 0.7 * lowVariance);
}
