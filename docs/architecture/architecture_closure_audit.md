# Architecture Closure Audit

**Audit date:** 2026-03-12  
**Scope:** Full system — runtime, decision pipeline, artifact generation, staging, proposals, review/critique, trajectory, persistence, and observability.  
**Purpose:** Determine whether the architecture is closed (all loops are wired end-to-end), identify remaining gaps, and recommend the next implementation order.

---

## A. Current Architecture Map

### Runtime layer

The runtime entry point is `runSessionInternal` in `apps/studio/lib/session-runner.ts`. It is invoked by two routes: `POST /api/session/run` (manual) and `GET /api/cron/session` (scheduled). All state passes through a single mutable value object `SessionExecutionState`. The stages execute in a fixed order:

```
initializeExecutionState
  → loadCreativeStateAndBacklog
  → selectModeAndDrive
  → selectFocus
  → buildContexts
  → runGeneration
  [no artifact path: → persistTrajectoryReview → finalizeResult]
  → runCritiqueAndEvaluation
    → applyCapabilityFit
    → applyConfidenceFromCritique
    → detectRepetition
  → persistCoreOutputs
  → persistDerivedState
  → manageProposals
  → writeTraceAndDeliberation
  → persistTrajectoryReview
  → finalizeResult
```

The runtime is **synchronous and deterministic** at each stage. Side effects (Supabase, OpenAI, storage) are the only non-deterministic elements. When `supabase` is null, all persist stages no-op and `finalizeResult` returns `persisted: false`.

Guardrail stops are enforced in `finalizeResult`: `no_eligible_work`, `repetition`, `low_confidence`, `governance_gate`. These stop cron batches early but do not alter persisted data; they are recorded in the session payload.

### Decision pipeline

| Stage | Function | Behavioral? |
|-------|----------|-------------|
| State + backlog load | `loadCreativeStateAndBacklog` | Yes — feeds mode, drive, caps |
| Session mode | `computeSessionMode` (packages/evaluation) | Partially — only `return` branches the pipeline |
| Drive selection | `computeDriveWeights`, `selectDrive` | Descriptive — stored, not in generation prompt |
| Focus selection | `selectFocus` (archive vs project/thread) | Yes — determines context used for generation |
| Preferred medium | `derivePreferredMedium` in `runGeneration` | Yes — routes image vs writing; adds concept guidance |
| Generation | `runSessionPipeline` (@twin/agent) | Yes — produces artifact |
| Capability fit | `applyCapabilityFit` | Yes — derives medium_fit, extension_classification |
| Confidence | `applyConfidenceFromCritique` | Yes — sets decisionSummary.confidence from (alignment + pull) / 2 |
| Critique outcome | `detectRepetition` | Yes — may set guardrail_stop = repetition |
| Proposal routing | `manageProposals` | Yes — creates/updates proposal_record by lane and role |
| Trace + deliberation | `writeTraceAndDeliberation`, `persistTrajectoryReview` | Descriptive — observability only |

### Artifact generation

Artifacts are produced by `runSessionPipeline` in `packages/agent/src/session-pipeline.ts`. Writing artifacts (including concept) go through `generateWriting`; image artifacts go through `generateImage`. The concept path adds `CONCEPT_HABITAT_GUIDANCE` to the user prompt. Images are uploaded to Supabase Storage (`artifacts` bucket) and the artifact `content_uri`/`preview_uri` is replaced with the public URL. Artifact role (`layout_concept`, `image_concept`, null) is inferred post-generation from medium + `isCron` by `inferArtifactRole`.

### Staging

Staging is the branch-model workspace for habitat content. It is implemented as the `staging_habitat_content` table (one row per page slug). Content enters staging when Harvey approves a surface proposal for staging (`approve_for_staging`); the approval route calls `mergeHabitatProposalIntoStaging`, which validates and upserts the proposal's `habitat_payload_json` into `staging_habitat_content`. The `apps/habitat-staging` app renders from `GET /api/staging/composition`. Staging is never written to by the creative runner.

### Proposal system

All proposal creation is handled by `manageProposals`. Three active proposal lanes:

| Lane | Role | Created when |
|------|------|--------------|
| `surface` | `habitat_layout` | concept artifact + `isProposalEligible` + under cap |
| `surface` | `avatar_candidate` | image artifact + under cap + no duplicate for this artifact |
| `medium` | extension type (e.g. `medium_extension`) | `isExtensionProposalEligible` + under extension cap |

