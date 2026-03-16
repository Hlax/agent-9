/**
 * Governance V1: explicit lane/authority/transition rules for proposals.
 *
 * Agent-9 canon-native:
 * - Lane classification: from canon only via classifyProposalLane({ proposal_type }). primary_lane → lane_type.
 * - Stageability / promotion: from canon STAGEABLE_CANON_LANES (compat); no hardcoded "surface" as sole stageable lane.
 * - Actor authority: runner → agent_9, human, reviewer → risk_audit_agent; checked against canon agent_registry.
 *
 * Single deprecated path: when proposal_type is not provided, we default to build_lane (surface) and set
 * DEPRECATED_LEGACY_FALLBACK. Callers should pass proposal_type from canon; this fallback is temporary.
 */

import { isLegalProposalStateTransition } from "./governance-rules";
import {
  getPrimaryLaneForProposalType,
  isValidProposalType,
  agentCanCreateProposalInLane,
  canonLaneToDb,
  dbLaneToCanon,
  STAGEABLE_CANON_LANES,
  type LaneType as CanonLaneType,
  type CanonLaneId,
} from "./canon";

export type LaneType = CanonLaneType;

export type ActorAuthority = "runner" | "human" | "reviewer" | "unknown";

export type GovernanceDecision = "allow" | "warn" | "block";

export type GovernanceResult = {
  ok: boolean;
  decision: GovernanceDecision;
  /** Stable, machine-readable reason codes (see constants below). */
  reason_codes: string[];
  lane_type?: LaneType;
  actor_authority?: ActorAuthority;
  metadata?: Record<string, unknown>;
};

export type GovernanceGateInput = {
  lane_type: LaneType;
  proposal_role?: string | null;
  current_state?: string | null;
  target_state?: string | null;
  actor_authority: ActorAuthority;
  /** How confidence was derived: inferred from evaluation, or defaulted placeholder. */
  confidence_truth?: string | null;
  /** Optional duplicate/near-duplicate signal (0–1). Higher = more duplicate pressure. */
  duplicate_signal?: number | null;
  /** Whether minimum qualitative/quantitative evidence is present for this action. */
  has_minimum_evidence?: boolean;
};

/**
 * Stable reason codes for Governance V1. Kept as string literals (not an enum)
 * so they are easy to persist and query from logs or decision traces.
 */
export const GOVERNANCE_REASON_CODES = {
  RUNNER_SYSTEM_PROPOSAL_FORBIDDEN: "RUNNER_SYSTEM_PROPOSAL_FORBIDDEN",
  NON_SURFACE_STAGING_FORBIDDEN: "NON_SURFACE_STAGING_FORBIDDEN",
  NON_SURFACE_PUBLIC_PROMOTION_FORBIDDEN: "NON_SURFACE_PUBLIC_PROMOTION_FORBIDDEN",
  ILLEGAL_PROPOSAL_STATE_TRANSITION: "ILLEGAL_PROPOSAL_STATE_TRANSITION",
  CONFIDENCE_DEFAULTED_WARNING: "CONFIDENCE_DEFAULTED_WARNING",
  CONFIDENCE_BELOW_THRESHOLD: "CONFIDENCE_BELOW_THRESHOLD",
  LANE_ROLE_MISMATCH: "LANE_ROLE_MISMATCH",
  INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE",
  DUPLICATE_PRESSURE_WARNING: "DUPLICATE_PRESSURE_WARNING",
  NON_SURFACE_PROMOTION_BLOCK: "NON_SURFACE_PROMOTION_BLOCK",
  /** proposal_type was provided but not found in canon/core/proposal_types.json */
  PROPOSAL_TYPE_NOT_IN_CANON: "PROPOSAL_TYPE_NOT_IN_CANON",
  /** agent_registry does not allow this agent to create proposals in this lane */
  AGENT_NOT_ALLOWED_FOR_LANE: "AGENT_NOT_ALLOWED_FOR_LANE",
  /** Lane is not stageable per canon (lane_map / promotion_rules). */
  LANE_NOT_STAGEABLE: "LANE_NOT_STAGEABLE",
  /** proposal_type not provided; used legacy fallback (deprecated). */
  DEPRECATED_LEGACY_FALLBACK: "DEPRECATED_LEGACY_FALLBACK",
} as const;

