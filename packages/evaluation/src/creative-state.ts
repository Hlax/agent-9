/**
 * Creative state update after each artifact. Canon: docs/02_runtime/creative_state_model.md.
 * State evolves from previous snapshot + evaluation signals; not overwritten by evaluation alone.
 * Also: drive weight calculation and session mode selection.
 */

import type { CreativeDrive, EvaluationSignal, SessionMode } from "@twin/core";
import { creative_drive, session_mode } from "@twin/core";

/** Mutable state fields (0–1) used for update logic. Snapshot has same fields plus session_id, notes, etc. */
export interface CreativeStateFields {
  identity_stability: number;
  avatar_alignment: number;
  expression_diversity: number;
  unfinished_projects: number;
  recent_exploration_rate: number;
  creative_tension: number;
  curiosity_level: number;
  reflection_need: number;
  idea_recurrence: number;
  public_curation_backlog: number;
}

const DEFAULT_FLOAT = 0.5;
const DEFAULT_IDEAS = 0.2;
const DEFAULT_REFLECTION = 0.3;
const DEFAULT_BACKLOG = 0;

function clamp(value: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, value));
}

/** Default creative state when no previous snapshot exists. */
export function defaultCreativeState(): CreativeStateFields {
  return {
    identity_stability: DEFAULT_FLOAT,
    avatar_alignment: DEFAULT_FLOAT,
    expression_diversity: DEFAULT_FLOAT,
    unfinished_projects: 0,
    recent_exploration_rate: DEFAULT_FLOAT,
    creative_tension: DEFAULT_FLOAT,
    curiosity_level: DEFAULT_FLOAT,
    reflection_need: DEFAULT_REFLECTION,
    idea_recurrence: DEFAULT_IDEAS,
    public_curation_backlog: DEFAULT_BACKLOG,
  };
}

/** Map a snapshot row (nullable numbers) to CreativeStateFields for update. */
export function snapshotToState(snapshot: {
  identity_stability?: number | null;
  avatar_alignment?: number | null;
  expression_diversity?: number | null;
  unfinished_projects?: number | null;
  recent_exploration_rate?: number | null;
  creative_tension?: number | null;
  curiosity_level?: number | null;
  reflection_need?: number | null;
  idea_recurrence?: number | null;
  public_curation_backlog?: number | null;
}): CreativeStateFields {
  return {
    identity_stability: snapshot.identity_stability ?? DEFAULT_FLOAT,
    avatar_alignment: snapshot.avatar_alignment ?? DEFAULT_FLOAT,
    expression_diversity: snapshot.expression_diversity ?? DEFAULT_FLOAT,
    unfinished_projects: snapshot.unfinished_projects ?? 0,
    recent_exploration_rate: snapshot.recent_exploration_rate ?? DEFAULT_FLOAT,
    creative_tension: snapshot.creative_tension ?? DEFAULT_FLOAT,
    curiosity_level: snapshot.curiosity_level ?? DEFAULT_FLOAT,
    reflection_need: snapshot.reflection_need ?? DEFAULT_REFLECTION,
    idea_recurrence: snapshot.idea_recurrence ?? DEFAULT_IDEAS,
    public_curation_backlog: snapshot.public_curation_backlog ?? DEFAULT_BACKLOG,
  };
}

/** Derived novelty from emergence and recurrence (canon: do not persist). */
function noveltyScore(e: EvaluationSignal): number {
  const emergence = e.emergence_score ?? 0.5;
  const recurrence = e.recurrence_score ?? 0.5;
  return emergence * 0.6 + (1 - recurrence) * 0.4;
}

/**
 * Update creative state after one artifact using evaluation signals.
 * Returns new state object; caller persists as creative_state_snapshot.
 */
