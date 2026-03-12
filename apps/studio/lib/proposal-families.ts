import type { ProposalForRelationship, ProposalRelationshipKind } from "@/lib/proposal-relationship";

export type ConceptFamilyRecommendation =
  | "reinforce_head"
  | "consolidate_family"
  | "needs_human_selection"
  | "hold_multiple_branches"
  | "stable";

export interface ConceptFamily {
  family_id: string;
  member_ids: string[];
  dominant_target_surface: string | null;
  representative_proposal_id: string;
  has_successor_chain: boolean;
  has_many_alternatives: boolean;
  duplicate_pressure: boolean;
  representative_confidence: "low" | "medium" | "high";
  is_contested: boolean;
  has_clear_successor_head: boolean;
  branch_count: number;
  needs_consolidation: boolean;
  recommendation: ConceptFamilyRecommendation;
  recommendation_reason: string;
}

export interface ConceptFamilyRuntimeSummary {
  family_count_recent: number;
  largest_family_size: number;
  families_with_successors: number;
  families_with_many_alternatives: number;
  families_with_duplicate_pressure: number;
  families_needing_consolidation: number;
  families_with_contested_representatives: number;
  families_with_clear_heads: number;
  families_recommended_for_reinforcement: number;
  families_recommended_for_consolidation: number;
  families_recommended_for_human_selection: number;
  families_holding_multiple_branches: number;
  stable_families: number;
}

interface RelationshipEdge {
  kind: ProposalRelationshipKind;
  from: string;
  to: string | null;
}

/**
 * Build lightweight concept families from a recent proposal window.
 * Families are connected components over proposals where at least one member
 * treats another as duplicate/refinement/alternative/successor. "unrelated"
 * links do not contribute edges.
 */
