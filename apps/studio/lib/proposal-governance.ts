/**
 * Governance V1: explicit lane/authority/transition rules for proposals.
 *
 * This module is the central place where:
 * - Proposal lanes are classified (surface | medium | system).
 * - Actor authority is modeled (runner | human | reviewer | unknown).
 * - Legal proposal state transitions are checked (including lane guards).
 * - Staging/public promotion eligibility is enforced.
 * - Lightweight governance gates run on creation/promotion.
 *
 * It intentionally returns structured results (reason_codes, metadata)
 * instead of bare booleans so callers can log/audit decisions.
 */

import { isLegalProposalStateTransition } from "./governance-rules";

export type LaneType = "surface" | "medium" | "system";

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
} as const;

type GovernanceReasonCode =
  (typeof GOVERNANCE_REASON_CODES)[keyof typeof GOVERNANCE_REASON_CODES];

export type LaneClassificationInput = {
  /** Proposed lane from caller (optional; used as a hint, not canon). */
  requested_lane?: LaneType | null;
  /** Domain role for this proposal (e.g. habitat_layout, avatar_candidate, medium_extension). */
  proposal_role?: string | null;
  /** Target surface when applicable (e.g. staging_habitat, public_habitat, identity). */
  target_surface?: string | null;
  /** Target type when helpful for classification (e.g. concept, avatar_candidate, extension). */
  target_type?: string | null;
};

export type LaneClassification = {
  lane_type: LaneType;
  proposal_role: string | null;
  target_surface: string | null;
  classification_reason: string;
  reason_codes: GovernanceReasonCode[];
};

/**
 * Canonical lane classification. Centralizes lane decisions so that:
 * - surface: user-facing presentation / habitat / avatar / layout.
 * - medium: capability/extension/medium expansion.
 * - system: runtime/governance/architecture/process.
 *
 * Caller still owns the proposal_role semantics; this function only interprets
 * them through governance canon.
 */
export function classifyProposalLane(input: LaneClassificationInput): LaneClassification {
  const role = (input.proposal_role ?? "").trim() || null;
  const targetSurface = (input.target_surface ?? "").trim() || null;
  const requested = input.requested_lane ?? null;

  // Explicit system roles always win; system classification overrides hints.
  const systemRoles = new Set<string>([
    "system_proposal",
    "governance_change",
    "runtime_change",
    "architecture_change",
    "policy_change",
  ]);
  if (role && systemRoles.has(role)) {
    return {
      lane_type: "system",
      proposal_role: role,
      target_surface: targetSurface,
      classification_reason: "Role indicates governance/runtime/architecture concern; classified as system lane.",
      reason_codes: [],
    };
  }

  // Extension / capability roles → medium lane.
  const mediumRoles = new Set<string>([
    "medium_extension",
    "toolchain_extension",
    "workflow_extension",
    "surface_environment_extension",
    "system_capability_extension",
    "extension",
  ]);
  if (role && mediumRoles.has(role)) {
    return {
      lane_type: "medium",
      proposal_role: role,
      target_surface: targetSurface,
      classification_reason: "Role indicates capability/extension work; classified as medium lane.",
      reason_codes: [],
    };
  }

  // Habitat / avatar / other user-facing surfaces → surface lane.
  const surfaceRoles = new Set<string>([
    "habitat_layout",
    "layout_concept",
    "surface_proposal",
    "avatar_candidate",
    "interactive_module",
  ]);
  if (
    role && surfaceRoles.has(role) ||
    (targetSurface && ["staging_habitat", "public_habitat", "identity"].includes(targetSurface))
  ) {
    return {
      lane_type: "surface",
      proposal_role: role,
      target_surface: targetSurface,
      classification_reason:
        "Role/target_surface indicate user-facing presentation or identity; classified as surface lane.",
      reason_codes: [],
    };
  }

  // Fallback: honor a requested lane when present, else default to surface.
  if (requested) {
    return {
      lane_type: requested,
      proposal_role: role,
      target_surface: targetSurface,
      classification_reason: "Lane inferred from caller hint (requested_lane); no conflicting canon signals.",
      reason_codes: [],
    };
  }

  return {
    lane_type: "surface",
    proposal_role: role,
    target_surface: targetSurface,
    classification_reason:
      "No explicit lane hint; defaulting to surface per artifact-first rule (user-facing proposals are surface unless marked otherwise).",
    reason_codes: [],
  };
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

export function canCreateProposal(
  lane: LaneType,
  actor: ActorAuthority
): GovernanceResult {
  const reason_codes: GovernanceReasonCode[] = [];

  if (lane === "system" && actor === "runner") {
    reason_codes.push(GOVERNANCE_REASON_CODES.RUNNER_SYSTEM_PROPOSAL_FORBIDDEN);
    return {
      ok: false,
      decision: "block",
      reason_codes,
      lane_type: lane,
      actor_authority: actor,
      metadata: {
        message: "Runner may not create system proposals; human/operator must initiate.",
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

  // Surface-only promotion states.
  const isSurfaceOnlyTarget =
    target_state === "approved_for_staging" ||
    target_state === "staged" ||
    target_state === "approved_for_publication" ||
    target_state === "published";

  if (isSurfaceOnlyTarget && lane_type !== "surface") {
    const code =
      target_state === "approved_for_staging" || target_state === "staged"
        ? GOVERNANCE_REASON_CODES.NON_SURFACE_STAGING_FORBIDDEN
        : GOVERNANCE_REASON_CODES.NON_SURFACE_PUBLIC_PROMOTION_FORBIDDEN;
    reason_codes.push(code);
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
  const isSurfaceOnlyTarget =
    target_state === "approved_for_staging" ||
    target_state === "staged" ||
    target_state === "approved_for_publication" ||
    target_state === "published";
  if (isSurfaceOnlyTarget && lane_type !== "surface") {
    const code =
      target_state === "approved_for_staging" || target_state === "staged"
        ? GOVERNANCE_REASON_CODES.NON_SURFACE_STAGING_FORBIDDEN
        : GOVERNANCE_REASON_CODES.NON_SURFACE_PUBLIC_PROMOTION_FORBIDDEN;
    reason_codes.push(code);
    return {
      ok: false,
      decision: "block",
      reason_codes,
      lane_type,
      actor_authority,
      metadata: { current_state, target_state, rollback: true },
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

  // Non-surface promotion to staging/public is hard-blocked here as well,
  // but canTransitionProposalState is the authoritative lane/state guard.
  const isPromotionTarget =
    target_state === "approved_for_staging" ||
    target_state === "staged" ||
    target_state === "approved_for_publication" ||
    target_state === "published";
  if (isPromotionTarget && lane_type !== "surface") {
    reason_codes.push(GOVERNANCE_REASON_CODES.NON_SURFACE_PROMOTION_BLOCK);
    return {
      ok: false,
      decision: "block",
      reason_codes,
      lane_type,
      actor_authority,
      metadata: { current_state, target_state, proposal_role },
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

