# Single-Session Runtime Build Map

**Goal:** Complete the system where **one session = one complete cognitive thought cycle** before parallel sessions or swarm behavior.

**Principle:** One session = one thought. A session loads state → chooses mode/focus → generates or reflects → produces artifact / proposal / reflection → evaluates → persists state → writes trajectory signals → ends with a clear next-state.

---

## 1. Current Runtime Flow

Actual execution order in code (entrypoint: `runSessionInternal`, `apps/studio/lib/session-runner.ts`):

| Phase | Function | File | Notes |
|-------|----------|------|--------|
| **State load** | `initializeExecutionState` → `loadCreativeStateAndBacklog` | session-runner.ts | `getLatestCreativeState(supabase)` → `previousState`; `computePublicCurationBacklog(supabase)` → `liveBacklog`. No trajectory/synthesis pressure loaded here. |
| **Decision (mode + drive)** | `selectModeAndDrive` | session-runner.ts | Builds `sessionState = { ...previousState, public_curation_backlog: liveBacklog }`. Calls `computeSessionMode(sessionState)`, `computeDriveWeights(sessionState)`, `selectDrive(driveWeights)` from `@twin/evaluation`. |
| **Focus selection** | `selectFocus` | session-runner.ts | If `sessionMode === "return"`: reads `archive_entry` (50), artifacts, critiques; `scoreReturnCandidates` + taste bias (`getTasteBiasMap`) → project/thread/idea. Else: `selectProjectAndThread(supabase)` from `project-thread-selection.ts` (uses `recurrence_score`, `creative_pull` on idea_thread and idea). |
| **Context build** | `buildContexts` | session-runner.ts | `getBrainContext`, `getProjectThreadIdeaContext`, style profile, then `getRuntimeStatePayload(supabase)` which includes `getSynthesisPressure(supabase)` and `deriveRuntimeTrajectory(...)`. Trajectory text is injected into prompt only here — not into mode/drive. |
| **Medium selection** | `derivePreferredMedium` (inside `runGeneration` path) | session-runner.ts | Prefer medium from options or inferred; registry resolution in `@twin/agent`. |
| **Generation** | `runGeneration` | session-runner.ts | Delegates to `runSessionPipeline` from `@twin/agent`. Produces `primaryArtifact` and `pipelineResult` or neither. |
| **Branch: no artifact** | — | session-runner.ts | If `!primaryArtifact || !pipelineResult`: optional `persistSessionAndReflectionArtifact` (cron only); `persistTrajectoryReview`; **no** `persistCoreOutputs`, **no** `persistDerivedState`, **no** `manageProposals`. Returns `finalizeResult(state)`. |
| **Evaluation** | `runCritiqueAndEvaluation` → `applyCapabilityFit` → `applyConfidenceFromCritique` | session-runner.ts | Only on artifact path. Fills `critique`, `evaluation`, `decisionSummary.confidence`, `confidence_truth`. |
| **Persistence (artifact path)** | `persistCoreOutputs` → `persistDerivedState` → `manageProposals` → `writeTraceAndDeliberation` → `persistTrajectoryReview` | session-runner.ts | `persistDerivedState`: requires `artifact` + `critique` + `evaluation`; writes archive_entry, **creative_state_snapshot** (via `stateToSnapshotRow`), memory_record, idea/idea_thread recurrence. |
| **Proposal handling** | `manageProposals` | session-runner.ts | Concept → habitat_layout (isProposalEligible: alignment, fertility, pull, critique_outcome); image → avatar_candidate; extension → extension proposal. Caps and FSM. **Does not** use `confidence` or `confidence_truth` for gating. |
| **Trajectory review** | `persistTrajectoryReview` | session-runner.ts | `deriveTrajectoryReview(...)` → insert into `trajectory_review`. Runs on both artifact and no-artifact paths when `pipelineResult` exists. |
| **End** | `finalizeResult` | session-runner.ts | Builds `SessionRunSuccessPayload`; sets `guardrail_stop` (e.g. `low_confidence`) for cron. |

