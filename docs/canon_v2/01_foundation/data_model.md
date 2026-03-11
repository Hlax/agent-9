# Data model (canon v2)

This document describes the **actual** persisted entities and their roles as enforced by the codebase (migrations, `packages/core` types, and runtime). It is the source of truth for the V2 runtime.

---

## 1. Core entities

### identity

- **Purpose**: Single canonical identity (Twin + Harvey). One row is active at a time.
- **Key fields**: `identity_id`, `name`, `summary`, `philosophy`, `embodiment_direction`, `habitat_direction`, `status`, `is_active`, `created_at`, `updated_at`.
- **Runtime-written**: `name`, `name_status`, `naming_readiness_score`, `naming_readiness_notes` (when present in schema); `active_avatar_artifact_id` (set only via proposal approval or PATCH /api/identity).
- **Governance**: Identity mutations (name, avatar, directions) are human-gated. The Twin does not write identity directly except as part of approved proposal application.

### project

- **Purpose**: Top-level container for ideas and threads.
- **Key fields**: `project_id`, `title`, `slug`, `summary`, `description`, `status`, `priority`, `created_at`, `updated_at`.

### idea_thread

- **Purpose**: Thematic thread; links to ideas; has `recurrence_score` and `creative_pull` used by session selection.
- **Key fields**: `idea_thread_id`, `project_id`, `title`, `summary`, `description`, `parent_thread_id`, `primary_theme_ids`, `status`, `recurrence_score`, `creative_pull`, `created_at`, `updated_at`.
- **Runtime-written**: `recurrence_score` is written back by the session runner after evaluation (recurrence writeback).

### idea

- **Purpose**: Single idea; can be linked to threads via `idea_to_thread`; has `recurrence_score` and `creative_pull`.
- **Key fields**: `idea_id`, `project_id`, `origin_session_id`, `title`, `summary`, `description`, `status`, `recurrence_score`, `creative_pull`, `created_at`, `updated_at`.
- **Runtime-written**: `recurrence_score` is written back by the session runner.

### creative_session

- **Purpose**: One run of the session orchestrator (mode, drive, project/thread/idea, timestamps).
- **Key fields**: `session_id`, `project_id`, `mode`, `selected_drive`, `title`, `prompt_context`, `reflection_notes`, `started_at`, `ended_at`, `created_at`, `updated_at`.
- **Runtime-written**: `trace` (JSONB), `decision_summary` (JSONB). Both are set by the session runner after persistence and deliberation trace.

---

## 2. Creative state and memory

### creative_state_snapshot

- **Purpose**: Point-in-time creative state (0–1 scores) produced after each artifact in a session.
- **Key fields**: `state_snapshot_id`, `session_id`, `identity_stability`, `avatar_alignment`, `expression_diversity`, `unfinished_projects`, `recent_exploration_rate`, `creative_tension`, `curiosity_level`, `reflection_need`, `idea_recurrence`, `public_curation_backlog`, `notes`, `created_at`.
- **Constraint**: All numeric state fields are CHECKed 0–1 where present.
- **Write order**: Inserted in `persistDerivedState` after artifact/critique/evaluation and before memory_record.

### memory_record

- **Purpose**: Session-level reflection and context for future sessions (e.g. "Recently exploring").
- **Key fields**: `memory_record_id`, `project_id`, `memory_type`, `summary`, `details`, `source_session_id`, `source_artifact_id`, `importance_score`, `recurrence_score`, `created_at`, `updated_at`.
- **Runtime**: One row per completed session (memory_type `session_reflection`), written in `persistDerivedState`.

---

## 3. Artifact lane

### artifact

- **Purpose**: A single creative output (writing, concept, image). Approval and publication are separate.
- **Key fields**: `artifact_id`, `project_id`, `session_id`, `primary_idea_id`, `primary_thread_id`, `title`, `summary`, `medium`, `lifecycle_status`, `current_approval_state`, `current_publication_state`, `content_text`, `content_uri`, `preview_uri`, `notes`, `alignment_score`, `emergence_score`, `fertility_score`, `pull_score`, `recurrence_score`, `artifact_role`, `created_at`, `updated_at`.
- **Optional (migrations)**: `artifact_role`, `target_surface` — used when present for staging/publish gating.
- **Governance**: `current_approval_state` is constrained by the artifact approval FSM (see 03_governance/state_machines.md). Publication is a separate action and requires `approved_for_publication`.

### critique_record

- **Purpose**: Self-critique result for one artifact (outcome, notes). Not approval.
- **Key fields**: `critique_record_id`, `artifact_id`, `session_id`, notes fields, `critique_outcome`, `created_at`, `updated_at`.
- **Write order**: Inserted in `persistCoreOutputs` after session and artifact.

### evaluation_signal

- **Purpose**: Derived scores (alignment, emergence, fertility, pull, recurrence) from critique; used for creative state and recurrence writeback.
- **Key fields**: `evaluation_signal_id`, `target_type`, `target_id`, score fields, `rationale`, `created_at`, `updated_at`.
- **Write order**: Inserted in `persistCoreOutputs` after critique; artifact row is then updated with these scores.

### approval_record

- **Purpose**: Audit log of artifact approval state changes (who, when, note).
- **Written by**: POST /api/artifacts/[id]/approve after a legal transition.

### publication_record