type GovernanceReasonCode =
  (typeof GOVERNANCE_REASON_CODES)[keyof typeof GOVERNANCE_REASON_CODES];

export type LaneClassificationInput = {
  /** Canon proposal type (e.g. system_change, schema_change). When set, lane is derived from canon primary_lane. */
  proposal_type?: string | null;
  /** Proposed lane from caller (optional; used as a hint when not using proposal_type). */
  requested_lane?: LaneType | null;
  /** Domain role for this proposal (legacy: habitat_layout, avatar_candidate, medium_extension). Used when proposal_type is not set. */
  proposal_role?: string | null;
  /** Target surface when applicable (e.g. staging_habitat, public_habitat, identity). */
  target_surface?: string | null;
  /** Target type when helpful for classification (e.g. concept, avatar_candidate, extension). */
  target_type?: string | null;
};

export type LaneClassification = {
  lane_type: LaneType;
  /** Canon lane_id when classification was from canon (e.g. build_lane). */
  canon_lane_id?: string | null;
  proposal_role: string | null;
  target_surface: string | null;
  classification_reason: string;
  reason_codes: GovernanceReasonCode[];
};

/** When true, allow legacy classification when proposal_type is missing. When false, fallback path is disabled. */
function allowLegacyLaneFallback(): boolean {
  const v = process.env.ALLOW_LEGACY_PROPOSAL_LANE_FALLBACK;
  return v === "1" || v === "true" || v === "yes";
}

/** Instrumentation: log when deprecated fallback is used (for migration monitoring). */
function logLegacyFallbackHit(input: LaneClassificationInput, reason: string): void {
  try {
    if (typeof process !== "undefined" && process.env.NODE_ENV !== "test") {
      console.warn("[proposal-governance] DEPRECATED_LEGACY_FALLBACK hit", {
        reason,
        has_proposal_type: Boolean((input.proposal_type ?? "").trim()),
        requested_lane: input.requested_lane ?? null,
      });
    }
  } catch {
    // no-op if console or env unavailable
  }
}

/**
 * Canonical lane classification. Canon is source of truth.
 * - When proposal_type is provided and valid in canon: lane = proposal_types[].primary_lane, mapped to DB LaneType.
 * - When proposal_type is missing: only allowed if ALLOW_LEGACY_PROPOSAL_LANE_FALLBACK is set; otherwise same as invalid (build_lane + DEPRECATED_LEGACY_FALLBACK). Instrumentation logs fallback hits.
 */
export function classifyProposalLane(input: LaneClassificationInput): LaneClassification {
  const role = (input.proposal_role ?? "").trim() || null;
  const targetSurface = (input.target_surface ?? "").trim() || null;
  const requested = input.requested_lane ?? null;
  const proposalType = (input.proposal_type ?? "").trim() || null;

  if (proposalType) {
    const primaryLane = getPrimaryLaneForProposalType(proposalType);
    if (primaryLane != null) {
      const lane_type = canonLaneToDb(primaryLane);
      return {
        lane_type,
        canon_lane_id: primaryLane,
        proposal_role: role ?? proposalType,
        target_surface: targetSurface,
        classification_reason: `Lane from canon: proposal_type=${proposalType} → primary_lane=${primaryLane}.`,
        reason_codes: [],
      };
    }
    const reason_codes: GovernanceReasonCode[] = [GOVERNANCE_REASON_CODES.PROPOSAL_TYPE_NOT_IN_CANON];
    return {
      lane_type: "surface",
      canon_lane_id: null,
      proposal_role: role ?? proposalType,
      target_surface: targetSurface,
      classification_reason: `proposal_type '${proposalType}' not in canon; defaulting to surface.`,
      reason_codes,
    };
  }

  // Deprecated fallback: only when env ALLOW_LEGACY_PROPOSAL_LANE_FALLBACK is set. Instrumentation logs every hit.
  if (!allowLegacyLaneFallback()) {
    logLegacyFallbackHit(input, "fallback_disabled_no_proposal_type");
  }

  if (requested) {
    if (allowLegacyLaneFallback()) {
      logLegacyFallbackHit(input, "requested_lane_used");
    }
    return {
      lane_type: requested,
      proposal_role: role,
      target_surface: targetSurface,
      classification_reason: "Lane from caller requested_lane (deprecated: prefer proposal_type).",
      reason_codes: [GOVERNANCE_REASON_CODES.DEPRECATED_LEGACY_FALLBACK],
    };
  }

  if (allowLegacyLaneFallback()) {
    logLegacyFallbackHit(input, "default_build_lane");
  }
  return {
    lane_type: "surface",
    canon_lane_id: "build_lane",
    proposal_role: role,
    target_surface: targetSurface,
    classification_reason:
      "No proposal_type provided; defaulting to build_lane (surface). Deprecated: callers should pass proposal_type from canon.",
    reason_codes: [GOVERNANCE_REASON_CODES.DEPRECATED_LEGACY_FALLBACK],
  };
}

