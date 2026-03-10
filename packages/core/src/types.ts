/**
 * Domain types aligned with docs/01_foundation/data_model.md.
 * Canonical entity shapes; do not rename fields without canon update.
 */

import type {
  ApprovalState,
  ArtifactLifecycleStatus,
  ArtifactMedium,
  ApprovalLane,
  CreativeDrive,
  CritiqueOutcome,
  FeedbackType,
  PublicationState,
  SessionMode,
} from "./enums.js";

export interface Identity {
  identity_id: string;
  version_label: string;
  name: string | null;
  summary: string | null;
  philosophy: string | null;
  creative_values: Record<string, unknown> | null;
  embodiment_direction: string | null;
  habitat_direction: string | null;
  status: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Project {
  project_id: string;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  status: string;
  priority: number | null;
  created_at: string;
  updated_at: string;
}

export interface IdeaThread {
  idea_thread_id: string;
  project_id: string | null;
  title: string;
  summary: string | null;
  description: string | null;
  parent_thread_id: string | null;
  primary_theme_ids: string[] | null;
  status: string;
  recurrence_score: number | null;
  creative_pull: number | null;
  created_at: string;
  updated_at: string;
}

export interface Idea {
  idea_id: string;
  project_id: string | null;
  title: string;
  summary: string | null;
  description: string | null;
  origin_session_id: string | null;
  status: string;
  recurrence_score: number | null;
  creative_pull: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreativeSession {
  session_id: string;
  project_id: string | null;
  mode: SessionMode;
  selected_drive: CreativeDrive | null;
  title: string | null;
  prompt_context: string | null;
  reflection_notes: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreativeStateSnapshot {
  state_snapshot_id: string;
  session_id: string;
  identity_stability: number | null;
  avatar_alignment: number | null;
  expression_diversity: number | null;
  unfinished_projects: number | null;
  recent_exploration_rate: number | null;
  creative_tension: number | null;
  curiosity_level: number | null;
  reflection_need: number | null;
  idea_recurrence: number | null;
  public_curation_backlog: number | null;
  notes: string | null;
  created_at: string;
}

export interface Artifact {
  artifact_id: string;
  project_id: string | null;
  session_id: string | null;
  primary_idea_id: string | null;
  primary_thread_id: string | null;
  title: string;
  summary: string | null;
  medium: ArtifactMedium;
  lifecycle_status: ArtifactLifecycleStatus;
  current_approval_state: ApprovalState | null;
  current_publication_state: PublicationState | null;
  content_text: string | null;
  content_uri: string | null;
  preview_uri: string | null;
  notes: string | null;
  alignment_score: number | null;
  emergence_score: number | null;
  fertility_score: number | null;
  pull_score: number | null;
  recurrence_score: number | null;
  artifact_role: string | null;
  created_at: string;
  updated_at: string;
}

export interface CritiqueRecord {
  critique_record_id: string;
  artifact_id: string;
  session_id: string | null;
  intent_note: string | null;
  strength_note: string | null;
  originality_note: string | null;
  energy_note: string | null;
  potential_note: string | null;
  medium_fit_note: string | null;
  coherence_note: string | null;
  fertility_note: string | null;
  overall_summary: string | null;
  critique_outcome: CritiqueOutcome | null;
  created_at: string;
  updated_at: string;
}

export interface EvaluationSignal {
  evaluation_signal_id: string;
  target_type: "artifact" | "idea" | "idea_thread" | "session";
  target_id: string;
  alignment_score: number | null;
  emergence_score: number | null;
  fertility_score: number | null;
  pull_score: number | null;
  recurrence_score: number | null;
  resonance_score: number | null;
  rationale: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalRecord {
  approval_record_id: string;
  artifact_id: string;
  approval_state: ApprovalState;
  reviewer: string | null;
  review_note: string | null;
  annotation_note: string | null;
  decided_at: string;
  created_at: string;
  updated_at: string;
}

export interface PublicationRecord {
  publication_record_id: string;
  artifact_id: string;
  publication_state: PublicationState;
  changed_by: string | null;
  note: string | null;
  effective_at: string;
  created_at: string;
  updated_at: string;
}

export interface ProposalRecord {
  proposal_record_id: string;
  lane_type: ApprovalLane;
  target_type: string;
  target_id: string | null;
  target_surface: string | null;
  title: string;
  summary: string | null;
  proposal_role: string | null;
  proposal_state: string;
  preview_uri: string | null;
  review_note: string | null;
  habitat_payload_json: object | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GenerationRun {
  generation_run_id: string;
  session_id: string;
  artifact_id: string | null;
  medium: ArtifactMedium;
  provider_name: string | null;
  model_name: string | null;
  prompt_snapshot: string | null;
  context_snapshot: string | null;
  run_status: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArchiveEntry {
  archive_entry_id: string;
  project_id: string | null;
  artifact_id: string | null;
  idea_id: string | null;
  idea_thread_id: string | null;
  reason_paused: string | null;
  unresolved_question: string | null;
  creative_pull: number | null;
  recurrence_score: number | null;
  notes_from_harvey: string | null;
  last_session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryRecord {
  memory_record_id: string;
  project_id: string | null;
  memory_type: string;
  summary: string;
  details: string | null;
  source_session_id: string | null;
  source_artifact_id: string | null;
  importance_score: number | null;
  recurrence_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface HumanFeedback {
  feedback_id: string;
  target_type: string;
  target_id: string;
  feedback_type: FeedbackType;
  score: number | null;
  note: string | null;
  tags: string[] | null;
  created_by: string;
  created_at: string;
}

export interface SourceItem {
  source_item_id: string;
  project_id: string | null;
  title: string;
  source_type: string;
  summary: string | null;
  content_text: string | null;
  content_uri: string | null;
  origin_reference: string | null;
  ingested_at: string;
  created_at: string;
  updated_at: string;
}
