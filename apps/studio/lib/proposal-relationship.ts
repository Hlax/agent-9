export type ProposalRelationshipKind =
  | "duplicate"
  | "refinement"
  | "alternative"
  | "successor"
  | "unrelated";

export interface ProposalForRelationship {
  id: string;
  title: string;
  summary: string | null;
  payloadText: string | null;
  targetSurface: string | null;
  proposalRole: string | null;
  targetType: string | null;
  laneType: string | null;
  createdAt: string | null;
}

export interface ProposalRelationshipResult {
  kind: ProposalRelationshipKind;
  relatedProposalId: string | null;
  reason: string;
}

function normalize(text: string | null | undefined): string {
  return (text ?? "").toLowerCase().replace(/[\s]+/g, " ").trim();
}

function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  let union = new Set<string>();
  for (const t of setA) {
    union.add(t);
    if (setB.has(t)) intersection += 1;
  }
  for (const t of setB) {
    union.add(t);
  }
  return intersection === 0 ? 0 : intersection / union.size;
}

function combinedSimilarity(a: ProposalForRelationship, b: ProposalForRelationship): number {
  const titleA = tokenize(a.title);
  const titleB = tokenize(b.title);
  const summaryA = tokenize(normalize(a.summary));
  const summaryB = tokenize(normalize(b.summary));
  const payloadA = tokenize(normalize(a.payloadText));
  const payloadB = tokenize(normalize(b.payloadText));

  const titleSim = jaccardSimilarity(titleA, titleB);
  const summarySim = jaccardSimilarity(summaryA, summaryB);
  const payloadSim = jaccardSimilarity(payloadA, payloadB);

  // Title carries the most weight; payload is only a light hint.
  return 0.6 * titleSim + 0.3 * summarySim + 0.1 * payloadSim;
}

function sameContext(a: ProposalForRelationship, b: ProposalForRelationship): boolean {
  return (
    (a.laneType ?? "surface") === (b.laneType ?? "surface") &&
    (a.targetSurface ?? "") === (b.targetSurface ?? "") &&
    (a.proposalRole ?? "") === (b.proposalRole ?? "") &&
    (a.targetType ?? "") === (b.targetType ?? "")
  );
}

function isNewer(a: ProposalForRelationship, b: ProposalForRelationship): boolean {
  if (!a.createdAt || !b.createdAt) return false;
  return new Date(a.createdAt).getTime() > new Date(b.createdAt).getTime();
}

/**
 * Evaluate relationship between a proposal and a set of recent related proposals.
 * Heuristic and explicit for V1; used for inspection/debug and future trajectory,
 * not for governance decisions.
 */
export function evaluateProposalRelationship(
  current: ProposalForRelationship,
  recent: ProposalForRelationship[]
): ProposalRelationshipResult {
  const peers = recent.filter((p) => p.id !== current.id && sameContext(current, p));
  if (peers.length === 0) {
    return {
      kind: "unrelated",
      relatedProposalId: null,
      reason: "No other recent proposals found in the same lane/role/target surface/context.",
    };
  }

  let best: ProposalForRelationship | null = null;
  let bestScore = 0;
  for (const p of peers) {
    const score = combinedSimilarity(current, p);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  if (!best || bestScore < 0.2) {
    return {
      kind: "unrelated",
      relatedProposalId: null,
      reason: "No closely related recent proposals detected; treating this as a standalone proposal.",
    };
  }

  const normalizedTitleCurrent = normalize(current.title);
  const normalizedTitleBest = normalize(best.title);
  const sameTitle = normalizedTitleCurrent.length > 0 && normalizedTitleCurrent === normalizedTitleBest;

  const payloadEqual =
    normalize(current.payloadText).length > 0 &&
    normalize(current.payloadText) === normalize(best.payloadText);

  let kind: ProposalRelationshipKind = "alternative";
  const reasons: string[] = [];

  if (sameTitle && payloadEqual) {
    kind = "duplicate";
    reasons.push("Same title and payload as a recent proposal in the same lane/role/target surface.");
  } else if (sameTitle && bestScore >= 0.85) {
    kind = "duplicate";
    reasons.push("Title is identical and overall content is highly similar to a recent proposal.");
  } else if (bestScore >= 0.7) {
    if (isNewer(current, best)) {
      kind = "successor";
      reasons.push(
        "Very high content similarity to an earlier proposal, with this proposal created later in time (likely successor/refresh)."
      );
    } else {
      kind = "refinement";
      reasons.push(
        "Very high content similarity to a nearby proposal in the same context; treating as a refinement."
      );
    }
  } else if (bestScore >= 0.45) {
    kind = "alternative";
    reasons.push(
      "Moderate content similarity to a recent proposal in the same context; treating as an alternative direction."
    );
  } else {
    kind = "unrelated";
    reasons.push(
      "Only weak similarity to other proposals in the same context; treating this as unrelated for now."
    );
  }

  reasons.push(`Best match similarity score: ${bestScore.toFixed(2)}.`);

  return {
    kind,
    relatedProposalId: best ? best.id : null,
    reason: reasons.join(" "),
  };
}