**Key files:**

- **apps/studio/lib/session-runner.ts** — Full pipeline; `loadCreativeStateAndBacklog`, `selectModeAndDrive`, `selectFocus`, `buildContexts`, `runGeneration`, `runCritiqueAndEvaluation`, `persistCoreOutputs`, `persistDerivedState`, `manageProposals`, `persistTrajectoryReview`, `finalizeResult`.
- **apps/studio/lib/creative-state-load.ts** — `getLatestCreativeState` (reads latest `creative_state_snapshot`).
- **apps/studio/lib/project-thread-selection.ts** — `selectProjectAndThread` (reads `idea_thread.recurrence_score`, `idea.recurrence_score`, `creative_pull`).
- **apps/studio/lib/runtime-state-api.ts** — `getRuntimeStatePayload` (calls `getSynthesisPressure`, `deriveRuntimeTrajectory`); used in `buildContexts`, not in state load or mode/drive.
- **packages/evaluation** — `computeSessionMode`, `computeDriveWeights`, `selectDrive`, `updateCreativeState`, `stateToSnapshotRow`.

---

## 2. Loop Closure Gaps

From the architecture audit, confirmed in code:

### 2.1 No-artifact creative_state_snapshot not persisted

- **Where:** `persistDerivedState` (session-runner.ts) has guard `if (!supabase || !result || !artifact || !critique || !evaluation) return state;` (line ~1251). The insert into `creative_state_snapshot` is inside this block (lines 1303–1310). The no-artifact branch (lines 950–959) never calls `persistDerivedState`; it only optionally calls `persistSessionAndReflectionArtifact` and `persistTrajectoryReview`, then returns.
- **Effect:** Next session’s `getLatestCreativeState` can return a snapshot from an older artifact run. Mode/drive for the next session are therefore not updated by no-artifact or reflection-only sessions.

### 2.2 Trajectory review signals not influencing next session mode/drive

- **Where:** `loadCreativeStateAndBacklog` (session-runner.ts) only calls `getLatestCreativeState` and `computePublicCurationBacklog`. It does **not** call `getSynthesisPressure` or any trajectory reader. `selectModeAndDrive` only receives `previousState` and `liveBacklog`; `computeSessionMode` and `computeDriveWeights` (`@twin/evaluation`) take `CreativeStateFields` (snapshot-derived fields + backlog) and have no trajectory or synthesis-pressure parameter. Trajectory/synthesis is used only in `buildContexts` via `getRuntimeStatePayload` → `getSynthesisPressure` and `deriveRuntimeTrajectory`, i.e. prompt text only.
- **Effect:** trajectory_review (and synthesis pressure) do not affect the next session’s mode or drive choice; they only affect prompt context for generation.

### 2.3 Recurrence verification in focus selection

- **Where:** Recurrence **is** used in focus selection. `selectProjectAndThread` (project-thread-selection.ts) reads `idea_thread.recurrence_score` and `creative_pull` (lines 54–68) and `idea.recurrence_score` (lines 102–109) and weights threads/ideas by `r * 0.6 + p * 0.4`. Recurrence writeback happens in `persistDerivedState` (session-runner.ts): `idea` and `idea_thread` are updated with `evaluation.recurrence_score` when `selectedIdeaId` / `selectedThreadId` are set (lines 1339–1364).
- **Gap:** No code bug; the loop exists. The audit asks to **verify** that recurrence writeback actually influences focus (e.g. that selected project/thread/idea are the ones that get recurrence updated, and that the same tables are read in the next session). Verification step: confirm that when `sessionMode !== "return"`, the next session’s `selectProjectAndThread` reads the same `idea_thread` / `idea` rows that were written in the previous session’s `persistDerivedState`.

---

## 3. Systems Required to Complete "One Session = One Thought"

