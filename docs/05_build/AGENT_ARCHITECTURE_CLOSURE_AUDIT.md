# Agent Architecture Closure Audit (revised)

**Revision:** Post–architecture audit and canon updates (2026-03-12).  
**Supersedes:** Previous 05_build closure audit; reconciles with `docs/architecture/architecture_closure_audit.md`, `docs/architecture/proposal_resolution_lanes_canon.md`, `docs/canon_v2/02_runtime/creative_metabolism.md`, and `docs/architecture/current_vs_potential_systems.md`.

**Scope:** Wiring, control flow, loop closure, and governance boundaries. No heuristic or intelligence changes.

**Definition of "closed":** Runtime can read state/evidence → form decisions → route to actions → persist results → have those results influence future sessions; governance boundaries (generation / staging / proposals / system) are explicit in code and canon.

---

## A. Perception (State + Evidence Inputs)

| Input | Where read | Schema/table | Reliably available? | Guards / early exits |
|-------|------------|--------------|---------------------|----------------------|
| **Runtime state** | `getRuntimeStatePayload` (runtime-state-api.ts); used in `buildContexts` and GET /api/runtime/state. Aggregates: snapshot, artifact/proposal backlogs, style, synthesis pressure, trajectory. | `creative_state_snapshot`, `artifact`, `proposal_record`, `archive_entry`, `runtime_config`, `creative_session` (trace), `trajectory_review` (via getSynthesisPressure) | Yes when `supabase` non-null. | `if (!supabase)` returns stub payload. |
| **Archive state** | `selectFocus` when `sessionMode === "return"`: `archive_entry` (50), then `artifact` (medium), `critique_record` for return scoring. | `archive_entry`, `artifact`, `critique_record` | Yes when supabase and mode "return". | Empty list → fallback to project/thread. |
| **Session history** | Latest session trace in runtime-state-api for active_project/active_thread. Not used for mode/drive. | `creative_session` (trace) | Yes. | Display/context only. |
| **Trajectory review** | (1) getSynthesisPressure: last 10 `trajectory_review` (return_success_trend, repetition penalty). (2) getTasteBiasMap: last 15 rows (taste by action_kind). (3) getRuntimeStatePayload → trajectory text in buildContexts. | `trajectory_review` | Yes. Empty → neutral defaults. | Sparse history handled. |
| **Critiques** | selectFocus return path: hasCritiqueByArtifactId for archive scoring. | `critique_record` | Yes when archive path runs. | Optional. |
| **Artifact state** | getRuntimeStatePayload, buildContexts (style window); selectFocus (medium by id). | `artifact` | Yes. | Tolerates empty. |
| **Proposal state** | computePublicCurationBacklog; getRuntimeStatePayload (relationship/families); manageProposals (caps, dedupe). | `proposal_record` | Yes. | Backlog null → 0. |

**Alignment with architecture audit:** Section A of `docs/architecture/architecture_closure_audit.md` maps the same runtime → decision → generation → persistence flow. No discrepancy.

---

## B. Decision Formation

| Decision | File/function | Deterministic or inferred? | Persisted? |
|----------|----------------|----------------------------|------------|
| **Session mode** | selectModeAndDrive → computeSessionMode (@twin/evaluation). Input: previousState + liveBacklog. | Inferred. | Session row `mode`; trace `session_mode`. |
| **Drive** | selectModeAndDrive → computeDriveWeights, selectDrive. | Inferred (weighted random). | Session `selected_drive`; trace `drive`. **Canon (creative_metabolism.md):** Drive is a **descriptive/observability label**; not injected into generation prompt. |
| **Focus** | selectFocus: return (archive + return intelligence + taste) or selectProjectAndThread. | Inferred. | Trace project/thread/idea; decision_summary reasons. |
| **Medium** | derivePreferredMedium; runGeneration + registry resolution. | Inferred when not explicit. | Trace requested_medium, executed_medium, fallback_reason, resolution_source. |
| **Artifact role** | inferArtifactRole(medium, isCron) in persistCoreOutputs. | Deterministic. | artifact.artifact_role. |
| **Proposal eligibility** | isProposalEligible / isExtensionProposalEligible. | Deterministic. | Trace proposal_outcome; decisionSummary next_action. |
| **Execution lane** | manageProposals: concept → surface/habitat_layout; image → avatar_candidate; extension → medium. | Deterministic. | proposal_record lane_type, proposal_role, target_surface. |

