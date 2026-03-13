import type {
  HabitatProposalV1,
  HabitatProposalV1ChangeType,
} from "@twin/core";

/**
 * Twin_V1-internal habitat proposal shape.
 * Extends the shared bridge contract with runtime-only fields.
 */
export interface TwinHabitatProposal extends HabitatProposalV1 {
  /** Confidence signal from runtime (0–1) or null when unavailable. */
  confidence: number | null;
  /** ISO timestamp when the proposal candidate was generated. */
  created_at: string;
  /** Simple lifecycle hint for downstream tooling; not a full FSM. */
  status: "candidate" | "superseded";
}

/**
 * Inputs required to deterministically generate habitat proposals.
 * Purely in-memory; does not depend on Supabase.
 */
export interface HabitatProposalGenerationContext {
  identityId: string | null;
  sessionId: string | null;
  /** Optional primary artifact that may be considered a milestone. */
  milestoneArtifact?: {
    artifact_id: string;
    title: string | null;
    summary: string | null;
    /** When true, eligible for recent-artifact / summary proposals. */
    isMilestone: boolean;
  } | null;
  /** Previous and current "focus" description for the home surface. */
  previousFocus: string | null;
  currentFocus: string | null;
  /** Confidence from the originating decision summary (0–1). */
  decisionConfidence: number | null;
  /** Optional override for created_at to keep tests fully deterministic. */
  now?: string;
  /** Optional ID factory for deterministic proposal_id in tests. */
  proposalIdFactory?: () => string;
}

function makeProposalId(factory?: () => string): string {
  if (factory) return factory();
  // Use crypto.randomUUID when available; fall back to a simple prefix.
  try {
    // eslint-disable-next-line no-undef
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      // eslint-disable-next-line no-undef
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `habitat-proposal-${Math.random().toString(36).slice(2)}`;
}

/**
 * Deterministic helper: generate zero or more V1 habitat proposals from a
 * narrow runtime snapshot. This does NOT write to the database; it only
 * constructs contract-shaped proposal candidates that can later be ingested
 * into staging by the lab.
 */
export function generateHabitatProposals(
  ctx: HabitatProposalGenerationContext
): TwinHabitatProposal[] {
  const {
    identityId,
    sessionId,
    milestoneArtifact,
    previousFocus,
    currentFocus,
    decisionConfidence,
    now,
    proposalIdFactory,
  } = ctx;

  const createdAt = now ?? new Date().toISOString();
  const proposals: TwinHabitatProposal[] = [];

  const base: Pick<
    TwinHabitatProposal,
    | "identity_id"
    | "proposal_kind"
    | "target_surface"
    | "source_session_id"
    | "confidence"
    | "created_at"
    | "status"
  > = {
    identity_id: identityId,
    proposal_kind: "habitat_update",
    target_surface: "home",
    source_session_id: sessionId,
    confidence: decisionConfidence ?? null,
    created_at: createdAt,
    status: "candidate",
  };

  // 1) Focus change → update_current_focus
  const trimmedPrev = (previousFocus ?? "").trim();
  const trimmedCurrent = (currentFocus ?? "").trim();
  if (trimmedCurrent && trimmedCurrent !== trimmedPrev) {
    proposals.push({
      proposal_id: makeProposalId(proposalIdFactory),
      ...base,
      change_type: "update_current_focus" satisfies HabitatProposalV1ChangeType,
      source_artifact_id: milestoneArtifact?.artifact_id ?? null,
      source_reason:
        "Current focus changed materially; propose updating the home habitat focus block.",
      proposed_payload: {
        block_type: "focus",
        operation: "upsert",
        content: {
          label: "Current Focus",
          text: trimmedCurrent,
        },
      },
    });
  }

  // 2) Milestone artifact ⇒ add_recent_artifact + add_summary_block
  if (milestoneArtifact && milestoneArtifact.isMilestone) {
    const title = milestoneArtifact.title ?? "Recent milestone";
    const summary =
      milestoneArtifact.summary ??
      "Recent artifact produced by Twin_V1 (no summary provided).";

    proposals.push({
      proposal_id: makeProposalId(proposalIdFactory),
      ...base,
      change_type: "add_recent_artifact" satisfies HabitatProposalV1ChangeType,
      source_artifact_id: milestoneArtifact.artifact_id,
      source_reason:
        "Milestone artifact detected; propose adding a recent-artifact block to the home habitat.",
      proposed_payload: {
        block_type: "artifact",
        operation: "append",
        content: {
          title,
          artifact_id: milestoneArtifact.artifact_id,
          summary,
        },
      },
    });

    proposals.push({
      proposal_id: makeProposalId(proposalIdFactory),
      ...base,
      change_type: "add_summary_block" satisfies HabitatProposalV1ChangeType,
      source_artifact_id: milestoneArtifact.artifact_id,
      source_reason:
        "Milestone artifact detected; propose a short summary text block for the home habitat.",
      proposed_payload: {
        block_type: "text",
        operation: "append",
        content: {
          title: "Latest update",
          text: summary,
        },
      },
    });
  }

  return proposals;
}

/**
 * Convert a rich internal TwinHabitatProposal into the shared bridge shape.
 * Only the fields in the canonical HabitatProposalV1 contract are preserved.
 */
export function toBridgeHabitatProposalV1(
  proposal: TwinHabitatProposal
): HabitatProposalV1 {
  return {
    proposal_id: proposal.proposal_id,
    identity_id: proposal.identity_id,
    proposal_kind: proposal.proposal_kind,
    target_surface: proposal.target_surface,
    change_type: proposal.change_type,
    source_session_id: proposal.source_session_id,
    source_artifact_id: proposal.source_artifact_id,
    source_reason: proposal.source_reason,
    proposed_payload: proposal.proposed_payload,
  };
}

/**
 * Map an array of rich proposals to the shared bridge contract.
 */
export function toBridgeHabitatProposalV1List(
  proposals: TwinHabitatProposal[]
): HabitatProposalV1[] {
  return proposals.map(toBridgeHabitatProposalV1);
}