/**
 * Validate proposal_type against canon. Returns true if it exists in proposal_types.json.
 */
export function validateProposalType(proposalType: string): boolean {
  return isValidProposalType(proposalType);
}

/** Simple helper for sites that need to tag actor authority explicitly. */
export function getProposalAuthority(
  kind: "runner" | "http_user" | "reviewer" | "unknown"
): ActorAuthority {
  if (kind === "runner") return "runner";
  if (kind === "http_user") return "human";
  if (kind === "reviewer") return "reviewer";
  return "unknown";
}

/** Map ActorAuthority to canon agent_id for agent_registry lookups. */
export function getAgentIdForAuthority(actor: ActorAuthority): string {
  if (actor === "runner") return "agent_9";
  if (actor === "human") return "human";
  if (actor === "reviewer") return "risk_audit_agent";
  return "unknown";
}

/**
 * Check whether the actor may create a proposal in the given lane.
 * Authority is resolved from canon/core/agent_registry.json (lane_permissions, allowed_actions, restricted_actions).
 * Human always allowed. Unknown agent blocks.
 */
export function canCreateProposal(
  lane: LaneType,
  actor: ActorAuthority
): GovernanceResult {
  const reason_codes: GovernanceReasonCode[] = [];

  if (actor === "human") {
    return {
      ok: true,
      decision: "allow",
      reason_codes,
      lane_type: lane,
      actor_authority: actor,
    };
  }

  const agentId = getAgentIdForAuthority(actor);
  if (agentId === "unknown") {
    reason_codes.push(GOVERNANCE_REASON_CODES.AGENT_NOT_ALLOWED_FOR_LANE);
    return {
      ok: false,
      decision: "block",
      reason_codes,
      lane_type: lane,
      actor_authority: actor,
      metadata: { message: "Unknown actor; cannot resolve agent_registry entry." },
    };
  }

  const canonLaneId = dbLaneToCanon(lane);
  const allowed = agentCanCreateProposalInLane(agentId, canonLaneId);
  if (!allowed) {
    reason_codes.push(GOVERNANCE_REASON_CODES.AGENT_NOT_ALLOWED_FOR_LANE);
    return {
      ok: false,
      decision: "block",
      reason_codes,
      lane_type: lane,
      actor_authority: actor,
      metadata: {
        message: `Agent ${agentId} may not create proposals in lane ${canonLaneId} per agent_registry.`,
        agent_id: agentId,
        canon_lane_id: canonLaneId,
      },
    };
  }

  return {
    ok: true,
    decision: "allow",
    reason_codes,
    lane_type: lane,
    actor_authority: actor,
  };
}

export type TransitionCheckInput = {
  current_state: string;
  target_state: string;
  lane_type: LaneType;
  actor_authority: ActorAuthority;
};

/**
 * Central transition guard for proposal_record.proposal_state.
 * Wraps the FSM (isLegalProposalStateTransition) with lane/authority rules.
 */
