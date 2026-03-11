import type { ContinuitySessionRow } from "./runtime-continuity";

export type HealthFlagId =
  | "reflection_streak"
  | "low_confidence_streak"
  | "proposal_heavy_streak"
  | "repetition_risk"
  | "unfinished_pull_without_return"
  | "identity_pressure_streak"
  | "curation_pressure_accumulation";

export interface HealthFlag {
  id: HealthFlagId;
  label: string;
  level: "info" | "watch" | "elevated";
  evidence: string;
}

export interface RuntimeHealthSummary {
  flags: HealthFlag[];
  windowSize: number;
}

export function buildRuntimeHealthSummary(rows: ContinuitySessionRow[]): RuntimeHealthSummary {
  const flags: HealthFlag[] = [];
  const n = rows.length;
  if (n === 0) {
    return { flags: [], windowSize: 0 };
  }

  const reflectionSeq = longestStreak(rows, (r) => r.narrative_state === "reflection");
  if (reflectionSeq >= 3) {
    flags.push({
      id: "reflection_streak",
      label: "Reflection streak",
      level: "watch",
      evidence: `The longest recent reflection streak is ${reflectionSeq} sessions.`,
    });
  }

  const lowConfSeq = longestStreak(
    rows,
    (r) => r.confidence_band === "low" || (r.confidence != null && r.confidence < 0.4)
  );
  if (lowConfSeq >= 3) {
    flags.push({
      id: "low_confidence_streak",
      label: "Low-confidence streak",
      level: "watch",
      evidence: `There are ${lowConfSeq} consecutive sessions with low confidence.`,
    });
  }

  const proposalSeq = longestStreak(rows, (r) => r.proposal_created);
  if (proposalSeq >= 3) {
    flags.push({
      id: "proposal_heavy_streak",
      label: "Proposal-heavy streak",
      level: "info",
      evidence: `${proposalSeq} recent sessions in a row created proposals.`,
    });
  }

  const dominantAction = dominantLabel(
    rows.map((r) => r.action_kind).filter((x): x is string => !!x),
    n
  );
  if (dominantAction) {
    flags.push({
      id: "repetition_risk",
      label: "Repetition risk",
      level: "info",
      evidence: `Action kind '${dominantAction.label}' appears in ${dominantAction.count} of ${n} recent sessions.`,
    });
  }

  const unfinishedCount = rows.filter((r) => r.tension_kinds.includes("unfinished_pull")).length;
  const returnCount = rows.filter(
    (r) => r.narrative_state === "return" || r.action_kind === "resurface_archive"
  ).length;
  if (unfinishedCount >= 3 && returnCount <= 1) {
    flags.push({
      id: "unfinished_pull_without_return",
      label: "Unfinished pull without return",
      level: "watch",
      evidence: `unfinished_pull appears in ${unfinishedCount} sessions, but return posture or resurface_archive appears only ${returnCount} time(s).`,
    });
  }

  const identityPressureSessions = rows.filter((r) =>
    r.tension_kinds.includes("identity_pressure")
  );
  const avatarProposalSessions = rows.filter(
    (r) => r.proposal_role === "avatar_candidate"
  );
  if (identityPressureSessions.length >= 2 && avatarProposalSessions.length >= 1) {
    flags.push({
      id: "identity_pressure_streak",
      label: "Identity pressure",
      level: "watch",
      evidence: `identity_pressure appears in ${identityPressureSessions.length} sessions and avatar_candidate proposals appear in ${avatarProposalSessions.length} sessions.`,
    });
  }

  const curationSessions = rows.filter(
    (r) =>
      r.narrative_state === "curation_pressure" ||
      r.tension_kinds.includes("backlog_pressure") ||
      r.tension_kinds.includes("surface_pressure")
  );
  if (curationSessions.length >= 3) {
    flags.push({
      id: "curation_pressure_accumulation",
      label: "Curation pressure accumulation",
      level: "info",
      evidence: `Curation/backlog-related tensions appear in ${curationSessions.length} of ${n} recent sessions.`,
    });
  }

  const uniqueFlags = dedupeFlags(flags);

  return {
    flags: uniqueFlags.sort((a, b) => a.id.localeCompare(b.id)),
    windowSize: n,
  };
}

function longestStreak(rows: ContinuitySessionRow[], predicate: (r: ContinuitySessionRow) => boolean): number {
  let best = 0;
  let current = 0;
  for (const r of rows) {
    if (predicate(r)) {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }
  return best;
}

function dominantLabel(labels: string[], windowSize: number): { label: string; count: number } | null {
  if (!labels.length || windowSize === 0) return null;
  const counts: Record<string, number> = {};
  for (const l of labels) {
    counts[l] = (counts[l] ?? 0) + 1;
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  const [label, count] = entries[0];
  if (count < Math.max(3, Math.ceil(windowSize / 2))) {
    return null;
  }
  return { label, count };
}

function dedupeFlags(flags: HealthFlag[]): HealthFlag[] {
  const seen = new Set<HealthFlagId>();
  const result: HealthFlag[] = [];
  for (const f of flags) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    result.push(f);
  }
  return result;
}

