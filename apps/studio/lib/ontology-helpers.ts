import type { SessionMode, CreativeDrive } from "@twin/core";
import type { BrainContextResult } from "@/lib/brain-context";
import type { SessionPipelineResult } from "@twin/agent";

// Minimal slice of SessionExecutionState required for ontology helpers.
export interface OntologyState {
  sessionMode: SessionMode;
  selectedDrive: CreativeDrive | null;
  selectionSource: "archive" | "project_thread" | null;
  liveBacklog: number;
  previousState: {
    reflection_need: number;
    public_curation_backlog: number;
    idea_recurrence: number;
    avatar_alignment: number;
  };
  repetitionDetected: boolean;
  archiveCandidateAvailable: boolean;
  selectedIdeaId: string | null;
  proposalCreated: boolean;
  traceProposalType: string | null;
}

export function classifyNarrativeState(state: OntologyState): string {
  const { sessionMode, liveBacklog, previousState, repetitionDetected } = state;
  if (sessionMode === "return" || state.selectionSource === "archive") {
    return "return";
  }
  if (repetitionDetected) {
    return "stalled";
  }
  if (previousState.reflection_need > 0.6) {
    return "reflection";
  }
  if (liveBacklog > 0.6 || previousState.public_curation_backlog > 0.6) {
    return "curation_pressure";
  }
  return "expansion";
}

export function classifyConfidenceBand(confidence: number | null | undefined): "low" | "medium" | "high" {
  if (confidence == null || !Number.isFinite(confidence)) return "medium";
  if (confidence < 0.4) return "low";
  if (confidence < 0.7) return "medium";
  return "high";
}

export function classifyActionKind(state: OntologyState): string {
  if (state.selectionSource === "archive") {
    return "resurface_archive";
  }
  if (state.proposalCreated && state.traceProposalType === "surface") {
    return "generate_habitat_candidate";
  }
  if (state.proposalCreated && state.traceProposalType === "avatar") {
    return "generate_avatar_candidate";
  }
  if (state.sessionMode === "return") {
    return "continue_thread";
  }
  return "continue_thread";
}

export function deriveTensionKinds(state: OntologyState): string[] {
  const kinds: string[] = [];
  if (state.liveBacklog > 0.4 || state.previousState.public_curation_backlog > 0.4) {
    kinds.push("backlog_pressure", "surface_pressure");
  }
  if (state.archiveCandidateAvailable) {
    kinds.push("unfinished_pull");
  }
  if (state.previousState.idea_recurrence > 0.5) {
    kinds.push("recurrence_pull");
  }
  if (state.previousState.avatar_alignment < 0.4) {
    kinds.push("identity_pressure");
  }
  return kinds;
}

export function deriveEvidenceKinds(state: OntologyState): string[] {
  const kinds = new Set<string>();
  kinds.add("creative_state");
  kinds.add("project_context");
  if (state.selectedIdeaId) {
    kinds.add("idea_context");
  }
  if (state.archiveCandidateAvailable) {
    kinds.add("archive");
  }
  if (state.liveBacklog > 0 || state.previousState.public_curation_backlog > 0) {
    kinds.add("proposal_backlog");
  }
  return Array.from(kinds);
}