All proposals start in `pending_review`. No state transitions or applications are performed by the runner. Caps (`getMaxPendingHabitatLayoutProposals`, `getMaxPendingAvatarProposals`, `getMaxPendingExtensionProposals`) are enforced at creation time.

### Review/critique system

Every artifact receives a self-critique via `runCritique` (packages/evaluation). The critique produces a `CritiqueRecord` with `critique_outcome` (continue, branch, shift_medium, stop, archive_candidate) and `medium_fit_note`. `computeEvaluationSignals` then derives numeric scores (alignment, emergence, fertility, pull, recurrence). Both are persisted as `critique_record` and `evaluation_signal` rows in `persistCoreOutputs`. Critique outcome gates proposal eligibility (concept path); recurrence score is written back to idea and idea_thread; scores feed `updateCreativeState`.

### Trajectory system

`persistTrajectoryReview` inserts one row into `trajectory_review` per session. The row captures `narrative_state`, `action_kind`, confidence, scores, issues, and strengths. The trajectory is classified using `classifyNarrativeState`, `classifyActionKind`, `deriveTensionKinds`, and `deriveEvidenceKinds` from `ontology-helpers.ts`. Continuity history is built from trajectory rows by `buildContinuityRows` and `buildContinuityAggregate` (`runtime-continuity.ts`), exposed via `GET /api/runtime/continuity`.

### Persistence layer

| Table | Written by | When |
|-------|------------|------|
| `creative_session` | `persistCoreOutputs`, `writeTraceAndDeliberation` | After generation; trace written after proposals |
| `artifact` | `persistCoreOutputs` | After generation |
| `critique_record` | `persistCoreOutputs` | After critique |
| `evaluation_signal` | `persistCoreOutputs` | After evaluation |
| `generation_run` | `persistCoreOutputs` | After generation |
| `archive_entry` | `persistDerivedState` | Conditional on mode/cron |
| `creative_state_snapshot` | `persistDerivedState` | Always when artifact exists |
| `memory_record` | `persistDerivedState` | Conditional |
| `proposal_record` | `manageProposals` | When eligible; inserts or updates |
| `deliberation_trace` | `writeTraceAndDeliberation` | After proposals |
| `trajectory_review` | `persistTrajectoryReview` | After deliberation |
| `change_record` | Approval/apply routes (Studio API) | Human-triggered only |
| `staging_habitat_content` | `mergeHabitatProposalIntoStaging` (approve route) | Human-triggered only |
| `public_habitat_content` | Approve route or promote route | Human-triggered only |
| `habitat_promotion_record` | `promoteStagingToPublic` | Human-triggered only |

### Observability / runtime UI

`GET /api/runtime/state` → current metabolism mode, creative state, return candidates, synthesis pressure.  
`GET /api/runtime/trace` → last 10 session traces.  
`GET /api/runtime/deliberation` → latest deliberation trace (observations, hypotheses, evidence, tensions).  
`GET /api/runtime/continuity` → continuity history (narrative_counts, action_counts, tension_counts, average_confidence).  
Studio runtime debug page reads all four APIs. Session payload returns flags (archive_entry_created, recurrence_updated, proposal_created, memory_record_created, proposalOutcome, confidence_truth, guardrail_stop, warnings).

### How the layers interact

```
Persistence (creative_state_snapshot + backlog)
  ↓ loads into
Decision pipeline (mode, drive, focus, medium)
  ↓ steers
Artifact generation (@twin/agent)
  ↓ produces
Critique + evaluation (packages/evaluation)
  ↓ scores feed
Proposal routing (manageProposals; surface / medium lanes)
  ↓ creates
Proposal records (pending_review; human-gated from here)
  ↓ observability written by
Trace + deliberation + trajectory_review
  ↓ continuity exposed in
Runtime UI (Studio debug page, APIs)

Governance layer:
  governance-rules.ts (PROPOSAL_STATE_TRANSITIONS, ARTIFACT_APPROVAL_TRANSITIONS)
  → approve/PATCH routes enforce FSM for all human-initiated transitions
  → runner only creates proposals; never approves, stages, or publishes
```

---

## B. Architecturally Closed Subsystems

### B.1 Session orchestration loop