export function buildConceptFamilies(
  proposals: ProposalForRelationship[],
  evaluate: (current: ProposalForRelationship, recent: ProposalForRelationship[]) => {
    kind: ProposalRelationshipKind;
    relatedProposalId: string | null;
  }
): { families: ConceptFamily[]; summary: ConceptFamilyRuntimeSummary } {
  if (proposals.length === 0) {
    return {
      families: [],
      summary: {
        family_count_recent: 0,
        largest_family_size: 0,
        families_with_successors: 0,
        families_with_many_alternatives: 0,
        families_with_duplicate_pressure: 0,
        families_needing_consolidation: 0,
        families_with_contested_representatives: 0,
        families_with_clear_heads: 0,
        families_recommended_for_reinforcement: 0,
        families_recommended_for_consolidation: 0,
        families_recommended_for_human_selection: 0,
        families_holding_multiple_branches: 0,
        stable_families: 0,
      },
    };
  }

  const byId: Record<string, ProposalForRelationship> = {};
  for (const p of proposals) {
    byId[p.id] = p;
  }

  const edges: RelationshipEdge[] = [];
  for (const p of proposals) {
    const rel = evaluate(p, proposals);
    edges.push({ kind: rel.kind, from: p.id, to: rel.relatedProposalId });
  }

  // Build undirected adjacency ignoring "unrelated".
  const adj: Record<string, Set<string>> = {};
  for (const p of proposals) {
    adj[p.id] = new Set<string>();
  }
  for (const e of edges) {
    if (!e.to || e.kind === "unrelated") continue;
    if (!adj[e.from]) adj[e.from] = new Set<string>();
    if (!adj[e.to]) adj[e.to] = new Set<string>();
    adj[e.from]!.add(e.to);
    adj[e.to]!.add(e.from);
  }

  const visited = new Set<string>();
  const families: ConceptFamily[] = [];

  for (const p of proposals) {
    if (visited.has(p.id)) continue;
    const stack = [p.id];
    const memberIds: string[] = [];
    const edgeKinds: RelationshipEdge[] = [];

    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (visited.has(id)) continue;
      visited.add(id);
      memberIds.push(id);
      for (const e of edges) {
        if (e.from === id || e.to === id) {
          edgeKinds.push(e);
        }
      }
      for (const neighbor of adj[id] ?? []) {
        if (!visited.has(neighbor)) stack.push(neighbor);
      }
    }

    if (memberIds.length === 0) continue;

    const sortedMembers = [...memberIds].sort();
    const familyId = sortedMembers[0];

    // Dominant target surface: most common non-null.
    const surfaceCounts: Record<string, number> = {};
    for (const id of memberIds) {
      const surf = byId[id]?.targetSurface ?? null;
      if (!surf) continue;
      surfaceCounts[surf] = (surfaceCounts[surf] ?? 0) + 1;
    }
    let dominantSurface: string | null = null;
    let maxSurfaceCount = 0;
    for (const [surf, count] of Object.entries(surfaceCounts)) {
      if (count > maxSurfaceCount) {
        maxSurfaceCount = count;
        dominantSurface = surf;
      }
    }

    // Representative: newest by createdAt (fallback to lexicographically smallest id).
    let representative = sortedMembers[0];
    let bestTs = 0;
    for (const id of memberIds) {
      const ts = byId[id]?.createdAt ? Date.parse(byId[id].createdAt as string) : 0;
      if (ts > bestTs) {
        bestTs = ts;
        representative = id;
      }
    }

    const kindsInFamily = edgeKinds.filter((e) => e.to && memberIds.includes(e.from) && memberIds.includes(e.to));
    const hasSuccessorChain = kindsInFamily.some((e) => e.kind === "successor");
    const alternativeCount = kindsInFamily.filter((e) => e.kind === "alternative").length;
    const duplicateCount = kindsInFamily.filter((e) => e.kind === "duplicate").length;

    const hasManyAlternatives = alternativeCount >= 3;
    const duplicatePressure = duplicateCount >= 2;

    // Representative selection using successor + alternative/duplicate structure.
    const successorOut: Record<string, number> = {};
    const successorIn: Record<string, number> = {};
    const alternativeByNode: Record<string, number> = {};
    const duplicateByNode: Record<string, number> = {};
    for (const id of memberIds) {
      successorOut[id] = 0;
      successorIn[id] = 0;
      alternativeByNode[id] = 0;
      duplicateByNode[id] = 0;
    }
    for (const e of kindsInFamily) {
      if (!e.to) continue;
      if (!memberIds.includes(e.from) || !memberIds.includes(e.to)) continue;
      if (e.kind === "successor") {
        successorOut[e.from] = (successorOut[e.from] ?? 0) + 1;
        successorIn[e.to] = (successorIn[e.to] ?? 0) + 1;
      } else if (e.kind === "alternative") {
        alternativeByNode[e.from] = (alternativeByNode[e.from] ?? 0) + 1;
        alternativeByNode[e.to] = (alternativeByNode[e.to] ?? 0) + 1;
      } else if (e.kind === "duplicate") {
        duplicateByNode[e.from] = (duplicateByNode[e.from] ?? 0) + 1;
        duplicateByNode[e.to] = (duplicateByNode[e.to] ?? 0) + 1;
      }
    }

    const branchNodes = new Set<string>();
    for (const [id, count] of Object.entries(alternativeByNode)) {
      if (count > 0) branchNodes.add(id);
    }
    const branchCount = branchNodes.size;

    // Successor-head candidates: strong outward successor links, few/no inbound.
    let successorHeadCandidates: string[] = [];
    let maxSuccOut = 0;
    for (const id of memberIds) {
      const out = successorOut[id] ?? 0;
      if (out > maxSuccOut) {
        maxSuccOut = out;
        successorHeadCandidates = [id];
      } else if (out === maxSuccOut && out > 0) {
        successorHeadCandidates.push(id);
      }
    }
    const clearSuccessorHead =
      maxSuccOut >= 1 &&
      successorHeadCandidates.length === 1 &&
      (successorIn[successorHeadCandidates[0]] ?? 0) === 0;

    let representative = sortedMembers[0];
    let representativeConfidence: "low" | "medium" | "high" = "low";
    let isContested = false;
    let hasClearSuccessorHead = false;

    if (clearSuccessorHead) {
      representative = successorHeadCandidates[0];
      representativeConfidence = "high";
      hasClearSuccessorHead = true;
    } else if (maxSuccOut >= 1 && successorHeadCandidates.length > 1) {
      // Multiple strong successors: pick newest among them, mark contested.
      let bestTsMulti = 0;
      for (const id of successorHeadCandidates) {
        const ts = byId[id]?.createdAt ? Date.parse(byId[id].createdAt as string) : 0;
        if (ts > bestTsMulti) {
          bestTsMulti = ts;
          representative = id;
        }
      }
      representativeConfidence = "medium";
      isContested = true;
    } else {
      // Fall back to alternative/duplicate prominence, then recency.
      let bestScore = -1;
      let bestIds: string[] = [];
      for (const id of memberIds) {
        const score = (alternativeByNode[id] ?? 0) * 1 + (duplicateByNode[id] ?? 0) * 0.5;
        if (score > bestScore) {
          bestScore = score;
          bestIds = [id];
        } else if (score === bestScore) {
          bestIds.push(id);
        }
      }
      if (bestScore > 0 && bestIds.length > 0) {
        if (bestIds.length === 1) {
          representative = bestIds[0];
          representativeConfidence = "medium";
        } else {
          let bestTsTie = 0;
          let chosen = bestIds[0];
          for (const id of bestIds) {
            const ts = byId[id]?.createdAt ? Date.parse(byId[id].createdAt as string) : 0;
            if (ts > bestTsTie) {
              bestTsTie = ts;
              chosen = id;
            }
          }
          representative = chosen;
          representativeConfidence = "medium";
          isContested = true;
        }
      } else {
        // No strong structural signal; fall back to newest.
        let bestTsFallback = 0;
        for (const id of memberIds) {
          const ts = byId[id]?.createdAt ? Date.parse(byId[id].createdAt as string) : 0;
          if (ts > bestTsFallback) {
            bestTsFallback = ts;
            representative = id;
          }
        }
        representativeConfidence = memberIds.length > 1 ? "low" : "medium";
      }
    }

    const needsConsolidation =
      hasManyAlternatives ||
      duplicatePressure ||
      branchCount >= 3 ||
      (representativeConfidence === "low" && memberIds.length >= 3);

    // Editorial recommendation with clear precedence:
    // 1) contested / low-confidence larger family → needs_human_selection
    // 2) needs_consolidation → consolidate_family
    // 3) clear successor head → reinforce_head
    // 4) multiple branches without pressure → hold_multiple_branches
    // 5) else → stable
    let recommendation: ConceptFamilyRecommendation = "stable";
    const recReasons: string[] = [];

    const isLarge = memberIds.length >= 3;
    const lowConfLarge = representativeConfidence === "low" && isLarge;

    if (isContested || lowConfLarge) {
      recommendation = "needs_human_selection";
      if (isContested) {
        recReasons.push("Multiple plausible representatives (contested head) in this family.");
      }
      if (lowConfLarge) {
        recReasons.push("Representative confidence is low for a larger family; human selection recommended.");
      }
    } else if (needsConsolidation) {
      recommendation = "consolidate_family";
      if (hasManyAlternatives) {
        recReasons.push("Family contains many alternative branches.");
      }
      if (duplicatePressure) {
        recReasons.push("Family exhibits duplicate pressure across members.");
      }
      if (branchCount >= 3) {
        recReasons.push(`Family has ${branchCount} or more branch points.`);
      }
    } else if (hasClearSuccessorHead) {
      recommendation = "reinforce_head";
      recReasons.push("Family has a clear successor head with strong outward successor links and no inbound.");
    } else if (branchCount > 0 && !hasManyAlternatives && !duplicatePressure) {
      recommendation = "hold_multiple_branches";
      recReasons.push("Family has multiple branches without strong duplication or consolidation pressure.");
    } else {
      recommendation = "stable";
      recReasons.push("Family appears structurally stable with no strong consolidation or selection pressure.");
    }

    const recommendation_reason = recReasons.join(" ");

    families.push({
      family_id: familyId,
      member_ids: sortedMembers,
      dominant_target_surface: dominantSurface,
      representative_proposal_id: representative,
      has_successor_chain: hasSuccessorChain,
      has_many_alternatives: hasManyAlternatives,
      duplicate_pressure: duplicatePressure,
      representative_confidence: representativeConfidence,
      is_contested: isContested,
      has_clear_successor_head: hasClearSuccessorHead,
      branch_count: branchCount,
      needs_consolidation,
      recommendation,
      recommendation_reason,
    });
  }

  const family_count_recent = families.length;
  const largest_family_size = families.reduce((max, f) => (f.member_ids.length > max ? f.member_ids.length : max), 0);
  const families_with_successors = families.filter((f) => f.has_successor_chain).length;
  const families_with_many_alternatives = families.filter((f) => f.has_many_alternatives).length;
  const families_with_duplicate_pressure = families.filter((f) => f.duplicate_pressure).length;
  const families_needing_consolidation = families.filter((f) => f.needs_consolidation).length;
  const families_with_contested_representatives = families.filter((f) => f.is_contested).length;
  const families_with_clear_heads = families.filter((f) => f.has_clear_successor_head).length;
  const families_recommended_for_reinforcement = families.filter((f) => f.recommendation === "reinforce_head").length;
  const families_recommended_for_consolidation = families.filter((f) => f.recommendation === "consolidate_family").length;
  const families_recommended_for_human_selection = families.filter((f) => f.recommendation === "needs_human_selection").length;
  const families_holding_multiple_branches = families.filter((f) => f.recommendation === "hold_multiple_branches").length;
  const stable_families = families.filter((f) => f.recommendation === "stable").length;

  return {
    families,
    summary: {
      family_count_recent,
      largest_family_size,
      families_with_successors,
      families_with_many_alternatives,
      families_with_duplicate_pressure,
      families_needing_consolidation,
      families_with_contested_representatives,
      families_with_clear_heads,
      families_recommended_for_reinforcement,
      families_recommended_for_consolidation,
      families_recommended_for_human_selection,
      families_holding_multiple_branches,
      stable_families,
    },
  };
}

