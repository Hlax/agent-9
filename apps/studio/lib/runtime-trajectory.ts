import type { TwinSeedConfig } from "@/lib/twin-seed-config";
import type { StyleProfile } from "@/lib/style-profile";
import type { SynthesisPressurePayload } from "@/lib/synthesis-pressure";
import type { ConceptFamilyRuntimeSummary } from "@/lib/proposal-families";

export type TrajectoryMode = "explore" | "reinforce" | "consolidate" | "diversify" | "reflect";

export type TrajectoryStyleDirection =
  | "reinforce_dominant"
  | "explore_emerging"
  | "reduce_repetition"
  | "open";

export type TrajectoryProposalPressure = "low" | "normal" | "high";

export interface RuntimeRelationshipSummary {
  duplicates_recent: number;
  refinements_recent: number;
  alternatives_recent: number;
  successors_recent: number;
  unrelated_recent: number;
  dominant_relationship_pattern: string | null;
}

export interface RuntimeTrajectory {
  mode: TrajectoryMode;
  horizon_sessions: number;
  reason: string;
  focus_bias?: string[];
  style_direction?: TrajectoryStyleDirection;
  proposal_pressure?: TrajectoryProposalPressure;
}

interface TrajectoryInputs {
  seed: TwinSeedConfig;
  styleProfile: StyleProfile | null;
  stylePressureExplanation: string | null;
  repeatedTitles: string[];
  backlogArtifacts: {
    total: number;
    reviewable: number;
    approval_candidates: number;
  };
  synthesisPressure: SynthesisPressurePayload | null;
  relationshipSummary?: RuntimeRelationshipSummary | null;
  conceptFamilySummary?: ConceptFamilyRuntimeSummary | null;
}

/**
 * Derive a lightweight runtime trajectory from existing observability signals.
 * Rules are intentionally simple, colocated, and advisory-only. They do not
 * affect governance, proposal FSMs, or persistence behavior.
 */