**Inputs:** HTTP request (manual or cron), latest `creative_state_snapshot`, live proposal backlog count.  
**Decisions:** Mode, drive, focus path, preferred medium, guardrail stops.  
**Outputs:** Session, artifact, critique, evaluation, proposals, trace, trajectory_review all persisted.  
**Persistence:** Fourteen tables (see Section A).  
**Future visibility:** Next session loads the new `creative_state_snapshot` as `previousState`; mode, drive, focus, and medium derivation are all computed from this snapshot. The loop is closed.

### B.2 Creative state update loop

**Inputs:** `previousState` (or default), evaluation signals from current session.  
**Decisions:** `updateCreativeState` computes next state from scores + signals (repetitionDetected, isReflection, exploredNewMedium, addedUnfinishedWork).  
**Outputs:** `creative_state_snapshot` row.  
**Persistence:** `creative_state_snapshot` table.  
**Future visibility:** `loadCreativeStateAndBacklog` always reads the latest snapshot; mode and drive weights change in response to accumulated state. Fully closed.

### B.3 Recurrence writeback loop

**Inputs:** `evaluation.recurrence_score`, `selectedIdeaId`, `selectedThreadId`.  
**Decisions:** If recurrence_score is non-null and idea/thread was selected, write back to `idea.recurrence_score` and `idea_thread.recurrence_score`.  
**Outputs:** Updated recurrence scores on idea and idea_thread rows.  
**Persistence:** `idea` and `idea_thread` tables.  
**Future visibility:** `selectProjectAndThread` weights thread selection by `recurrence_score` and `creative_pull`; return-mode archive scoring also uses recurrence. Closed.

### B.4 Proposal lifecycle (surface lane)

**Inputs:** Eligible concept artifact (scores + critique outcome); human approval actions.  
**Decisions (runner):** `isProposalEligible` → create/refresh proposal_record; rejected/archived guard prevents duplicate; cap enforced.  
**Decisions (governance):** `isLegalProposalStateTransition` enforces FSM at approve and PATCH routes.  
**Outputs:** proposal_record → staging_habitat_content (on approve_for_staging) → public_habitat_content (on promote or approve_for_publication).  
**Persistence:** `proposal_record`, `staging_habitat_content`, `public_habitat_content`, `habitat_promotion_record`, `change_record`.  
**Future visibility:** `computePublicCurationBacklog` counts active proposals; this backlog feeds `public_curation_backlog` in creative state and influences `computeDriveWeights` (curation drive) and `computeSessionMode` (backlog > threshold raises curation pressure). Closed.

### B.5 Confidence signal loop

**Inputs:** `evaluation.alignment_score`, `evaluation.pull_score`.  
**Decisions:** `applyConfidenceFromCritique` computes `(alignment + pull) / 2`; sets `decisionSummary.confidence` and `confidence_truth = "inferred"` (or `"defaulted"` when evaluation is missing).  
**Outputs:** `confidence` in `deliberation_trace.hypotheses_json.confidence_band`; `guardrail_stop = "low_confidence"` when below threshold.  
**Persistence:** `deliberation_trace`, session payload.  
**Future visibility:** `LOW_CONFIDENCE_THRESHOLD` guardrail stops cron batches, preventing compounding low-quality runs. Closed.

### B.6 Observability loop

**Inputs:** Full `SessionExecutionState` after all persist stages.  
**Decisions:** `classifyNarrativeState`, `classifyActionKind`, `deriveTensionKinds`, `classifyConfidenceBand`.  
**Outputs:** `creative_session.trace`, `creative_session.decision_summary`, `deliberation_trace`, `trajectory_review`.  
**Persistence:** All four persisted.  
**Future visibility:** `GET /api/runtime/continuity` aggregates narrative_counts, action_counts, tension_counts over the trajectory history; operators can see trend. Descriptive only; does not feed back into next session decisions. Closed (as observability); open (as steering input — by design).

### B.7 Governance boundary

**Inputs:** Human approval action (action string + proposal/artifact ID + auth).  
**Decisions:** `isLegalProposalStateTransition` and `isLegalArtifactApprovalTransition` in `governance-rules.ts`; approve route rejects `approve_for_staging` / `approve_for_publication` for non-surface proposals (lane guard).  
**Outputs:** Updated `proposal_record.proposal_state`; side effects (merge to staging, public upsert, identity update, change_record).  
**Persistence:** `proposal_record`, `change_record`, and surface tables.  
**Future visibility:** Proposal state is permanent; change_record is an append-only audit log. Closed.

