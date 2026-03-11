# Audit and change records (canon v2)

This document describes how **change_record** and related audit behavior are actually used in the codebase. It does not overwrite historical canon; it reflects current enforcement.

---

## 1. change_record

### Purpose

- Audit trail for **governed** changes: identity, habitat, embodiment, avatar, system/workflow.
- Written when a human-approved action **applies** a change (e.g. proposal approval that updates identity or public habitat), not when the Twin creates a proposal or persists creative output.

### Source of truth

- **Writer**: `apps/studio/lib/change-record.ts` — `writeChangeRecord(input)`.
- **Schema**: Table `change_record` with fields including `change_type`, `initiated_by`, `target_type`, `target_id`, `title`, `description`, `reason`, `approved`, `approved_by`, `effective_at`, `created_at`, `updated_at`. Exact columns are implementation-defined in migrations.

### Change types

From `change-record.ts`, `CHANGE_TYPES`:

- identity_update  
- workflow_update  
- system_update  
- habitat_update  
- embodiment_update  
- avatar_update  
- evaluation_update  
- governance_update  
- other  

### When rows are written

| Call-site | change_type | Typical reason / trigger |
|-----------|-------------|---------------------------|
| POST /api/proposals/[id]/approve, action `apply_name` | identity_update | Identity name set from proposal title |
| POST /api/proposals/[id]/approve, action `approve_avatar` | embodiment_update | embodiment_direction updated from proposal |
| POST /api/proposals/[id]/approve, action approve_for_publication (avatar_candidate) | avatar_update | active_avatar_artifact_id set from proposal |
| POST /api/proposals/[id]/approve, action approve_for_publication (habitat/concept) | habitat_update | public_habitat_content upserted from proposal |
| POST /api/proposals/[id]/approve, lane_type system | system_update | System proposal approved |
| POST /api/habitat-content/clear | habitat_update | reason: manual_habitat_clear; title/description describe slug clear |

All writes use `approved: true` and `approved_by` (e.g. user email or "harvey"). The session runner does **not** call `writeChangeRecord`.

---

## 2. approval_record (artifact lane)

- **Purpose**: Audit of artifact approval state changes (who set which approval_state, when, review_note, annotation_note).
- **Written by**: POST /api/artifacts/[id]/approve after a legal transition and artifact update.
- **Not written by**: Session runner (runner does not set artifact approval state).

---

## 3. publication_record

- **Purpose**: Audit of publication state changes.
- **Written by**: POST /api/artifacts/[id]/publish when the artifact is in `approved_for_publication` and passes the staging gate. Not documented in detail here; implementation-defined.

---

## 4. Deliberation trace (reasoning audit)

- **Purpose**: Structured reasoning per session (observations, evidence, hypotheses, outcome). Supports future operator reasoning; it is **not** a governance bypass and does not replace change_record.
- **Written by**: Session runner in `writeTraceAndDeliberation` via `writeDeliberationTrace` (see 02_runtime/session_orchestrator.md and data_model.md).
- **Content**: Built only from `SessionExecutionState`; includes execution_mode, human_gate_reason, outcome_summary. Does not record identity/habitat/avatar mutations; those are recorded in change_record when approval routes apply changes.

---

## 5. Summary

- **change_record**: Governed or manual-override actions that change identity, habitat, avatar, or system. Written only from API routes (proposal approve, habitat clear).
- **approval_record**: Artifact approval API only.
- **publication_record**: Publish API only.
- **deliberation_trace**: Session runner only; reasoning audit, not substitution for change_record.