export function updateCreativeState(
  prev: CreativeStateFields,
  evaluation: EvaluationSignal
): CreativeStateFields {
  const pull = evaluation.pull_score ?? 0.5;
  const recurrence = evaluation.recurrence_score ?? 0.2;
  const emergence = evaluation.emergence_score ?? 0.5;
  const alignment = evaluation.alignment_score ?? 0.5;
  const novelty = noveltyScore(evaluation);
  const isReflection = false;
  const exploredNewMedium = false;
  const addedUnfinishedWork = false;

  const next: CreativeStateFields = { ...prev };

  next.creative_tension = clamp(prev.creative_tension + (pull - 0.5) * 0.15);
  next.idea_recurrence = clamp(prev.idea_recurrence + recurrence * 0.18);
  next.curiosity_level = clamp(prev.curiosity_level + (emergence - 0.5) * 0.12);
  next.identity_stability = clamp(prev.identity_stability + (alignment - 0.5) * 0.1);

  if (novelty < 0.35) {
    next.recent_exploration_rate = clamp(prev.recent_exploration_rate - 0.08);
    next.reflection_need = clamp(prev.reflection_need + 0.1);
  } else {
    next.recent_exploration_rate = clamp(prev.recent_exploration_rate + 0.06);
  }

  if (isReflection) {
    next.reflection_need = clamp(prev.reflection_need - 0.2);
  }
  if (exploredNewMedium) {
    next.expression_diversity = clamp(prev.expression_diversity + 0.12);
  }
  if (addedUnfinishedWork) {
    next.unfinished_projects = clamp(prev.unfinished_projects + 0.1);
  }

  return next;
}

/** Canon drive weights from state (V1 runtime defaults + state influence). Weights sum to 1. */
export function computeDriveWeights(state: CreativeStateFields): Record<CreativeDrive, number> {
  const weights: Record<string, number> = {
    coherence: 0.15,
    expression: 0.18,
    emergence: 0.14,
    expansion: 0.1,
    return: 0.1,
    reflection: 0.08,
    curation: 0.05,
    habitat: 0.05,
  };
  weights["coherence"] = (weights["coherence"] ?? 0) + (1 - state.identity_stability) * 0.2 + (1 - state.avatar_alignment) * 0.08;
  weights["expression"] = (weights["expression"] ?? 0) + state.creative_tension * 0.15;
  weights["emergence"] = (weights["emergence"] ?? 0) + state.curiosity_level * 0.18;
  weights["return"] = (weights["return"] ?? 0) + state.unfinished_projects * 0.2;
  weights["reflection"] = (weights["reflection"] ?? 0) + state.reflection_need * 0.25;
  weights["curation"] = (weights["curation"] ?? 0) + state.public_curation_backlog * 0.2;
  weights["habitat"] = (weights["habitat"] ?? 0) + (1 - state.avatar_alignment) * 0.12;
  weights["expansion"] = (weights["expansion"] ?? 0) + state.idea_recurrence * 0.12;
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const out: Record<CreativeDrive, number> = {} as Record<CreativeDrive, number>;
  for (const d of creative_drive) {
    out[d] = (weights[d] ?? 0) / total;
  }
  return out;
}

/** Select session mode from creative state. Canon: session_loop.md, creative_state_model.md. */
export function computeSessionMode(state: CreativeStateFields): SessionMode {
  if (state.reflection_need >= 0.6) return "reflect";
  if (state.unfinished_projects >= 0.6 && state.idea_recurrence >= 0.4) return "return";
  if (state.unfinished_projects >= 0.5) return "continue";
  if (state.recent_exploration_rate < 0.35) return "explore";
  if (state.creative_tension < 0.3) return "rest";
  return "explore";
}

/** Pick one drive from weights (probabilistic). */
export function selectDrive(weights: Record<CreativeDrive, number>): CreativeDrive {
  const r = Math.random();
  let acc = 0;
  for (const d of creative_drive) {
    acc += weights[d] ?? 0;
    if (r <= acc) return d;
  }
  return (creative_drive[creative_drive.length - 1] ?? creative_drive[0]) as CreativeDrive;
}

/** Convert CreativeStateFields to snapshot row shape (for DB insert). created_at uses DB default. */
export function stateToSnapshotRow(
  state: CreativeStateFields,
  sessionId: string,
  notes: string | null
): {
  state_snapshot_id: string;
  session_id: string;
  identity_stability: number;
  avatar_alignment: number;
  expression_diversity: number;
  unfinished_projects: number;
  recent_exploration_rate: number;
  creative_tension: number;
  curiosity_level: number;
  reflection_need: number;
  idea_recurrence: number;
  public_curation_backlog: number;
  notes: string | null;
} {
  return {
    state_snapshot_id: crypto.randomUUID(),
    session_id: sessionId,
    identity_stability: state.identity_stability,
    avatar_alignment: state.avatar_alignment,
    expression_diversity: state.expression_diversity,
    unfinished_projects: state.unfinished_projects,
    recent_exploration_rate: state.recent_exploration_rate,
    creative_tension: state.creative_tension,
    curiosity_level: state.curiosity_level,
    reflection_need: state.reflection_need,
    idea_recurrence: state.idea_recurrence,
    public_curation_backlog: state.public_curation_backlog,
    notes,
  };
}