### B.8 Extension proposal lane

**Inputs:** `medium_fit` (partial/unsupported), `extension_classification` (non-null), critique rationale support, cap.  
**Decisions:** `isExtensionProposalEligible` gates creation; deduplication by classification prevents repeat proposals for the same classification; cap (`getMaxPendingExtensionProposals`) limits backlog.  
**Outputs:** `proposal_record` with `lane_type = "medium"`, `proposal_role = extension_classification`.  
**Persistence:** `proposal_record`.  
**Future visibility:** Operator can review extension proposals in Studio. No apply path in runner (by design); resolution is human-governed. Lane guard in approve route prevents staging/publication. Closed (as a governed record; application is deferred to human operators).

---

## C. Partially Closed Systems

### C.1 Drive influence on generation

**What exists:** Drive is computed (`computeDriveWeights`, `selectDrive`) from creative state and stored on `creative_session.selected_drive`. It is recorded in the session trace and in `deliberation_trace.observations_json.selected_drive`.  
**Missing link:** Drive is not passed to `generateWriting` or `generateImage`. `SessionContext` has `selectedDrive` but neither the session pipeline nor the generation prompts use it. So drive shapes observability but does not steer output.  
**Impact:** The system can read "drive was curation today" but the generation model never receives that signal. Drive is a label, not a steering input.  
**What would close it:** Add `selectedDrive` (or a short label) to the generation user prompt in `packages/agent/src/generate-writing.ts` and the image path.

### C.2 Session mode (non-return branches)

**What exists:** Mode (`reflect`, `return`, `continue`, `explore`, `rest`) is computed and stored. `return` mode triggers the archive path in `selectFocus`. The mode string is injected into the generation prompt as `"Mode: ${mode}."`.  
**Missing link:** Only `return` produces a behavioral branch in focus selection. All other modes take the same `selectProjectAndThread` path; mode is a short literal in the prompt, not a structural branch. So reflect, continue, explore, and rest are semantically equivalent at the pipeline level.  
**Impact:** Mode computes to something meaningful but only one value (`return`) produces a real routing difference.  
**What would close it:** Explicit focus behavior or prompt differentiation per mode (e.g. reflect prioritizes recent critiques; continue prioritizes unfinished threads; rest reduces generation breadth).

### C.3 Trajectory influence on next session

**What exists:** `trajectory_review` rows are persisted; `GET /api/runtime/continuity` exposes aggregated counts. Operators can see narrative and action kind trends.  
**Missing link:** Trajectory review data is not read back into the session pipeline. `loadCreativeStateAndBacklog` does not query `trajectory_review` or `deliberation_trace` for trend data. The trajectory rows exist but do not feed the next session's mode, drive, or focus decisions.  
**Impact:** Continuity data is visible in the UI but does not influence autonomous behavior.  
**What would close it:** A scalar signal derived from trajectory history (e.g. stalled-count, reflection-ratio, confidence trend) fed into `computeSessionMode` or `computeDriveWeights`.

### C.4 Medium selection (explicit concept intent)

**What exists:** Medium is derived from `derivePreferredMedium` using state thresholds and explicit override. The concept path adds `CONCEPT_HABITAT_GUIDANCE` to the prompt.  
**Missing link:** There is no pre-generation concept intent layer. The system cannot distinguish reflective writing, habitat spec, naming exploration, or system proposal draft at the prompt level. Artifact role is inferred post-generation from medium + `isCron`, not from explicit intent.  
**Impact:** Medium-level routing exists; intent-level routing does not. All non-image text goes through `generateWriting` with only mode and optional concept guidance as semantic differentiators.  
**What would close it:** An explicit concept intent step between focus selection and generation that classifies the intent (e.g. reflective, habitat_spec, naming, continuation) and injects a differentiated prompt addition per intent type.

### C.5 System proposal lane (creation path)

**What exists:** `lane_type = "system"` is defined in the DB enum and the lane guard in the approve route rejects staging/publication for non-surface proposals. The governance infrastructure supports a system lane.  
**Missing link:** No code path in the runner creates a `proposal_record` with `lane_type = "system"`. There is no eligibility predicate, cap, creation logic, or trace field for system proposals. The system lane exists as reserved schema and governance rule, not as a live creation path.  
**Impact:** The architecture can receive system proposals but cannot generate them. An operator can manually insert a system proposal, but the runner has no awareness of capability gaps that should become system proposals.  
**What would close it:** Either (a) a runner path that creates system proposals when certain governance conditions are met (e.g. repeated low-confidence runs, repeated repetition, critical missing capability), or (b) explicit documentation that system proposals are always human-initiated and the runner's system-lane awareness is intentionally deferred.

