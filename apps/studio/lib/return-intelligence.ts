/**
 * Return Intelligence V1 — archive candidate scoring for return mode.
 * Used only during focus selection when sessionMode === "return".
 * Does not change mode selection, governance, or public mutation.
 */

/** Single archive candidate row as loaded for scoring. */
export interface ArchiveCandidateRow {
  project_id: string | null;
  idea_thread_id: string | null;
  idea_id: string | null;
  artifact_id: string | null;
  recurrence_score: number | null;
  creative_pull: number | null;
  created_at: string | null;
}

/** Per-candidate score breakdown (debug-friendly). */
export interface ReturnScoreBreakdown {
  tension_alignment: number;
  recurrence_weight: number;
  critique_weight: number;
  age_weight: number;
  exploration_noise: number;
  return_score: number;
}

/** Ranked candidate with breakdown for debug. */
export interface RankedCandidate {
  index: number;
  candidate: ArchiveCandidateRow;
  breakdown: ReturnScoreBreakdown;
}

/** Context for scoring: current tensions and optional artifact/critique signals. */
export interface ReturnScoringContext {
  /** Current tension kinds (e.g. identity_pressure, backlog_pressure, recurrence_pull). */
  tensionKinds: string[];
  /** Artifact medium by artifact_id for tension alignment (e.g. "image" → identity). */
  artifactMediumByArtifactId: Record<string, string>;
  /** Artifact IDs that have an associated critique (unresolved/improvement). */
  hasCritiqueByArtifactId: Set<string>;
  /** Current time ms for age weight. */
  nowMs: number;
  /** Max exploration noise (bounded). Default 0.05. */
  explorationNoiseMax?: number;
  /** Age weight cap. Default 0.15. */
  ageWeightCap?: number;
}

/** Result of scoring: ranked list and selected index (argmax of return_score). */
export interface ReturnScoringResult {
  ranked: RankedCandidate[];
  selectedIndex: number;
}

const DEFAULT_EXPLORATION_NOISE_MAX = 0.05;
const DEFAULT_AGE_WEIGHT_CAP = 0.15;
/** Tension alignment is strongest: scale so it can dominate. Max ~0.45. */
const TENSION_ALIGNMENT_MAX = 0.45;
/** Recurrence + pull: reuse existing logic, max ~0.35. */
const RECURRENCE_WEIGHT_MAX = 0.35;
/** Critique bonus: max ~0.15. */
const CRITIQUE_WEIGHT_MAX = 0.15;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
}

/** Exploration noise: bounded random in [0, cap]. */
function explorationNoise(cap: number): number {
  return Math.random() * Math.max(0, cap);
}

/** Tension alignment: candidate relevance to current tension kinds. Strongest signal. */
function tensionAlignment(
  candidate: ArchiveCandidateRow,
  tensionKinds: string[],
  artifactMediumByArtifactId: Record<string, string>
): number {
  if (tensionKinds.length === 0) return 0.2; // neutral when no tensions
  const medium = candidate.artifact_id
    ? artifactMediumByArtifactId[candidate.artifact_id] ?? null
    : null;
  const isIdentityRelated = medium === "image" || medium === "concept";
  const isSurfaceRelated = medium === "writing" || medium === "concept";
  let score = 0.15; // base
  for (const t of tensionKinds) {
    if (t === "identity_pressure" && isIdentityRelated) score += 0.25;
    else if ((t === "backlog_pressure" || t === "surface_pressure") && isSurfaceRelated) score += 0.2;
    else if (t === "unfinished_pull" || t === "recurrence_pull") score += 0.1; // any candidate can address pull
  }
  return clamp01(score) * TENSION_ALIGNMENT_MAX;
}

/** Recurrence weight: existing recurrence_score and creative_pull. */
function recurrenceWeight(candidate: ArchiveCandidateRow): number {
  const r = clamp01((candidate.recurrence_score as number) ?? 0.5);
  const p = clamp01((candidate.creative_pull as number) ?? 0.5);
  return (r * 0.6 + p * 0.4) * RECURRENCE_WEIGHT_MAX;
}

/** Critique weight: bonus when candidate has unresolved critique. */
function critiqueWeight(
  candidate: ArchiveCandidateRow,
  hasCritiqueByArtifactId: Set<string>
): number {
  if (!candidate.artifact_id) return 0;
  return hasCritiqueByArtifactId.has(candidate.artifact_id) ? CRITIQUE_WEIGHT_MAX : 0;
}

/** Age weight: small bonus for older candidates (tiebreaker / long-cycle synthesis). */
function ageWeight(
  candidate: ArchiveCandidateRow,
  nowMs: number,
  cap: number
): number {
  const created = candidate.created_at ? new Date(candidate.created_at).getTime() : nowMs;
  const daysSince = (nowMs - created) / (24 * 60 * 60 * 1000);
  if (daysSince <= 0) return 0;
  const raw = Math.min(1, daysSince / 365) * cap; // linear over first year, then flat
  return raw;
}

/**
 * Score all candidates and return ranked list plus selected index (argmax of return_score).
 * exploration_noise is added per candidate so selection can vary; selectedIndex = index of max return_score.
 */
export function scoreReturnCandidates(
  candidates: ArchiveCandidateRow[],
  context: ReturnScoringContext
): ReturnScoringResult {
  const noiseMax = context.explorationNoiseMax ?? DEFAULT_EXPLORATION_NOISE_MAX;
  const ageCap = context.ageWeightCap ?? DEFAULT_AGE_WEIGHT_CAP;

  const ranked: RankedCandidate[] = candidates.map((candidate, index) => {
    const tension = tensionAlignment(
      candidate,
      context.tensionKinds,
      context.artifactMediumByArtifactId
    );
    const recurrence = recurrenceWeight(candidate);
    const critique = critiqueWeight(candidate, context.hasCritiqueByArtifactId);
    const age = ageWeight(candidate, context.nowMs, ageCap);
    const noise = explorationNoise(noiseMax);

    const return_score = tension + recurrence + critique + age + noise;
    const breakdown: ReturnScoreBreakdown = {
      tension_alignment: tension,
      recurrence_weight: recurrence,
      critique_weight: critique,
      age_weight: age,
      exploration_noise: noise,
      return_score,
    };
    return { index, candidate, breakdown };
  });

  ranked.sort((a, b) => b.breakdown.return_score - a.breakdown.return_score);
  const selectedIndex = ranked.length > 0 ? ranked[0]!.index : 0;

  return { ranked, selectedIndex };
}

/**
 * Build a debug payload for the selected candidate and top N candidates.
 */
export function buildReturnSelectionDebug(
  result: ReturnScoringResult,
  tensionKinds: string[],
  topN: number = 5
): {
  selected: RankedCandidate | null;
  topCandidates: RankedCandidate[];
  tensionKinds: string[];
} {
  const topCandidates = result.ranked.slice(0, topN);
  const selected =
    result.ranked.find((r) => r.index === result.selectedIndex) ?? topCandidates[0] ?? null;
  return {
    selected,
    topCandidates,
    tensionKinds,
  };
}
