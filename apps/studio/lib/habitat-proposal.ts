import type { ProposalRecord } from "@twin/core";

/**
 * Narrow V1 habitat proposal kind. These proposals are lab-ingestible
 * candidates for updating the public "home" surface, not direct edits.
 */
export type HabitatChangeType =
  | "update_current_focus"
  | "add_recent_artifact"
  | "add_summary_block";

export interface HabitatProposalV1 {
  /** Local identifier for the proposal candidate (not DB primary key). */
  proposal_id: string;
  /** Identity this proposal is associated with (nullable for now). */
  identity_id: string | null;
  /** Fixed kind for this V1 contract. */
  proposal_kind: "habitat_update";
  /** Target surface within the habitat system. */
  target_surface: "home";
  /** What kind of change this proposal represents. */
  change_type: HabitatChangeType;
  /** Optional continuity linkage to the originating session. */
  source_session_id: string | null;
  /** Optional linkage to the originating artifact (e.g. milestone concept). */
  source_artifact_id: string | null;
  /** Human-readable reason for the proposed change. */
  source_reason: string;
  /** Minimal, explicit payload suitable for later ingestion. */
  proposed_payload: Record<string, unknown>;
  /** Confidence signal from runtime (0–1) or null when unavailable. */
  confidence: number | null;
  /** ISO timestamp when the proposal candidate was generated. */
  created_at: string;
  /** Simple lifecycle hint for downstream tooling; not a full FSM. */
  status: "candidate" | "superseded";
}

/**
 * Narrow bridge contract for lab ingestion.
 * This intentionally strips Twin_V1-only fields (confidence, created_at, status)
 * so that outbound payloads match the lab's strict HabitatProposalV1 schema.
 */
export interface LabHabitatProposalV1 {
  proposal_id: string;
  identity_id: string | null;
  proposal_kind: "habitat_update";
  target_surface: "home";
  change_type: HabitatChangeType;
  source_session_id: string | null;
  source_artifact_id: string | null;
  source_reason: string;
  proposed_payload: Record<string, unknown>;
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
): HabitatProposalV1[] {
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
  const proposals: HabitatProposalV1[] = [];

  const base: Pick<
    HabitatProposalV1,
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
      change_type: "update_current_focus",
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
      change_type: "add_recent_artifact",
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
      change_type: "add_summary_block",
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
 * Convert a rich internal HabitatProposalV1 into the narrow lab bridge shape.
 * Only the fields in the strict HabitatProposalV1 contract are preserved.
 */
export function toLabHabitatProposalV1(
  proposal: HabitatProposalV1
): LabHabitatProposalV1 {
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
 * Map an array of rich proposals to the strict lab-facing bridge contract.
 */
export function toLabHabitatProposalV1List(
  proposals: HabitatProposalV1[]
): LabHabitatProposalV1[] {
  return proposals.map(toLabHabitatProposalV1);
}