### C.6 Staging governance for multi-page composition

**What exists:** `buildMinimalHabitatPayloadFromConcept` always returns `page: "home"`. The staging composition supports multiple slugs (one row per page). The promote route copies all rows. Staging and public both support multi-page.  
**Missing link:** The runner always targets the home page. No mechanism exists to route a concept artifact to a non-home page (e.g. works, about, installation). Page selection is hardcoded.  
**Impact:** Staging multi-page capability exists but is only reachable through the `create-proposal` API with an explicit `habitat_payload`, not through the autonomous creative pipeline.  
**What would close it:** A page selection step in `buildMinimalHabitatPayloadFromConcept` that reads current staging composition and selects an appropriate target page based on artifact content or proposal history.

---

## D. Architecture Blockers

These are the issues that prevent declaring full architectural closure. Each is a missing control loop, incomplete routing, missing persistence, or ambiguous governance boundary.

### D.1 Drive is not a steering signal

**Blocker class:** Incomplete routing.  
**Description:** Drive is computed, stored, and traced but is not passed to the generation model. The decision pipeline computes drive as a label that never reaches execution. Any architecture that calls drive a "steering vocabulary" (per canon) is overclaiming while this remains descriptive only.  
**Not a blocker for** persistence, governance, or session execution. It is a blocker for the claim that "the runtime can form a structured decision that routes into the correct execution lane" — because the drive decision goes nowhere.  
**Resolution:** Either (a) inject drive into the generation prompt (closes the loop) or (b) explicitly reclassify drive as a descriptive label in canon and accept that the steering vocabulary at generation is mode + preferred medium only.

### D.2 Trajectory review has no feedback path