**Alignment:** Matches architecture audit “Decision pipeline” and current_vs_potential_systems §1.2. Drive explicitly documented as non-steering in canon.

---

## C. Action Routing

| Branch | Control flow | Status | Guards |
|--------|--------------|--------|--------|
| **Artifact generation** | runGeneration (runSessionPipeline) always runs. | Complete. | No-artifact outcome handled below. |
| **Staging** | Runner does **not** stage. Creates/updates proposal_record (pending_review). approved_for_staging / staged / staging_habitat_content via approve and staging APIs only. | Intentional boundary. | isLegalProposalStateTransition; lane guard (surface only for staging/public). |
| **Proposal creation** | manageProposals: habitat_layout, avatar_candidate, extension (caps, dedupe, FSM for archiving older habitat). | Complete. | getMaxPending*; isProposalEligible / isExtensionProposalEligible. |
| **Critique/review** | runCritiqueAndEvaluation when primaryArtifact + pipelineResult. | Complete for artifact path. | By design no critique on no-artifact path. |
| **No-op** | No artifact → no persistCoreOutputs/persistDerivedState/manageProposals; optional persistSessionAndReflectionArtifact (cron); persistTrajectoryReview when pipelineResult. | Complete. | Early return; trajectory_review still written. |

**Alignment:** Matches architecture audit staging (“Staging is never written to by the creative runner”) and proposal system (three lanes: surface habitat_layout/avatar, medium extension).

---

## D. Persistence and Feedback Loop

| Record | Written in | Read by later sessions? | Loop closed? |
|--------|------------|--------------------------|--------------|
| **Session** | persistCoreOutputs; persistSessionAndReflectionArtifact (no-artifact cron). | getRuntimeStatePayload (trace); continuity APIs. | Yes. |
| **Artifact** | persistCoreOutputs; persistSessionAndReflectionArtifact (reflection_note). | Style/backlog; archive path. | Yes. |
| **Critique** | persistCoreOutputs. | selectFocus return path (hasCritiqueByArtifactId). | Yes. |
| **Evaluation** | persistCoreOutputs; artifact score update. | Via updateCreativeState → snapshot. | Yes. |
| **Trajectory review** | persistTrajectoryReview (artifact and no-artifact when pipelineResult). | getSynthesisPressure; getTasteBiasMap. Synthesis → trajectory text in buildContexts; taste → return selection. trajectory_feedback_adapter → state.trajectoryAdvisory → reflection_need nudge in selectModeAndDrive (one bounded Stage-2 signal; `gently_reduce_repetition` only). | **Yes** (synthesis/taste + one bounded advisory signal). |
| **Proposal** | manageProposals. | computePublicCurationBacklog; getRuntimeStatePayload; manageProposals. | Yes. |
| **Creative state snapshot** | persistDerivedState (artifact path) + no-artifact branch after persistTrajectoryReview (neutral eval + session signals). | getLatestCreativeState → previousState → computeSessionMode, computeDriveWeights, selectDrive. | **Yes** (closed on both paths). |
| **Archive, recurrence, deliberation** | persistDerivedState; writeTraceAndDeliberation. | selectFocus; selectProjectAndThread (recurrence_score and creative_pull weighted; continuity_trace log surfaces actual values); persistTrajectoryReview (deliberation_trace_id). | Yes. |
| **Memory record** | persistDerivedState. | Not used for control flow. | Observability only. |

**Alignment:** Creative state snapshot now written on both artifact and no-artifact paths. One trajectory-derived advisory signal (`gently_reduce_repetition`) is wired into mode selection via a bounded +0.06 reflection_need nudge and recorded in the deliberation trace (`hypotheses_json.trajectory_advisory_applied`). Recurrence loop confirmed closed: selectProjectAndThread reads recurrence_score/creative_pull for thread/idea weighting; persistDerivedState writes them back after each artifact session; continuity_trace log in selectFocus surfaces actual values for inspection.

---

## E. Governance Boundaries

