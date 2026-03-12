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
| **Trajectory review** | persistTrajectoryReview (artifact and no-artifact when pipelineResult). | getSynthesisPressure; getTasteBiasMap. Synthesis → trajectory text in buildContexts; taste → return selection. | **Yes for synthesis/taste.** **No for mode/drive:** trajectory_review is not read into loadCreativeStateAndBacklog or computeSessionMode/computeDriveWeights (per architecture audit D.2). |
| **Proposal** | manageProposals. | computePublicCurationBacklog; getRuntimeStatePayload; manageProposals. | Yes. |
| **Creative state snapshot** | persistDerivedState only (when artifact + critique + evaluation). | getLatestCreativeState → previousState → computeSessionMode, computeDriveWeights, selectDrive. | **Partial:** Not written on no-artifact or reflection-only path. Next session’s “latest state” can be stale for those runs. |
| **Archive, recurrence, deliberation** | persistDerivedState; writeTraceAndDeliberation. | selectFocus; selectProjectAndThread; persistTrajectoryReview (deliberation_trace_id). | Yes. |
| **Memory record** | persistDerivedState. | Not used for control flow. | Observability only. |

**Alignment:** Architecture audit B.2 states “creative_state_snapshot … Always when artifact exists” — consistent. It does not list the no-artifact snapshot gap as a blocker; this audit retains it as a closure gap. Architecture audit D.2 explicitly states trajectory review has no feedback path into next-session decisions.

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

**Verdict: CLOSE BUT MISSING LOOPS**

**Why not fully CLOSED:**

1. **Creative state snapshot not on no-artifact path** (unchanged in code). No-artifact and reflection-only sessions do not write creative_state_snapshot; next session’s mode/drive can be stale.
2. **Trajectory review not fed into mode/drive** (architecture audit D.2). trajectory_review is written and read for synthesis pressure (→ trajectory text in buildContexts) and taste (→ return selection). It is **not** read into loadCreativeStateAndBacklog or into computeSessionMode/computeDriveWeights. So “reviews influence future sessions” is true for synthesis/taste and for creative_state_snapshot when written; it is **not** true for trajectory-level trend signals (e.g. stall pattern, confidence trend) affecting mode/drive.
3. **Drive is descriptive only** (canon). Per creative_metabolism.md, drive is computed and stored but not injected into generation. Architecture audit D.1: either inject or reclassify — canon has **reclassified** drive as descriptive/observability, so D.1 is resolved by documentation; no code loop to “close” for drive steering unless product later chooses injection.

**Why not STILL OPEN:**

- System lane is **closed by canon** (human-only; runner never creates system proposals).
- Staging, proposal FSM, recurrence, archive, critique, and observability loops are wired and documented.
- Remaining gaps are (a) no-artifact snapshot, (b) trajectory → mode/drive feedback — both are well-defined, small fixes.

---

## G. Critical Architecture Gaps (revised)

1. **Creative state snapshot not persisted on no-artifact path**  
   - **What:** persistDerivedState (and thus creative_state_snapshot insert) runs only when primaryArtifact + critique + evaluation exist. No-artifact and reflection-only sessions do not write a snapshot.  
   - **Impact:** Next session’s getLatestCreativeState may be from an older artifact run.  
   - **Fix:** Write a snapshot on the no-artifact branch (e.g. previousState + minimal session signals, no evaluation), or document that state advances only on artifact runs.

2. **Trajectory review has no feedback into mode/drive**  
   - **What:** trajectory_review is persisted and read for synthesis pressure and taste bias; it is not read when computing session mode or drive weights.  
   - **Impact:** Trajectory-level trends (stall, confidence collapse, action-kind monoculture) do not influence next session’s mode or drive.  
   - **Fix:** Feed at least one trajectory-derived signal (e.g. stall_count from last N trajectory_review rows) into loadCreativeStateAndBacklog or into computeSessionMode/computeDriveWeights (per architecture audit Step 3).

3. **Drive not a steering signal**  
   - **Status:** Resolved **by canon** (creative_metabolism.md): drive is descriptive/observability only. No code change required for closure unless product later adds drive injection (architecture audit Step 2/4).

