/**
 * Stop limits and repetition detection for session run.
 * Canon: system_architecture.md §15, creative_metabolism.md §7.
 */

export const DEFAULT_MAX_ARTIFACTS_PER_SESSION = 1;
export const DEFAULT_MAX_TOKENS_PER_SESSION = 0; // 0 = no limit
export const DEFAULT_REPETITION_WINDOW = 5;
export const REPETITION_THRESHOLD = 4; // same outcome in >= this many of last N

export function getMaxArtifactsPerSession(): number {
  const v = process.env.MAX_ARTIFACTS_PER_SESSION;
  if (v == null || v === "") return DEFAULT_MAX_ARTIFACTS_PER_SESSION;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_MAX_ARTIFACTS_PER_SESSION;
}

export function getMaxTokensPerSession(): number {
  const v = process.env.MAX_TOKENS_PER_SESSION;
  if (v == null || v === "") return DEFAULT_MAX_TOKENS_PER_SESSION;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MAX_TOKENS_PER_SESSION;
}

export function getRepetitionWindow(): number {
  const v = process.env.REPETITION_WINDOW;
  if (v == null || v === "") return DEFAULT_REPETITION_WINDOW;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 2 ? n : DEFAULT_REPETITION_WINDOW;
}

/** Returns true if token count exceeds the session limit. */
export function isOverTokenLimit(tokensUsed: number | undefined): boolean {
  if (tokensUsed == null) return false;
  const max = getMaxTokensPerSession();
  return max > 0 && tokensUsed > max;
}

/** When tokens used (e.g. daily) >= this, scheduler auto-switches to slow. 0 = disabled. */
export function getLowTokenThreshold(): number {
  const v = process.env.LOW_TOKEN_THRESHOLD;
  if (v == null || v === "") return 0;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Canon-native: default max pending proposals per proposal_type. 0 = no cap. */
const DEFAULT_MAX_PENDING_BY_PROPOSAL_TYPE: Record<string, number> = {
  layout_change: 2,
  embodiment_change: 3,
  integration_change: 5,
};

/**
 * Max pending (pending_review / approved_for_staging / staged) proposals for a canon proposal_type.
 * Env: MAX_PENDING_PROPOSALS_<proposal_type> (e.g. MAX_PENDING_PROPOSALS_layout_change). 0 = no cap.
 */
export function getMaxPendingProposalsByProposalType(proposalType: string): number {
  const envKey = `MAX_PENDING_PROPOSALS_${proposalType.replace(/-/g, "_")}`;
  const v = process.env[envKey];
  if (v != null && v !== "") {
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const defaultCap = DEFAULT_MAX_PENDING_BY_PROPOSAL_TYPE[proposalType];
  return defaultCap ?? 0;
}

/** Max creative_session rows allowed per rolling 1-hour window. 0 = no cap. */
export const DEFAULT_MAX_SESSIONS_PER_HOUR = 4;

export function getMaxSessionsPerHour(): number {
  const v = process.env.MAX_SESSIONS_PER_HOUR;
  if (v == null || v === "") return DEFAULT_MAX_SESSIONS_PER_HOUR;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MAX_SESSIONS_PER_HOUR;
}

/** Archive decay half-life in days. Canon: archive_and_return.md §6. */
export const DEFAULT_ARCHIVE_DECAY_HALF_LIFE_DAYS = 60;

export function getArchiveDecayHalfLifeDays(): number {
  const v = process.env.ARCHIVE_DECAY_HALF_LIFE_DAYS;
  if (v == null || v === "") return DEFAULT_ARCHIVE_DECAY_HALF_LIFE_DAYS;
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ARCHIVE_DECAY_HALF_LIFE_DAYS;
}
