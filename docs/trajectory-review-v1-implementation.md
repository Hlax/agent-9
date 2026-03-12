# Trajectory Review V1 — Implementation Summary

## Overview

Trajectory Review V1 is a **post-session diagnostic layer** in the Twin runtime. It evaluates session trajectories after completion and persists a single diagnostic row. It does **not** change governance, proposal FSMs, approval routes, or any public mutation behavior.

## Insertion Point (Runner)

**File:** `apps/studio/lib/session-runner.ts`

The new step runs **immediately after** `writeTraceAndDeliberation` and **before** `finalizeResult`, and only when persistence is available (`state.supabase` is set):

```ts
if (state.supabase) {
  state = await persistCoreOutputs(state);
  state = await persistDerivedState(state);
  state = await manageProposals(state);
  state = await writeTraceAndDeliberation(state);
  state = await persistTrajectoryReview(state);  // ← NEW
}
return finalizeResult(state);
```

## Governance Behavior — Unchanged

- **Proposal FSMs:** Unchanged. No new transitions or states.
- **Approval routes:** Unchanged. No new approval logic.
- **Public mutation:** Unchanged. Trajectory review does not mutate artifacts, identity, habitat, or proposals.
- **Session outcome:** If the trajectory_review insert fails, the session **does not fail**; a warning is appended to `state.warnings` and the session completes normally.

## Files Changed / Added

| Path | Description |
|------|-------------|
| `supabase/migrations/20260312000001_trajectory_review.sql` | Creates `trajectory_review` table and indexes. |
| `apps/studio/lib/trajectory-review.ts` | **New.** Derives scores and labels; exports `deriveTrajectoryReview`, types, and canon vocabularies. |
| `apps/studio/lib/session-runner.ts` | Imports `deriveTrajectoryReview`; adds `persistTrajectoryReview` and calls it after `writeTraceAndDeliberation`. |
| `apps/studio/lib/__tests__/trajectory-review.test.ts` | **New.** Unit tests for formula, outcome/issue/strength vocabularies, and purity. |
| `docs/trajectory-review-v1-implementation.md` | This summary. |

## Data Model (`trajectory_review`)

- `trajectory_review_id` (UUID, PK)
- `session_id` (UUID, FK → creative_session)
- `deliberation_trace_id` (UUID, nullable, FK → deliberation_trace)
- `review_version` (TEXT, default `v1`)
- `narrative_state`, `action_kind`, `outcome_kind` (TEXT, nullable)
- `trajectory_quality`, `alignment_score`, `movement_score`, `novelty_score`, `governance_score`, `confidence_calibration_score` (REAL)
- `issues_json`, `strengths_json` (JSONB, nullable; shape `{ items: string[] }`)
- `learning_signal`, `recommended_next_action_kind` (TEXT, nullable)
- `created_at` (TIMESTAMPTZ)

## Trajectory Quality Formula

```
trajectory_quality =
  0.30 × alignment_score
+ 0.30 × movement_score
+ 0.20 × novelty_score
+ 0.10 × governance_score
+ 0.10 × confidence_calibration_score
```

All component scores are in [0, 1].

## Allowed Vocabularies (Compact Only)

- **outcome_kind:** `useful_progress`, `productive_return`, `proposal_generated`, `safe_hold`, `low_signal_continuation`, `repetition_without_movement`, `misaligned_action`
- **issue kinds** (in `issues_json.items`): `overconfident_weak_outcome`, `underconfident_good_outcome`, `repetition_risk`, `proposal_churn`, `reflection_without_resolution`, `curation_pressure_ignored`, `identity_pressure_unaddressed`
- **strength kinds** (in `strengths_json.items`): `good_return_timing`, `healthy_deferral`, `useful_surface_generation`, `aligned_avatar_exploration`, `strong_state_alignment`

## Runtime Helper (`trajectory-review.ts`)

- **Input:** `TrajectoryReviewInput` — narrative_state, action_kind, confidence, proposal_created, repetition_detected, has_artifact/critique/evaluation, memory/archive flags, live_backlog, selection_source, execution_mode, optional previous-state signals.
- **Output:** `TrajectoryReviewRow` — full row shape for insert (no I/O inside the helper).
- **Behavior:** Scores and labels are derived **heuristically** from the input only; no cross-session data. Uses the compact vocabularies above.

## Writer Integration

- **When:** Only when `state.supabase` is set and core outputs (session, artifact, critique) exist.
- **How:** Resolve latest `deliberation_trace_id` for the session; build `TrajectoryReviewInput` from `SessionExecutionState` and ontology helpers; call `deriveTrajectoryReview`; insert one row into `trajectory_review`.
- **On failure:** Log warning, append message to `state.warnings`, return state; **do not throw**. Session completes and `finalizeResult(state)` is returned as usual.

## Tests

- **Location:** `apps/studio/lib/__tests__/trajectory-review.test.ts`
- **Coverage:** Trajectory quality formula; outcome_kind in allowed set; issues/strengths in allowed sets; governance_score = 1.0; proposal_created → proposal_generated; purity (same input → same output); row shape for insert.

## Build and Tests

- Full monorepo build: `pnpm build` — **passes.**
- Studio tests: `pnpm test` (from `apps/studio`) — **233 tests pass**, including 9 trajectory-review tests.