| Boundary | Where enforced | Canon |
|----------|----------------|-------|
| **Generation** | Runner: runSessionPipeline only; no direct staging/public write. | — |
| **Staging** | Runner: proposal_record pending_review only. approved_for_staging / staged / staging_habitat_content: approve route, mergeHabitatProposalIntoStaging, promote. Lane guard: surface only. | current_vs_potential_systems; architecture audit §Staging. |
| **Proposals** | governance-rules.ts (PROPOSAL_STATE_TRANSITIONS, isLegalProposalStateTransition). Runner: create/update only; approve/PATCH do state transitions. | — |
| **System lane** | **Runner does not create system proposals.** Approve route rejects staging/public for non-surface. | **proposal_resolution_lanes_canon.md:** “System proposals are always human-initiated”; runner creation authority table: surface Yes, medium Yes, system **No**. |

**Alignment:** D.3 (system proposal lane) is **resolved by canon**: system = human-initiated only; runner signals via medium extension proposals; no runner code path for lane_type = "system".

---

## F. Architecture Closure Judgment (revised)

**Verdict: CLOSED (pre-governance milestone)**

**All three closure loops are now wired:**

1. **Creative state snapshot on no-artifact path** — implemented. No-artifact and reflection-only sessions now write `creative_state_snapshot` (neutral eval + session-type signals, same canonical `stateToSnapshotRow` contract as artifact path). See §G.1.
2. **Trajectory-derived advisory wired into mode/drive** — implemented. One bounded signal (`gently_reduce_repetition`) feeds a +0.06 reflection_need nudge in `selectModeAndDrive` via the pre-computed `state.trajectoryAdvisory` path (Stage-2 contract: small delta on existing selector, not branch replacement). Logged in console and recorded in deliberation trace. See §G.2.
3. **Recurrence/continuity signals confirmed to affect project-thread selection** — verified. `selectProjectAndThread` weights threads and ideas by `recurrence_score * 0.6 + creative_pull * 0.4`; `persistDerivedState` writes these back after each artifact session. `continuity_trace` log in `selectFocus` now surfaces the actual values for inspection. See §G.3.

**Drive is descriptive only** (canon). Per creative_metabolism.md, drive is computed and stored but not injected into generation. D.1 resolved by documentation.

**Why CLOSED:**

- System lane closed by canon (human-only; runner never creates system proposals).
- Staging, proposal FSM, archive, critique, and observability loops wired.
- No-artifact snapshot loop closed (Task 1).
- Trajectory advisory loop closed with one bounded Stage-2 signal (Task 2).
- Recurrence/continuity loop verified and instrumented (Task 3).
---

## G. Critical Architecture Gaps (revised)

### G.1 Creative state snapshot on no-artifact path — CLOSED

- **What:** No-artifact and reflection-only sessions now write `creative_state_snapshot` using the same canonical contract as artifact sessions: `updateCreativeState(previousState, neutralEval, { isReflection, repetitionDetected })` + `stateToSnapshotRow` + DB insert. Runs after `persistTrajectoryReview` in the no-artifact branch of `runSessionInternal`.
- **Files:** `apps/studio/lib/session-runner.ts` (no-artifact branch, "Step 1 loop closure" comment).
- **Observability:** `[session] no_artifact_state_snapshot_persisted` log with `session_id`, `session_mode`, `snapshot_id`, `is_reflection`.
- **Contract preserved:** Neutral evaluation (all scores 0.5, recurrence 0.2) minimizes state delta; `isReflection` signal still reduces `reflection_need` correctly; same `stateToSnapshotRow` helper.

### G.2 Trajectory advisory wired into mode/drive — CLOSED (one bounded Stage-2 signal)

- **What:** `gently_reduce_repetition` from `getTrajectoryFeedback` is pre-computed in `loadCreativeStateAndBacklog` (stored as `state.trajectoryAdvisory`) and applied in `selectModeAndDrive` as a +0.06 nudge to `reflection_need` when `interpretation_confidence !== "low"`. This is a small delta on an existing selector, never a branch replacement.
- **Files:** `apps/studio/lib/session-runner.ts` (`selectModeAndDrive`), `apps/studio/lib/trajectory-feedback-adapter.ts` (updated comment).
- **Observability:** `[session] trajectory_advisory applied` / `[session] trajectory_advisory skipped` console logs; `hypotheses_json.trajectory_advisory_applied` + `trajectory_advisory_reason` in deliberation trace.
- **Stage-1 contract preserved:** `getTrajectoryFeedback` is not called from selection functions. Pre-computation happens in `loadCreativeStateAndBacklog` (state load phase). Other advisory signals (`favor_consolidation`, `proposal_pressure_adjustment`) remain dry-run only.

### G.3 Recurrence/continuity signals affecting project-thread selection — VERIFIED + INSTRUMENTED