export function canTransitionProposalState(input: TransitionCheckInput): GovernanceResult {
  const { current_state, target_state, lane_type, actor_authority } = input;
  const reason_codes: GovernanceReasonCode[] = [];

  // First, enforce the canonical FSM.
  const fsmOk = isLegalProposalStateTransition(current_state, target_state);
  if (!fsmOk) {
    reason_codes.push(GOVERNANCE_REASON_CODES.ILLEGAL_PROPOSAL_STATE_TRANSITION);
    return {
      ok: false,
      decision: "block",
      reason_codes,
      lane_type,
      actor_authority,
      metadata: {
        current_state,
        target_state,
      },
    };
  }

  // Stageability from canon: only lanes in STAGEABLE_CANON_LANES may transition to staging/public.
  const canonLaneId = dbLaneToCanon(lane_type) as CanonLaneId;
  const isStageableLane = STAGEABLE_CANON_LANES.includes(canonLaneId);
  const isPromotionTarget =
    target_state === "approved_for_staging" ||
    target_state === "staged" ||
    target_state === "approved_for_publication" ||
    target_state === "published";

  if (isPromotionTarget && !isStageableLane) {
    const code =
      target_state === "approved_for_staging" || target_state === "staged"
        ? GOVERNANCE_REASON_CODES.NON_SURFACE_STAGING_FORBIDDEN
        : GOVERNANCE_REASON_CODES.NON_SURFACE_PUBLIC_PROMOTION_FORBIDDEN;
    reason_codes.push(code, GOVERNANCE_REASON_CODES.LANE_NOT_STAGEABLE);
    return {
      ok: false,
      decision: "block",
      reason_codes,
      lane_type,
      actor_authority,
      metadata: {
        current_state,
        target_state,
        canon_lane_id: canonLaneId,
      },
    };
  }

  return {
    ok: true,
    decision: "allow",
    reason_codes,
    lane_type,
    actor_authority,
    metadata: {
      current_state,
      target_state,
    },
  };
}

/**
 * Privileged rollback/unpublish helper for proposal_state. This is used for
 * explicit unpublish/demote flows that conceptually "undo" publication and
 * return a proposal to an earlier governance state.
 *
 * Rules:
 * - Surface-only: only surface lane proposals may roll back into
 *   approved_for_staging / published-like bands.
 * - Normal FSM-legal transitions are always allowed.
 * - Additional allowed rollback jumps:
 *   published | approved_for_publication | staged → approved_for_staging | archived.
 */
export function canRollbackProposalState(input: TransitionCheckInput): GovernanceResult {
  const { current_state, target_state, lane_type, actor_authority } = input;
  const reason_codes: GovernanceReasonCode[] = [];

  // Surface-only constraint is preserved for privileged rollback too.
  const canonLaneId = dbLaneToCanon(lane_type) as CanonLaneId;
  const isStageableLane = STAGEABLE_CANON_LANES.includes(canonLaneId);
  const isRollbackToStaging =
    target_state === "approved_for_staging" ||
    target_state === "staged" ||
    target_state === "approved_for_publication" ||
    target_state === "published";
  if (isRollbackToStaging && !isStageableLane) {
    const code =
      target_state === "approved_for_staging" || target_state === "staged"
        ? GOVERNANCE_REASON_CODES.NON_SURFACE_STAGING_FORBIDDEN
        : GOVERNANCE_REASON_CODES.NON_SURFACE_PUBLIC_PROMOTION_FORBIDDEN;
    reason_codes.push(code, GOVERNANCE_REASON_CODES.LANE_NOT_STAGEABLE);
    return {
      ok: false,
      decision: "block",
      reason_codes,
      lane_type,
      actor_authority,
      metadata: { current_state, target_state, rollback: true, canon_lane_id: canonLaneId },
    };
  }

  // If the canonical FSM already allows this move, accept it.
  if (isLegalProposalStateTransition(current_state, target_state)) {
    return {
      ok: true,
      decision: "allow",
      reason_codes,
      lane_type,
      actor_authority,
      metadata: { current_state, target_state, rollback: true, via: "fsm" },
    };
  }

  // Explicit rollback exceptions.
  const ROLLBACK_SOURCES = ["published", "approved_for_publication", "staged"] as const;
  const ROLLBACK_TARGETS = ["approved_for_staging", "archived"] as const;

  if (
    (ROLLBACK_SOURCES as readonly string[]).includes(current_state) &&
    (ROLLBACK_TARGETS as readonly string[]).includes(target_state)
  ) {
    return {
      ok: true,
      decision: "allow",
      reason_codes,
      lane_type,
      actor_authority,
      metadata: {
        current_state,
        target_state,
        rollback: true,
        via: "privileged_rollback",
      },
    };
  }

  reason_codes.push(GOVERNANCE_REASON_CODES.ILLEGAL_PROPOSAL_STATE_TRANSITION);
  return {
    ok: false,
    decision: "block",
    reason_codes,
    lane_type,
    actor_authority,
    metadata: { current_state, target_state, rollback: true },
  };
}