| System | Purpose | Where it should live | Reads | Writes | Influence on next session |
|--------|---------|----------------------|-------|--------|---------------------------|
| **A. No-artifact state persistence** | Ensure every session (including no-artifact/reflection) advances creative state so the next session sees up-to-date mode/drive inputs. | session-runner.ts, no-artifact branch (after `persistTrajectoryReview`, before `finalizeResult`) | `state.previousState`, `state.pipelineResult`, session_id | One row in `creative_state_snapshot` (e.g. previousState + minimal session signals; or `stateToSnapshotRow` with a no-evaluation convention) | Next session’s `getLatestCreativeState` returns this snapshot; `computeSessionMode` / `computeDriveWeights` see updated state. |
| **B. Trajectory feedback signal injection** | Let trajectory_review (e.g. return_success_trend, stall, momentum) influence mode/drive so the next session can favor reflect/return when trajectory indicates stall or low success. | Option 1: session-runner.ts — in `loadCreativeStateAndBacklog` call `getSynthesisPressure(supabase)`, attach to state; in `selectModeAndDrive` merge a scalar (e.g. reflection_need += f(return_success_trend)) into the state passed to `computeSessionMode` / `computeDriveWeights`. Option 2: extend `@twin/evaluation` to accept an optional trajectory context. | `trajectory_review` (via `getSynthesisPressure`: return_success_trend, repetition_without_movement_penalty, momentum, etc.) | None (read-only for this system) | Next session’s mode/drive are biased (e.g. higher reflection_need when trend is low). |
| **C. Recurrence-aware focus selection** | Already implemented: focus selection uses recurrence_score and creative_pull; persistDerivedState writes them back. | No new code. Verification only. | project-thread-selection.ts: `idea_thread.recurrence_score`, `idea.recurrence_score`, `creative_pull`. persistDerivedState: writes to `idea`, `idea_thread`. | idea.recurrence_score, idea_thread.recurrence_score | Next session’s `selectProjectAndThread` (or return path with archive) weights threads/ideas by recurrence and pull. |
| **D. Decision pressure signals (lightweight)** | Optional: expose named pressure scalars (e.g. stall_pressure, backlog_pressure) so mode/drive logic is interpretable and tunable. | packages/evaluation (creative-state.ts): optional second argument or extended state type; or session-runner: compute pressures before `selectModeAndDrive` and merge into state. | Same as B (synthesis pressure) + backlog counts | None | Same as B; makes the influence of trajectory on mode/drive explicit and testable. |
| **E. Proposal gating logic** | Avoid creating proposals when confidence is defaulted or very low, so weak sessions don’t flood the proposal backlog. | session-runner.ts, `manageProposals`: before creating/updating any proposal, check `state.confidence_truth === "defaulted"` or `state.decisionSummary.confidence < threshold`; skip or soft-gate (e.g. set decisionSummary.next_action, do not create proposal). | `state.confidence_truth`, `state.decisionSummary.confidence` | decisionSummary.next_action (when gated); no new proposal row | Next session sees fewer low-confidence proposals in backlog; cron can already stop on low_confidence guardrail. |

---

## 4. Minimal Implementation Plan