- **What:** `selectProjectAndThread` weights threads by `recurrence_score * 0.6 + creative_pull * 0.4` (plus intent boost); same formula for ideas. `persistDerivedState` writes `evaluation.recurrence_score` back to `idea` and `idea_thread` after each artifact session. Loop is closed.
- **Files:** `apps/studio/lib/project-thread-selection.ts` (read path + now returns recurrence trace values), `apps/studio/lib/session-runner.ts` (`persistDerivedState` writeback; `selectFocus` continuity_trace log).
- **Observability:** `[session] selection: project_thread_idea` log now includes `continuity_trace` with actual `thread_recurrence_score`, `thread_creative_pull`, `idea_recurrence_score`, `idea_creative_pull` values.
- **No change to selection logic:** Recurrence loop was already closed; these changes add inspectability only.

### G.4 Drive not a steering signal — CLOSED BY CANON

- **Status:** Resolved by creative_metabolism.md: drive is descriptive/observability only. No code change required.

### G.5 System proposal lane — CLOSED BY CANON

- **Status:** Resolved by proposal_resolution_lanes_canon.md: system proposals human-initiated only; runner never creates `lane_type = "system"`.

---

## H. Implementation Status (reconciled)

### Group 1 — Architecture closure (all done)

| # | Step | Status | Files |
|---|------|--------|-------|
| 1 | **Persist creative state snapshot on no-artifact path** | **Done** | session-runner.ts (no-artifact branch) |
| 2 | **Formalize system proposal intent** | **Done (canon)** | proposal_resolution_lanes_canon.md |
| 3 | **Trajectory feedback signal (one bounded Stage-2 advisory)** | **Done** | session-runner.ts (selectModeAndDrive), trajectory-feedback-adapter.ts |
| 4 | **Verify project-thread-selection reads recurrence + instrument** | **Done** | project-thread-selection.ts, session-runner.ts (selectFocus log) |

### Group 2 — Runtime activation / incremental (deferred)

| # | Step | Purpose | Files | Label |
|---|------|---------|--------|--------|
| 5 | **Drive injection (optional)** | Only if product later chooses drive as steering input; canon currently treats it as descriptive. | packages/agent | **Runtime activation** |
| 6 | **Confidence as proposal gate** | Soft gate or warning when confidence_truth === "defaulted". | session-runner.ts (manageProposals) | **Runtime activation** |

### Group 3 — Later tuning (deferred)

| # | Step | Purpose | Label |
|---|------|---------|--------|
| 7 | **Explicit concept intent layer** | Pre-generation intent and intent-specific prompts. | **Later tuning** |
| 8 | **Multi-page habitat target** | Runner selects non-home page when staging evidence supports it. | **Later tuning** |
| 9 | **Decision pressure signals** | Named pressure scalars in computeDriveWeights/computeSessionMode. | **Later tuning** |

---

## I. Summary of Doc and Code Alignment

| Source | Change | Effect on this audit |
|--------|--------|----------------------|
| **docs/architecture/architecture_closure_audit.md** | Full map, closed (B) and partially closed (C), blockers (D), implementation sequence (F). | Used as reference; gaps D.1 (drive) and D.3 (system) resolved by canon; D.2 (trajectory feedback) and no-artifact snapshot now resolved by code. |
| **docs/architecture/proposal_resolution_lanes_canon.md** | System proposals human-only; runner creation table. | D.3 resolved; system lane governance boundary closed. |
| **docs/canon_v2/02_runtime/creative_metabolism.md** | Drive = descriptive/observability; not injected into generation. | D.1 resolved by reclassification; no mandatory code change for closure. |
| **docs/architecture/current_vs_potential_systems.md** | Pipeline stages and "drive stored/traced only". | Aligns with session-runner and canon. |
| **Code (session-runner, project-thread-selection, trajectory-feedback-adapter)** | (1) no-artifact snapshot wired; (2) trajectory advisory wired (one bounded Stage-2 signal); (3) recurrence loop instrumented. | All three pre-governance closure tasks resolved. |

**Conclusion:** Architecture is **closed at pre-governance milestone**. The three final closure tasks are wired, logged, and reflected in the deliberation trace. Stage-1 contract preserved (no branch replacement; thought map not directly read by selectors; one bounded advisory via pre-computed state path only). Remaining items (drive injection, multi-page habitat, decision pressure) deferred to later tuning.