4. **System proposal lane**  
   - **Status:** Resolved **by canon** (proposal_resolution_lanes_canon.md): system proposals human-initiated only; runner never creates lane_type = "system".

---

## H. Recommended Implementation Order (reconciled)

Reconciles `docs/architecture/architecture_closure_audit.md` §F (Implementation Sequence) with the no-artifact snapshot gap.

### Group 1 — Architecture closure

| # | Step | Purpose | Files | Label |
|---|------|---------|--------|--------|
| 1 | **Persist creative state snapshot on no-artifact path** | Close state loop for no-artifact/reflection-only runs so next session’s mode/drive see up-to-date state. | session-runner.ts (no-artifact branch: after persistTrajectoryReview, insert snapshot from previousState + session signals or stateToSnapshotRow with no-evaluation convention) | **Architecture closure** |
| 2 | **Formalize system proposal intent** | Already done in proposal_resolution_lanes_canon.md. No code change. | — | **Done** |
| 3 | **Trajectory feedback signal** | Feed one trajectory-derived signal (e.g. stall_count from last N trajectory_review) into mode/drive or state load. | session-runner.ts (loadCreativeStateAndBacklog or new loadTrajectoryContext); optionally packages/evaluation (computeSessionMode or computeDriveWeights) | **Architecture closure** |
| 4 | **Verify project-thread-selection reads recurrence** | Confirm recurrence writeback influences focus. | project-thread-selection.ts | **Architecture closure** |

### Group 2 — Runtime activation / incremental

| # | Step | Purpose | Files | Label |
|---|------|---------|--------|--------|
| 5 | **Drive injection (optional)** | Only if product later chooses drive as steering input; canon currently treats it as descriptive. | packages/agent (generate-writing, generate-image, session-pipeline) | **Runtime activation** |
| 6 | **Confidence as proposal gate** | Soft gate or warning when confidence_truth === "defaulted" (architecture audit Step 5). | session-runner.ts (manageProposals) | **Runtime activation** |

### Group 3 — Later tuning

| # | Step | Purpose | Label |
|---|------|---------|--------|
| 7 | **Explicit concept intent layer** | Pre-generation intent (reflective vs habitat vs naming) and intent-specific prompts (architecture audit Step 7). | **Later tuning** |
| 8 | **Multi-page habitat target** | Runner selects non-home page when staging evidence supports it (architecture audit Step 6). | **Later tuning** |
| 9 | **Decision pressure signals** | Named pressure scalars in computeDriveWeights/computeSessionMode (architecture audit Step 9). | **Later tuning** |

---

## I. Summary of Doc and Code Alignment

| Source | Change | Effect on this audit |
|--------|--------|----------------------|
| **docs/architecture/architecture_closure_audit.md** | Full map, closed (B) and partially closed (C), blockers (D), implementation sequence (F). | Used as reference; gaps D.1 (drive) and D.3 (system) resolved by canon; D.2 (trajectory feedback) and no-artifact snapshot retained as closure items. |
| **docs/architecture/proposal_resolution_lanes_canon.md** | System proposals human-only; runner creation table. | D.3 resolved; system lane governance boundary closed. |
| **docs/canon_v2/02_runtime/creative_metabolism.md** | Drive = descriptive/observability; not injected into generation. | D.1 resolved by reclassification; no mandatory code change for closure. |
| **docs/architecture/current_vs_potential_systems.md** | Pipeline stages and “drive stored/traced only”. | Aligns with session-runner and canon. |
| **Code (session-runner)** | No change in no-artifact path or trajectory read in state load. | Creative state snapshot still not written on no-artifact path; trajectory still not fed into mode/drive. |

**Conclusion:** With the new canon and architecture audit in mind, the architecture remains **close but missing loops**. The smallest set of code changes to reach closure are: (1) persist creative_state_snapshot on the no-artifact path, and (2) add a trajectory-derived signal into next-session state or mode/drive. All other closure items are either done (system lane, drive reclassification) or deferred to later tuning.