**Blocker class:** Missing control loop.  
**Description:** Trajectory rows record narrative state, action kind, confidence, and tensions per session. Continuity aggregates trend data. Neither feeds back into next-session decisions. The "reviews influence future sessions" requirement (requirement 6) is met by `creative_state_snapshot` and recurrence writeback — but trajectory-level trend signals (e.g. stalling pattern, confidence collapse, action kind monoculture) have no upstream effect.  
**Resolution:** Read trajectory trend data (e.g. last N sessions' narrative_state, average confidence) into `loadCreativeStateAndBacklog` or a new `loadTrajectoryContext` step; derive a scalar or flag that influences mode or drive thresholds.

### D.3 System proposal lane has no creation path

**Blocker class:** Ambiguous governance boundary.  
**Description:** The lane model defines surface / medium / system. Surface and medium lanes have autonomous creation paths in the runner. System lane exists in schema and governance rules but has no runner creation path. This means the runner cannot signal that it has encountered a condition requiring a governance-level change.  
**Resolution:** Either (a) define a concrete eligibility predicate for system proposals (e.g. repeated low-confidence + high reflection_need + no eligible concept output) and add a creation branch in `manageProposals`, or (b) formally document system proposals as human-initiated only and remove ambiguity about whether the runner should ever create them.

### D.4 Proposal refresh / refresh cap path

**Blocker class:** Incomplete routing.  
**Description:** When the habitat layout cap is reached and existing active proposals exist, the runner refreshes the newest proposal with the current artifact's content (title, summary, habitat_payload_json) and now also updates `artifact_id` and `target_id` (fixed in lanes implementation). However, `proposalOutcome` is set to `"updated"` not `"created"` — the trace distinguishes these. The cap refresh path is correct but the cap itself may suppress meaningful new concepts when the backlog is full.  
**Status:** Functionally correct as of the lanes implementation. Trace correctly records `skipped_cap`, `updated`, `created`, `skipped_ineligible`, `skipped_rejected_archived`. Not a hard blocker — the loop is traceable. A behavioral concern (cap suppresses concepts during backlog growth) exists but is a governance policy question, not a wiring defect.

### D.5 Confidence band is inferred but not gated for surface proposals

**Blocker class:** Missing control loop.  
**Description:** `applyConfidenceFromCritique` derives a real confidence value and `guardrail_stop = "low_confidence"` stops cron batches below threshold. However, the same confidence signal does not gate proposal creation. A low-confidence session can still produce a proposal if critique outcome and scores independently meet thresholds. There is no "confidence_truth = defaulted → skip proposal" rule.  
**Status:** Minor. Critique-based eligibility (alignment, fertility, pull, critique_outcome) already correlates with confidence. Not a blocking issue for architectural closure but a gap between the confidence signal and proposal routing.

---

## E. Medium / Surface / System Proposal Timing

### Medium selection (explicit concept intent)

**Recommendation: keep loose until runtime evidence exists.**  
The current derivation (`derivePreferredMedium`) is state-driven and produces correct routing for writing, concept, and image. Adding an explicit concept intent layer before generation would allow finer steering (reflective vs habitat vs naming) but requires new prompt scaffolding, potential new artifact fields, and new eligibility rules. There is no runtime evidence yet that the model is producing wrong concept types because intent is absent. The risk of over-engineering the intent layer before observable failure is high. Stabilize the current three-medium routing first; add intent differentiation when session traces show medium/concept type confusion.

### Surface selection (multi-page habitat targeting)

**Recommendation: keep loose until runtime evidence exists.**  
All runner-created habitat proposals target `page: "home"`. Multi-page staging is fully supported in the schema and composition API. However, there is no evidence from real sessions that the home-page-only constraint is a limitation (it may be the correct default for V1). The infrastructure to support multi-page exists and operators can create non-home proposals via the `create-proposal` API. Autonomous multi-page selection is premature until the home page proposal workflow has been exercised enough to validate that the concept content is appropriate for the home surface and that other pages represent meaningful distinct contexts.

### System capability proposals (runner-originated)

**Recommendation: stabilize now (by formal deferral).**  
The question of whether the runner should originate system proposals is architecturally ambiguous. Canon defines system proposals as affecting platform, runtime, or governance behavior — which should require human initiation by design. The current implementation (system lane exists in schema + governance rules; no runner creation path) is the correct conservative position. Formalizing this as "system proposals are human-initiated only; the runner may signal readiness via extension proposals but never creates system proposals autonomously" removes the ambiguity and prevents future agents from misinterpreting the gap as an open implementation task.

---

## F. Implementation Sequence

### Group 1 — Architecture closure (do these before declaring closure)

**Step 1: Formalize system proposal intent (documentation)**  
- **Goal:** Resolve D.3 by explicitly documenting that system proposals are human-initiated only and that the runner's medium/extension proposals are the closest analog it may autonomously create.  
- **Subsystem affected:** `docs/architecture/proposal_resolution_lanes_canon.md`, canon governance docs.  
- **Why now:** Removes the ambiguity that prevents declaring the system/medium lane governance boundary as closed. Blocking for requirement 7 (governance boundaries between generation, staging, and system proposals) to be fully stated.  
- **What becomes testable:** The governance boundary for all three lanes can be asserted without qualification.

**Step 2: Drive decision — inject or formally reclassify**  
- **Goal:** Resolve D.1 by either (a) injecting `selectedDrive` into the `generateWriting` user prompt as a short directive label, or (b) amending canon to classify drive as a descriptive/observability label rather than a steering input.  
- **Subsystem affected:** `packages/agent/src/generate-writing.ts` (if injecting) or `docs/canon_v2/02_runtime/creative_metabolism.md` + `current_vs_potential_systems.md` (if reclassifying).  
- **Why now:** Drive is computed in every session and occupies a named slot in the decision pipeline. Leaving it as a stored-but-unused decision makes the pipeline semantically dishonest. Either path resolves the ambiguity.  
- **What becomes testable:** Drive injection: generation tests can assert prompt contains drive label. Reclassification: no code change; canon update closes the documentation gap.

**Step 3: Trajectory feedback signal**  
- **Goal:** Resolve D.2 by feeding at least one trajectory-derived signal into the next session's state load or mode/drive computation.  
- **Subsystem affected:** `apps/studio/lib/session-runner.ts` (`loadCreativeStateAndBacklog` or new `loadTrajectoryContext`), `packages/evaluation/src/creative-state.ts` (`computeSessionMode` or `computeDriveWeights`).  
- **Why now:** Requirement 6 (reviews influence future sessions) is met at the creative-state level via `updateCreativeState`; it is not met at the trajectory level. Adding one signal (e.g. a `stall_count` derived from the last N `trajectory_review` rows where `narrative_state = "stalled"`) closes the loop without redesigning the session pipeline.  
- **What becomes testable:** A session after N stalled sessions changes mode or drive weights measurably. The trajectory loop is demonstrably closed.

### Group 2 — Runtime activation (do after closure steps)

**Step 4: Drive injection (if selected in Step 2)**  
- **Goal:** Make drive a first-class generation signal.  
- **Subsystem affected:** `packages/agent/src/generate-writing.ts`, `packages/agent/src/generate-image.ts`, `packages/agent/src/session-pipeline.ts`.  
- **Why after Step 2:** Only implement if Step 2 chose injection over reclassification. No wasted work if reclassification was chosen.  
- **What becomes testable:** Sessions with different drives produce measurably different prompt structures; generation tests can assert on drive label in prompt.

**Step 5: Confidence as proposal gate**  
- **Goal:** Resolve D.5 by adding `confidence_truth` and `decisionSummary.confidence` as a soft gate or warning in `manageProposals` (e.g. skip proposal or add warning when `confidence_truth === "defaulted"`).  
- **Subsystem affected:** `apps/studio/lib/session-runner.ts` (`manageProposals`).  
- **Why after closure:** The current eligibility criteria already correlate well with quality; this step tightens the loop between the confidence signal and downstream routing. Not blocking; incremental improvement.  
- **What becomes testable:** A session with `confidence_truth = "defaulted"` produces `proposalOutcome = "skipped_low_confidence"` in the trace.

**Step 6: Multi-page habitat target selection**  
- **Goal:** Allow the runner to produce proposals targeting non-home pages when staging composition evidence suggests a non-home page is appropriate.  
- **Subsystem affected:** `apps/studio/lib/habitat-payload.ts` (`buildMinimalHabitatPayloadFromConcept`), `apps/studio/lib/session-runner.ts` (pass staging composition snapshot to `manageProposals`).  
- **Why after closure:** Requires runtime evidence from home-page proposals to understand what distinguishes a home concept from a works/about concept. Do not implement until the distinction is observable.  
- **What becomes testable:** A concept artifact with content that classifies as "works" page produces a proposal with `habitat_payload_json.page = "works"`.

### Group 3 — Later tuning (after runtime evidence exists)

**Step 7: Explicit concept intent layer**  
- **Goal:** Add a pre-generation concept intent classification step that differentiates reflective writing, habitat spec, naming exploration, continuation, and system-draft intents; inject intent-specific prompt additions.  
- **Subsystem affected:** `apps/studio/lib/session-runner.ts` (new `deriveConceptIntent` step between `selectFocus` and `runGeneration`), `packages/agent/src/generate-writing.ts` (intent-specific prompt additions).  
- **Why later:** No observable failure from the current mode + medium steering. Wait for session traces to reveal concept-type confusion before adding the intent layer.  
- **What becomes testable:** Session traces show `concept_intent` field; generation prompts differ per intent; trajectory review shows fewer misrouted concept types.

**Step 8: Medium extension system (automated)**  
- **Goal:** Allow new mediums to be registered without rewriting the pipeline; extend `derivePreferredMedium`, proposal eligibility, and generation routing from a medium registry.  
- **Subsystem affected:** `packages/agent` (registry), `apps/studio/lib/session-runner.ts`, `packages/evaluation`.  
- **Why later:** The current three-medium system (writing, concept, image) is sufficient for V1. Extension proposals already surface capability gaps to human review. Build the registry only when a second non-image non-writing medium is ready to implement.  
- **What becomes testable:** Adding a new medium entry to the registry produces correct routing, eligibility rules, and proposal roles without code changes to the runner.

**Step 9: Decision pressure signals as first-class inputs**  
- **Goal:** Derive named pressure scalars (archive_pressure, proposal_pressure, reflection_pressure, identity_pressure) from state, backlog, and trajectory, and expose them in `computeDriveWeights` and `computeSessionMode` as first-class inputs.  
- **Subsystem affected:** `packages/evaluation/src/creative-state.ts`, `apps/studio/lib/runtime-state-api.ts`.  
- **Why later:** The current state-to-mode mapping using raw field thresholds is functional. Named pressure signals are a refactor that makes the logic more readable and extensible but do not change observable behavior. Do this when the mode/drive computation needs to grow beyond the current threshold set.  
- **What becomes testable:** Pressure scalars are visible in `GET /api/runtime/state`; threshold changes to one pressure do not require editing multiple `computeSessionMode` branches.