- **Purpose**: Audit log of publication state changes.
- **Written by**: POST /api/artifacts/[id]/publish when the artifact is `approved_for_publication` and passes the staging gate.

---

## 4. Proposal lane (surface/system)

### proposal_record

- **Purpose**: A suggested change (habitat layout, avatar candidate, identity name, etc.). State is governed by the proposal FSM; applying the change is human-gated.
- **Key fields**: `proposal_record_id`, `lane_type`, `target_type`, `target_id`, `artifact_id`, `target_surface`, `title`, `summary`, `proposal_role`, `proposal_state`, `preview_uri`, `review_note`, `habitat_payload_json`, `created_by`, `created_at`, `updated_at`.
- **Runtime-created**: Session runner creates rows for habitat_layout (concept) and avatar_candidate (image) under caps; does not transition or apply them.
- **Governance**: PATCH /api/proposals/[id] and POST /api/proposals/[id]/approve enforce the canonical proposal state transition map.

---

## 5. Archive and return

### archive_entry

- **Purpose**: Paused or archived work that can be resurfaced in "return" mode.
- **Key fields**: `archive_entry_id`, `project_id`, `artifact_id`, `idea_id`, `idea_thread_id`, `reason_paused`, `creative_pull`, `recurrence_score`, `last_session_id`, `created_at`, `updated_at`.
- **Runtime-written**: Inserted when critique outcome is `archive_candidate` (in `persistDerivedState`). Also created by POST /api/artifacts/[id]/approve when approval_state is `archived` (implementation-defined).

---

## 6. Deliberation and trace

### deliberation_trace

- **Purpose**: Structured reasoning record per session (observations, evidence, hypotheses, outcome). Supports future operator reasoning; not a governance bypass.
- **Key fields**: `deliberation_trace_id`, `session_id`, `observations_json`, `state_summary`, `tensions_json`, `hypotheses_json`, `evidence_checked_json`, `rejected_alternatives_json`, `chosen_action`, `confidence`, `execution_mode`, `human_gate_reason`, `outcome_summary`, `created_at`, `updated_at`.
- **Written by**: `writeDeliberationTrace()` in the session runner stage `writeTraceAndDeliberation`, from `SessionExecutionState` only. Built only from state; no extra DB reads for trace content.
- **Index**: `deliberation_trace_session_idx` on `(session_id, created_at DESC)`.

**JSON field semantics (as written by the runner):**

- **observations_json**: Context and mode observed for this run. Example keys: `session_mode`, `selected_drive`, `selection_source`, `metabolism_mode`. Describes *what* the runtime observed (scheduler mode, session mode, drive, where focus came from).
- **evidence_checked_json**: Concrete IDs and flags that were checked when making decisions. Example keys: `selected_project_id`, `selected_thread_id`, `selected_idea_id`, `selection_source`, `archive_candidate_available`, `public_curation_backlog`, `selected_drive`, `session_mode`. Supports future “what evidence did we have?” reasoning.
- **hypotheses_json**: Short interpretive reasons for choices. Example keys: `selection_reason` (e.g. archive_return_due_to_mode, project_thread_default, explicit_preference), `next_action_reason` (e.g. derived_from_decision_summary). Narrative layer on top of evidence.
- **tensions_json**: Implementation-defined in current runner (e.g. archive_candidates, public_curation_backlog). **rejected_alternatives_json**: From `state.decisionSummary.rejected_alternatives`. **chosen_action**, **confidence**: From `state.decisionSummary.next_action` and `.confidence`. **execution_mode**, **human_gate_reason**: From state; support operator-style classification.

---

## 7. Change audit

### change_record

- **Purpose**: Audit trail for governed changes (identity, habitat, avatar, system).
- **Key fields**: `change_type`, `initiated_by`, `target_type`, `target_id`, `title`, `description`, `reason`, `approved`, `approved_by`, `effective_at`, `created_at`, `updated_at`.
- **Written by**: API routes (proposal approve, identity PATCH, habitat-content clear) when a governed or manual-override action is applied. Not written by the session runner for normal creative output.

---

## 8. Other tables

- **generation_run**: One row per artifact generation (session_id, artifact_id, medium, model, timestamps). Inserted in `persistCoreOutputs`.
- **idea_to_thread**: Join table idea ↔ idea_thread.
- **artifact_to_idea**, **artifact_to_thread**: Optional linkage; implementation-defined usage in current runner.
- **public_habitat_content**: Per-slug public content (title, body, payload_json). Written only by proposal approval or manual clear; see 04_surfaces.

---

## 9. Shared types (packages/core)

The canonical TypeScript shapes for the above entities live in `packages/core/src/types.ts` and `packages/core/src/enums.ts`. They include:

- **Artifact**: `artifact_role`, `target_surface` are optional; align with runtime usage.
- **ProposalRecord**: `artifact_id`, `target_surface`, `proposal_role`, `habitat_payload_json` are optional; align with runtime and API.
- **CreativeStateSnapshot**, **CritiqueRecord**, **EvaluationSignal**, **Identity**, **Project**, **Idea**, **IdeaThread**, **CreativeSession**, **ArchiveEntry**, **MemoryRecord**, **ApprovalRecord**, **PublicationRecord**, **GenerationRun** are defined there. Enums (e.g. `approval_state`, `session_mode`, `creative_drive`) are in `enums.js`.

Where the schema adds columns in later migrations, the shared types may have been updated to match; the codebase is the source of truth.