export function deriveRuntimeTrajectory(input: TrajectoryInputs): RuntimeTrajectory {
  const {
    seed,
    styleProfile,
    stylePressureExplanation,
    repeatedTitles,
    backlogArtifacts,
    synthesisPressure,
    relationshipSummary,
    conceptFamilySummary,
  } = input;

  const stylePressure = styleProfile?.pressure ?? "coherent";
  const repeatedCount = repeatedTitles.length;

  const backlogSize = backlogArtifacts.total;
  const reviewable = backlogArtifacts.reviewable;
  const approvalCandidates = backlogArtifacts.approval_candidates;

  const synthBand = synthesisPressure?.band ?? "rising";
  const repetitionPenalty = synthesisPressure?.components.repetition_without_movement_penalty ?? 0;

  // --- Simple thresholds (heuristic, bounded) ---
  const hasRepetitionRisk = repeatedCount >= 3 || repetitionPenalty >= 0.4;
  const backlogHigh = backlogSize >= 40 || reviewable >= 15;
  const backlogModerate = backlogSize >= 15 || reviewable >= 5;
  const approvalPoolNonTrivial = approvalCandidates >= 3;

  const rel = relationshipSummary ?? null;
  const relTotal = rel
    ? rel.duplicates_recent +
      rel.refinements_recent +
      rel.alternatives_recent +
      rel.successors_recent +
      rel.unrelated_recent
    : 0;
  const relDupShare = rel && relTotal > 0 ? rel.duplicates_recent / relTotal : 0;
  const relRefSuccShare =
    rel && relTotal > 0 ? (rel.refinements_recent + rel.successors_recent) / relTotal : 0;
  const relUnrelatedShare = rel && relTotal > 0 ? rel.unrelated_recent / relTotal : 0;

  const fam = conceptFamilySummary ?? null;

  let mode: TrajectoryMode = "explore";
  let style_direction: TrajectoryStyleDirection | undefined;
  let proposal_pressure: TrajectoryProposalPressure = "normal";
  const focus_bias: string[] = [];
  const horizon_sessions = 5;

  // Style-based base posture.
  if (stylePressure === "repetitive" || hasRepetitionRisk) {
    mode = "diversify";
    style_direction = "reduce_repetition";
  } else if (stylePressure === "drifting") {
    mode = "consolidate";
    style_direction = "reinforce_dominant";
  } else {
    // coherent / neutral: follow synthesis pressure and seed instincts.
    if (synthBand === "convert_now" || synthBand === "high") {
      mode = approvalPoolNonTrivial ? "reinforce" : "consolidate";
      style_direction = styleProfile?.dominant?.length ? "reinforce_dominant" : "open";
    } else if (synthBand === "rising") {
      mode = "explore";
      style_direction = styleProfile?.emerging?.length ? "explore_emerging" : "open";
    } else {
      mode = "reflect";
      style_direction = "open";
    }
  }

  // Backlog-based pressure adjustment.
  if (backlogHigh) {
    proposal_pressure = "high";
    if (mode === "explore") mode = "consolidate";
  } else if (backlogModerate) {
    proposal_pressure = "normal";
  } else {
    proposal_pressure = "low";
  }

  // Relationship summary as additional advisory signal (secondary to family recommendations).
  if (rel && relTotal >= 3) {
    if (relDupShare >= 0.35) {
      if (mode === "explore" || mode === "reinforce") {
        mode = "diversify";
        style_direction = "reduce_repetition";
      }
      focus_bias.push(
        "Recent proposals include many near-duplicates; gently favor genuinely new directions over copy-like variants."
      );
    } else if (relRefSuccShare >= 0.4) {
      if (mode === "explore" || mode === "diversify") {
        mode = approvalPoolNonTrivial ? "reinforce" : "consolidate";
        if (!style_direction && styleProfile?.dominant?.length) {
          style_direction = "reinforce_dominant";
        }
      }
      focus_bias.push(
        "Recent proposals mostly refine or succeed prior ones; gently emphasize consolidating strong directions over spawning new branches."
      );
    } else if (relUnrelatedShare >= 0.4) {
      if (mode === "explore") {
        mode = "reflect";
      }
      focus_bias.push(
        "Recent proposals are mostly unrelated; add a small bias toward reflection and consolidation of what already works."
      );
    }
  }

  // Concept-family summary as primary family-level signal.
  if (fam && fam.family_count_recent >= 2) {
    const reinforceFamilies = fam.families_recommended_for_reinforcement;
    const consolidateFamilies = fam.families_recommended_for_consolidation;
    const humanSelectFamilies = fam.families_recommended_for_human_selection;
    const holdFamilies = fam.families_holding_multiple_branches;
    const stableFamilies = fam.stable_families;

    if (reinforceFamilies >= 2) {
      if (mode === "explore" || mode === "diversify" || mode === "reflect") {
        mode = "reinforce";
        if (!style_direction && styleProfile?.dominant?.length) {
          style_direction = "reinforce_dominant";
        }
      }
      focus_bias.push(
        "Several concept families are recommended for reinforcement; gently bias toward deepening those heads."
      );
    }

    if (consolidateFamilies >= 2) {
      if (mode === "explore") {
        mode = "consolidate";
      }
      focus_bias.push(
        "Multiple concept families are recommended for consolidation; gently bias toward selecting clear representatives and reducing redundant branches."
      );
    }

    if (humanSelectFamilies >= 1) {
      if (mode === "explore") {
        mode = "reflect";
      }
      focus_bias.push(
        "Some concept families need explicit human selection of representatives; gently bias toward reflective sessions over aggressive expansion."
      );
    }

    if (holdFamilies >= 2) {
      if (mode === "consolidate") {
        mode = "explore";
      }
      focus_bias.push(
        "Several families are in a 'hold multiple branches' posture; avoid premature consolidation and allow selective branching within those lines."
      );
    }

    if (stableFamilies >= fam.family_count_recent / 2 && mode === "reflect") {
      mode = "explore";
      focus_bias.push(
        "Most recent families are stable; allow cautious exploration while keeping consolidation options open."
      );
    }
  }

  const preferred = seed.style.preferred_styles ?? [];
  if (preferred.length > 0) {
    if (mode === "reinforce" || mode === "consolidate") {
      focus_bias.push("Favor artifacts, proposals, and directions that strengthen the Twin's preferred styles.");
    } else if (mode === "diversify") {
      focus_bias.push(
        "Explore adjacent directions that stay legible to the existing preferred styles instead of random pivots."
      );
    }
  }

  for (const instinct of seed.proposal_instincts.slice(0, 2)) {
    focus_bias.push(instinct);
  }

  const reasonParts: string[] = [];
  reasonParts.push(`Seed archetype: ${seed.identity.archetype}.`);
  reasonParts.push(`Synthesis pressure band: ${synthBand}.`);
  reasonParts.push(`Style pressure: ${stylePressure}.`);
  if (hasRepetitionRisk) {
    reasonParts.push(
      `Repetition risk detected from recent titles and trajectory reviews (repeated_titles=${repeatedCount}).`
    );
  }
  reasonParts.push(
    `Backlog: total=${backlogSize}, reviewable=${reviewable}, approval_candidates=${approvalCandidates}.`
  );
  if (stylePressureExplanation) {
    reasonParts.push(`Style posture: ${stylePressureExplanation}`);
  }
  if (rel && relTotal > 0) {
    reasonParts.push(
      `Recent proposal relationships (window=${relTotal}): duplicates=${rel.duplicates_recent}, refinements=${rel.refinements_recent}, alternatives=${rel.alternatives_recent}, successors=${rel.successors_recent}, unrelated=${rel.unrelated_recent}.`
    );
    if (rel.dominant_relationship_pattern) {
      reasonParts.push(`Dominant relationship pattern: ${rel.dominant_relationship_pattern}.`);
    }
  }
  if (fam && fam.family_count_recent > 0) {
    reasonParts.push(
      `Concept families (recent window): family_count=${fam.family_count_recent}, largest_family_size=${fam.largest_family_size}, recommended_reinforcement=${fam.families_recommended_for_reinforcement}, recommended_consolidation=${fam.families_recommended_for_consolidation}, recommended_human_selection=${fam.families_recommended_for_human_selection}, holding_multiple_branches=${fam.families_holding_multiple_branches}, stable_families=${fam.stable_families}.`
    );
  }
  const reason = reasonParts.join(" ");

  return {
    mode,
    horizon_sessions,
    reason,
    focus_bias: focus_bias.length > 0 ? focus_bias : undefined,
    style_direction,
    proposal_pressure,
  };
}