/**
 * Convenience wrappers for promotion checks. These are thin shims over
 * canTransitionProposalState with pre-filled target_state.
 */
export function canPromoteProposalToStaging(
  lane: LaneType,
  current_state: string,
  actor: ActorAuthority
): GovernanceResult {
  return canTransitionProposalState({
    current_state,
    target_state: "approved_for_staging",
    lane_type: lane,
    actor_authority: actor,
  });
}

export function canPromoteProposalToPublic(
  lane: LaneType,
  current_state: string,
  actor: ActorAuthority
): GovernanceResult {
  return canTransitionProposalState({
    current_state,
    target_state: "approved_for_publication",
    lane_type: lane,
    actor_authority: actor,
  });
}

/**
 * Lightweight V1 governance gate. This is intentionally conservative and
 * focused on a few high-signal checks:
 * - defaulted/low confidence
 * - missing evidence
 * - duplicate/near-duplicate pressure
 * - non-surface promotion attempts
 *
 * Callers are expected to pass in the lane/target_state that is being
 * attempted; the gate never mutates state directly.
 */
export function evaluateGovernanceGate(input: GovernanceGateInput): GovernanceResult {
  const {
    lane_type,
    proposal_role,
    current_state,
    target_state,
    actor_authority,
    confidence_truth,
    duplicate_signal,
    has_minimum_evidence,
  } = input;

  const reason_codes: GovernanceReasonCode[] = [];
  let decision: GovernanceDecision = "allow";

  // Promotion to staging/public: only canon stageable lanes allowed (canTransitionProposalState is authoritative).
  const canonLaneId = dbLaneToCanon(lane_type) as CanonLaneId;
  const isStageableLane = STAGEABLE_CANON_LANES.includes(canonLaneId);
  const isPromotionTarget =
    target_state === "approved_for_staging" ||
    target_state === "staged" ||
    target_state === "approved_for_publication" ||
    target_state === "published";
  if (isPromotionTarget && !isStageableLane) {
    reason_codes.push(GOVERNANCE_REASON_CODES.NON_SURFACE_PROMOTION_BLOCK, GOVERNANCE_REASON_CODES.LANE_NOT_STAGEABLE);
    return {
      ok: false,
      decision: "block",
      reason_codes,
      lane_type,
      actor_authority,
      metadata: { current_state, target_state, proposal_role, canon_lane_id: canonLaneId },
    };
  }

  // Confidence defaulted (no evaluation) → warn at minimum; caller may upgrade to block.
  if (confidence_truth === "defaulted") {
    reason_codes.push(GOVERNANCE_REASON_CODES.CONFIDENCE_DEFAULTED_WARNING);
    decision = "warn";
  }

  // Very low confidence band (callers may encode via separate thresholds).
  // We do not see the numeric confidence here; the runner encodes a band by
  // setting has_minimum_evidence=false when confidence is too low.
  if (has_minimum_evidence === false) {
    reason_codes.push(GOVERNANCE_REASON_CODES.INSUFFICIENT_EVIDENCE);
    // Missing evidence on promotion/creation is a hard block.
    decision = "block";
  }

  // Duplicate / near-duplicate pressure is advisory in V1.
  if (duplicate_signal != null && duplicate_signal >= 0.8) {
    reason_codes.push(GOVERNANCE_REASON_CODES.DUPLICATE_PRESSURE_WARNING);
    if (decision === "allow") {
      decision = "warn";
    }
  }

  return {
    ok: decision !== "block",
    decision,
    reason_codes,
    lane_type,
    actor_authority,
    metadata: {
      proposal_role,
      current_state,
      target_state,
      confidence_truth,
      duplicate_signal,
      has_minimum_evidence,
    },
  };
}

