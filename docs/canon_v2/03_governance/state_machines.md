# Governance state machines (canon v2)

This document describes the **actual** enforced finite state machines for artifact approval and proposal state. Source of truth: `apps/studio/lib/governance-rules.ts`. API routes enforce these transitions; the session runner does not transition approval or proposal state.

---

## 1. Principles (from code)

- Approval is not publication.
- `approved_for_publication` is an approval state; publish is a separate action.
- Staging is not public release.
- Critique is not evaluation; evaluation is not approval.
- Archive/reject are not delete.

---

## 2. Artifact approval FSM

### Allowed actions

The artifact approval API accepts only these values for `approval_state`:

- `approved`
- `approved_with_annotation`
- `needs_revision`
- `rejected`
- `archived`
- `approved_for_publication`

Defined as `APPROVAL_ACTIONS` in governance-rules.

### Required state for publish

Only artifacts in approval state `approved_for_publication` may be published. Constant: `REQUIRED_APPROVAL_FOR_PUBLISH`.

### Canonical transition map

`ARTIFACT_APPROVAL_TRANSITIONS` defines legal **from → to** transitions:

| From | To (allowed) |
|------|----------------|
| `pending_review` | approved, approved_with_annotation, needs_revision, rejected, archived, approved_for_publication |
| `needs_revision` | approved, approved_with_annotation, rejected, archived, approved_for_publication |
| `approved` | approved_with_annotation, rejected, archived, approved_for_publication |
| `approved_with_annotation` | approved, rejected, archived, approved_for_publication |
| `approved_for_publication` | archived |
| `rejected` | *(none)* |
| `archived` | *(none)* |

- **Null/undefined current state**: First approval write is allowed to any value in `APPROVAL_ACTIONS` (backwards compatibility).
- **Idempotent**: If `fromState === toState`, the transition is allowed.

### Guard

- `isLegalArtifactApprovalTransition(fromState, toState): boolean`
- Unknown `fromState` (not in the map) → false.

### API that enforces it

- **POST /api/artifacts/[id]/approve**
  - Reads artifact `current_approval_state`.
  - If `!isLegalArtifactApprovalTransition(currentState, approval_state)` → 400, no DB writes.
  - Else: updates artifact `current_approval_state`, optionally creates archive_entry when approval_state is `archived`, then inserts approval_record.

---

## 3. Proposal state FSM

### Canonical transition map

`PROPOSAL_STATE_TRANSITIONS` (concept-to-proposal flow; B-3):

| From | To (allowed via PATCH / approve) |
|------|----------------------------------|
| `pending_review` | needs_revision, approved_for_staging, archived, rejected, ignored |
| `needs_revision` | approved_for_staging, archived, rejected |
| `approved` | approved_for_staging, approved_for_publication, archived, rejected |
| `approved_for_staging` | staged, approved_for_publication, archived, rejected |
| `staged` | approved_for_publication, archived, rejected |
| `approved_for_publication` | published, archived |
| `published` | *(none)* |
| `archived` | *(none)* |
| `rejected` | *(none)* |
| `ignored` | *(none)* |

- Rollback from **published** uses a dedicated /unpublish route (privileged), not this map.
- Forward transitions with domain side-effects (e.g. approve_for_staging, approve_for_publication) are typically done via POST /api/proposals/[id]/approve; PATCH is also allowed for direct overrides.

### Guard

- `isLegalProposalStateTransition(fromState, toState): boolean`
- Used by both PATCH and approve route.

### Wrapper

- `apps/studio/lib/proposal-transitions.ts` exposes `isValidProposalTransition(currentState, targetState)` which delegates to `isLegalProposalStateTransition`.

### APIs that enforce it

- **PATCH /api/proposals/[id]**
  - Body: `{ proposal_state }`.
  - Fetches current proposal; if `!isValidProposalTransition(existing.proposal_state, proposal_state)` → 400.
  - Else: updates proposal_record only (no identity/habitat/avatar side effects).

- **POST /api/proposals/[id]/approve**
  - Body: `{ action: 'apply_name' | 'approve_avatar' | 'approve' | 'approve_for_staging' | 'approve_for_publication' }`.
  - Maps action to `newState` (e.g. approve_for_staging → "approved_for_staging", approve_for_publication → "approved_for_publication", legacy approve → "approved").
  - **First**: if `!isLegalProposalStateTransition(proposal.proposal_state, newState)` → 400, **no side effects** (proposal row, identity, avatar, public_habitat_content, change_record unchanged).
  - **Then**: performs action-specific side effects (identity name, embodiment_direction, active_avatar_artifact_id, public_habitat_content upsert, change_record writes), then updates proposal_record.proposal_state to newState.

---

## 4. Summary

| FSM | Guard | Enforced in |
|-----|-------|-------------|
| Artifact approval | `isLegalArtifactApprovalTransition` | POST /api/artifacts/[id]/approve |
| Proposal state | `isLegalProposalStateTransition` | PATCH /api/proposals/[id], POST /api/proposals/[id]/approve |

The session runner creates proposal_record rows with initial state (e.g. pending_review); it does not call these APIs or transition artifact/proposal state.