| Step | Change | Files |
|------|--------|--------|
| **1** | Persist creative_state_snapshot when session ends with no artifact. After `persistTrajectoryReview` in the no-artifact branch, build a snapshot row from `state.previousState` and `result.session.session_id`; use `stateToSnapshotRow(previousState, session_id, null)` (signature already takes `CreativeStateFields`, sessionId, notes — no evaluation required). Insert the row into `creative_state_snapshot`. | **apps/studio/lib/session-runner.ts** (no-artifact branch). |
| **2** | Add trajectory-derived signals into mode/drive. In `loadCreativeStateAndBacklog`, call `getSynthesisPressure(state.supabase)` when supabase is non-null; attach result to state (e.g. `state.synthesisPressure`). In `selectModeAndDrive`, merge one scalar into the state passed to `computeSessionMode` / `computeDriveWeights` (e.g. bump `reflection_need` when `synthesisPressure.return_success_trend < 0.4` or use `repetition_without_movement_penalty`). Keep changes minimal: no change to `@twin/evaluation` function signatures if possible (merge into a copy of previousState). | **apps/studio/lib/session-runner.ts** (loadCreativeStateAndBacklog, selectModeAndDrive). **apps/studio/lib/synthesis-pressure.ts** already exports `getSynthesisPressure`. |
| **3** | Verify recurrence writeback is read by focus selection. Add a short comment or assertion: the recurrence_score written in `persistDerivedState` to `idea` and `idea_thread` is read by `selectProjectAndThread` via the same IDs (project → idea_thread → idea). Optionally add an integration test: run a session with selected idea/thread, then run another and confirm the same thread/idea can be selected with updated weights. | **apps/studio/lib/session-runner.ts** (comment near recurrence writeback). **apps/studio/lib/project-thread-selection.ts** (comment on select). Optional: **apps/studio/lib/__tests__/** recurrence/focus test. |
| **4** | Add proposal confidence gating. In `manageProposals`, before creating or updating a proposal, if `state.confidence_truth === "defaulted"` or `state.decisionSummary.confidence < PROPOSAL_CONFIDENCE_MIN` (e.g. 0.4), set `decisionSummary.next_action` to a message like “Proposal skipped: confidence defaulted or below threshold” and return state without creating/updating proposals. | **apps/studio/lib/session-runner.ts** (manageProposals entry). |

---

## 5. Resulting Session Lifecycle (Target)

After the minimal implementation:

1. **Load state** — `getLatestCreativeState` (any session type) + `computePublicCurationBacklog` + **getSynthesisPressure** (for trajectory feedback).
2. **Evaluate pressures** — Merge synthesis/trajectory scalar into state for mode/drive (e.g. reflection_need adjustment).
3. **Choose mode** — `computeSessionMode(sessionState)` (state now includes trajectory-derived bias).
4. **Choose drive** — `computeDriveWeights(sessionState)`, `selectDrive(weights)`.
5. **Select focus** — Return path (archive + taste) or project/thread/idea (recurrence + creative_pull); recurrence writeback from previous session is used.
6. **Generate or reflect** — `runGeneration` → artifact or no artifact.
7. **Evaluate artifact** — If artifact: critique + evaluation + confidence; else skip.
8. **Handle proposal** — If artifact + eligible + **confidence above gate**: create/update proposal; else skip with reason.
9. **Persist snapshot** — **Always**: artifact path via `persistDerivedState`; **no-artifact path** via new insert in no-artifact branch.
10. **Record trajectory review** — `persistTrajectoryReview` (both paths when pipelineResult exists).
11. **End session** — `finalizeResult`; next session’s “latest state” is always the last session’s snapshot (artifact or no-artifact).

---

## 6. Verification Plan

| Check | How to verify |
|-------|----------------|
| No-artifact session updates creative state | Run a session that intentionally produces no artifact (e.g. cron with no eligible work, or mock that returns no artifact). Assert that a new row exists in `creative_state_snapshot` with `created_at` after the session and that the next session’s `getLatestCreativeState` returns that row. |
| Trajectory review affects next session mode | After implementing Step 2: seed `trajectory_review` with rows indicating low return_success_trend (e.g. 0.2). Run a session and assert that `sessionMode` is more likely “reflect” or that the state passed to `computeSessionMode` has higher reflection_need than without the trajectory merge. (Unit test with mocked getSynthesisPressure and state merge.) |
| Recurrence bias changes focus selection | Run a session with a selected idea_id/idea_thread_id and evaluation.recurrence_score = 0.9; confirm persistDerivedState writes to idea/idea_thread. Run the next session (mode !== "return") and confirm selectProjectAndThread reads those rows and that the weighted choice can select the same thread/idea (or add a test that recurrence_score in DB affects weights). |
| Proposal gating suppresses weak proposals | Run a session with artifact where confidence_truth === "defaulted" or confidence < threshold. Assert no new proposal_record is created and decisionSummary.next_action mentions confidence. Compare to a session with confidence above threshold and eligible scores where a proposal is created. |

---

**Scope:** Single-session cognitive loop only. No swarm, multi-agent, or parallel-session design in this map.
