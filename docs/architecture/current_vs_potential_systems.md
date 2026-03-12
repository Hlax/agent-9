# Current vs potential systems — Twin architecture map

This document maps **current runtime systems** to **canon-defined** and **potential future** systems. It answers: what exists today, what is partially implemented, what is canon-only, and what would be required to reach the target architecture. No code is modified; this is documentation and analysis only.

**Canon references:** `docs/canon_v2/01_foundation/twin_decision_system.md`, `docs/canon_v2/02_runtime/session_orchestrator.md`, `docs/canon_v2/02_runtime/creative_metabolism.md`, `docs/canon_v2/01_foundation/light_ontology.md`, `docs/canon_v2/01_foundation/data_model.md`.

---

## Section 1 — Current runtime systems

### 1.1 Session orchestrator

**Purpose:** Run the creative pipeline end-to-end; single entry point for cron and manual session runs.

**Key files:**
- `apps/studio/lib/session-runner.ts`
- `docs/canon_v2/02_runtime/session_orchestrator.md`

**Key functions:**
- `runSessionInternal(options)` — entry; used by POST `/api/session/run` and GET `/api/cron/session`
- `initializeExecutionState`, `loadCreativeStateAndBacklog`, `selectModeAndDrive`, `selectFocus`, `buildContexts`, `runGeneration`, `runCritiqueAndEvaluation`, `persistCoreOutputs`, `persistDerivedState`, `manageProposals`, `writeTraceAndDeliberation`, `persistTrajectoryReview`, `finalizeResult`

**Data structures:**
- `SessionExecutionState` — single mutable state object passed through all stages (supabase, options, previousState, liveBacklog, sessionMode, selectedDrive, focus IDs, brainContext, workingContext, sourceContext, pipelineResult, primaryArtifact, critique, evaluation, flags, decisionSummary, etc.)
- `SessionRunOptions` / `SessionRunSuccessPayload`

**Pipeline stages (execution order):**
1. initializeExecutionState  
2. loadCreativeStateAndBacklog  
3. selectModeAndDrive  
4. selectFocus  
5. buildContexts  
6. runGeneration  
7. [if no artifact] → persistTrajectoryReview (when supabase + pipelineResult) → finalizeResult  
8. runCritiqueAndEvaluation  
9. persistCoreOutputs  
10. persistDerivedState  
11. manageProposals  
12. writeTraceAndDeliberation  
13. persistTrajectoryReview  
14. finalizeResult  

**How stages pass state:** Each stage takes `SessionExecutionState` and returns an updated `SessionExecutionState`; I/O (Supabase, OpenAI, storage) is the only side effect. When `supabase` is null, persist stages no-op.

**Observability:** Session payload returns session_id, artifact_count, persisted, flags (archive_entry_created, recurrence_updated, proposal_created, memory_record_created), warnings. Trace and deliberation are written in writeTraceAndDeliberation.

---

### 1.2 Decision pipeline

**Purpose:** Implement the canonical pipeline: state → mode → drive → focus → medium → generation → critique → proposals → trace.

**Key file:** `apps/studio/lib/session-runner.ts` (same as orchestrator).

**Where each step occurs:**

| Canon step | Runner location | Notes |
|------------|-----------------|--------|
| State and evidence | `loadCreativeStateAndBacklog` | getLatestCreativeState, computePublicCurationBacklog |
| Session mode | `selectModeAndDrive` | computeSessionMode (packages/evaluation) |
| Drive | `selectModeAndDrive` | computeDriveWeights, selectDrive (packages/evaluation); stored/traced only |
| Focus selection | `selectFocus` | Return path (archive) or selectProjectAndThread |
| Preferred medium | `runGeneration` (start) | derivePreferredMedium; explicit from options wins |
| Generation | `runGeneration` | runSessionPipeline (@twin/agent); writing or image path |
| Concept intent (inferred) | Post-generation | Inferred from medium/path; no pre-generation control |
| Artifact role | `persistCoreOutputs` | inferArtifactRole(medium, isCron) |
| Proposal eligibility | `manageProposals` | isProposalEligible (concept); image by cap/duplicate |
| Proposal role / target surface | `manageProposals` | habitat_layout → staging_habitat; avatar_candidate → identity |
| Execution lane | manageProposals + governance | Surface lane only; caps enforced |
| Trace | `writeTraceAndDeliberation`, `persistTrajectoryReview` | Session trace, decision_summary, deliberation_trace, trajectory_review |

---

### 1.3 Creative state system

**Purpose:** Maintain a 0–1 creative state (identity_stability, avatar_alignment, reflection_need, etc.) that feeds mode, drive, and next-session behavior.

**Key files:**
- `packages/evaluation/src/creative-state.ts` — updateCreativeState, computeSessionMode, computeDriveWeights, selectDrive, defaultCreativeState, snapshotToState, stateToSnapshotRow
- `apps/studio/lib/creative-state-load.ts` — getLatestCreativeState
- `apps/studio/lib/session-runner.ts` — persistDerivedState (state snapshot insert), recurrence writeback

**Data structures:**
- `CreativeStateFields` (0–1 floats): identity_stability, avatar_alignment, expression_diversity, unfinished_projects, recent_exploration_rate, creative_tension, curiosity_level, reflection_need, idea_recurrence, public_curation_backlog
- `creative_state_snapshot` table — one row per session after artifact (session_id, state fields, notes)
- `evaluation_signal` table — target_type, target_id, alignment_score, emergence_score, fertility_score, pull_score, recurrence_score, rationale

**How state is derived:** Latest row from `creative_state_snapshot` (or default) is loaded at session start. After each artifact, `updateCreativeState(previousState, evaluation, signals)` computes the next state from evaluation scores and optional signals (repetitionDetected, isReflection, exploredNewMedium, addedUnfinishedWork). That next state is persisted as a new `creative_state_snapshot` row.

**How it affects next sessions:** Loaded in loadCreativeStateAndBacklog as `previousState`; feeds computeSessionMode and computeDriveWeights (and thus focus path when mode is return) and derivePreferredMedium. liveBacklog (proposal count) is merged into state for mode/drive.

**Where thresholds influence behavior:** computeSessionMode uses reflection_need ≥ 0.6, unfinished_projects ≥ 0.6 and idea_recurrence ≥ 0.4, etc., to pick explore/return/reflect/continue/rest. derivePreferredMedium uses reflection_need > 0.65, unfinished_projects > 0.55, avatar_alignment < 0.4, etc. Proposal eligibility uses alignment ≥ 0.6, fertility ≥ 0.7, pull ≥ 0.6.

**Observability:** State is in deliberation trace (state_summary, observations); synthesis pressure and runtime state API expose backlog and snapshot-derived values.

---

### 1.4 Archive + return intelligence

**Purpose:** In "return" mode, choose which archive entry to resurface using recurrence, pull, critique, age, and tension alignment; apply taste bias to avoid over-using the same action kind.

**Key files:**
- `apps/studio/lib/return-intelligence.ts` — scoreReturnCandidates, buildReturnSelectionDebug; types ArchiveCandidateRow, RankedCandidate, ReturnScoringContext
- `apps/studio/lib/trajectory-taste-bias.ts` — getTasteBiasMap, applyTasteBias, fillTastePayloadSelected
- `apps/studio/lib/session-runner.ts` — selectFocus (when sessionMode === "return")

**Data structures:**
- `archive_entry` table — project_id, idea_thread_id, idea_id, artifact_id, recurrence_score, creative_pull, created_at, etc.
- ArchiveCandidateRow, ReturnScoreBreakdown, RankedCandidate in return-intelligence.ts

**How recurring ideas influence focus selection:** In non-return mode, selectProjectAndThread uses thread/idea recurrence_score and creative_pull to weight selection. In return mode, archive candidates are scored by tension_alignment, recurrence_weight, critique_weight, age_weight, exploration_noise; taste bias adjusts the score by action kind (resurface_archive); highest adjusted score wins.

**How archive resurfacing works:** When sessionMode === "return" and archive_entry rows exist, runner loads up to 50 recent entries, fetches artifact medium and critique presence, builds tension kinds from ontology state, runs scoreReturnCandidates, applies taste bias, picks one entry, and sets selectedProjectId/selectedThreadId/selectedIdeaId from that entry.

**Observability:** returnSelectionDebug and tasteBiasDebug stored in state and written to deliberation evidence_checked_json; logs [session] selection: return_from_archive with scores and breakdown.

---

### 1.5 Generation system

**Purpose:** Produce one writing/concept or image artifact using mode, focus context, and preferred medium; optionally upload image to storage.

**Key files:**
- `packages/agent/src/session-pipeline.ts` — runSessionPipeline
- `packages/agent/src/generate-writing.ts` — generateWriting (mode, preferMedium, promptContext, sourceContext, workingContext)
- `packages/agent/src/generate-image.ts` — generateImage
- `apps/studio/lib/session-runner.ts` — buildContexts, runGeneration, uploadImageToStorage

**Data structures:**
- SessionContext (mode, selectedDrive, projectId, ideaThreadId, ideaId, workingContext, sourceContext, preferMedium)
- CreativeSession, Artifact (in-memory until persistCoreOutputs)

**working_context vs source_context:**
- **workingContext:** Identity, creative state narrative, and "Recently exploring" memory; built by buildIdentityVoiceContext(brainContext) in session-runner, which uses buildWorkingContextString in brain-context.ts. Injected into the generation system prompt so the LLM writes as the Twin with ongoing themes.
- **sourceContext:** Project/thread/idea reference material. brainContext.sourceSummary plus getProjectThreadIdeaContext(supabase, selectedProjectId, selectedThreadId, selectedIdeaId) when focus is set. Passed as user-prompt context (relevant context).

**How medium steers generation:** preferMedium (or derived) chooses image vs writing path. If image, runSessionPipeline calls generateImage; else generateWriting. For writing, preferMedium === "concept" adds CONCEPT_HABITAT_GUIDANCE to the user prompt and may use a different model env. Mode is passed as literal "Mode: ${mode}." in the prompt; drive is not passed to generation.

**Image upload path:** After runSessionPipeline, if primaryArtifact.medium === "image" and content_uri is set, session-runner calls uploadImageToStorage(supabase, imageUrl, sessionId, artifactId), uploads to Supabase Storage bucket "artifacts", and replaces artifact content_uri/preview_uri with the public URL.

**Observability:** Session trace records artifact_id, proposal_id, tokens_used, generation_model; generation_run row stores model_name.

---

### 1.6 Critique + evaluation system

**Purpose:** Run LLM critique on the primary artifact and derive evaluation signals (alignment, emergence, fertility, pull, recurrence); feed state update, recurrence writeback, and proposal eligibility.

**Key files:**
- `packages/evaluation` — runCritique, computeEvaluationSignals (signals.ts), updateCreativeState (creative-state.ts)
- `apps/studio/lib/session-runner.ts` — runCritiqueAndEvaluation, persistCoreOutputs (evaluation_signal insert), persistDerivedState (updateCreativeState, recurrence writeback)

**Data structures:**
- CritiqueRecord (critique_outcome, notes)
- EvaluationSignal (target_type, target_id, alignment_score, emergence_score, fertility_score, pull_score, recurrence_score, rationale)
- critique_record table, evaluation_signal table

**How critique affects proposals:** isProposalEligible (concept path) requires critique_outcome ∈ { continue, branch, shift_medium }. Avatar path does not use critique outcome for eligibility; proposal creation is gated by cap and no duplicate for same artifact.

**How signals affect recurrence and state:** evaluation.recurrence_score is written to artifact and to idea/idea_thread (recurrence writeback) when selectedIdeaId/selectedThreadId are set. updateCreativeState(previousState, evaluation, signals) produces the next creative state (reflection_need, idea_recurrence, etc.) which is persisted as creative_state_snapshot. Alignment, fertility, pull are used for proposal eligibility thresholds.

**Observability:** evaluation_signal rows; artifact row updated with scores; deliberation and trajectory_review reference critique/outcome.

---

### 1.7 Proposal system

**Purpose:** Create or refresh proposal_record rows for habitat_layout (concept) and avatar_candidate (image) when eligible and under caps; never transition or apply proposals.

**Key files:**
- `apps/studio/lib/session-runner.ts` — manageProposals
- `apps/studio/lib/proposal-eligibility.ts` — isProposalEligible
- `apps/studio/lib/habitat-payload.ts` — buildMinimalHabitatPayloadFromConcept, validateHabitatPayload, capSummaryTo200Words
- `apps/studio/lib/stop-limits.ts` — getMaxPendingHabitatLayoutProposals, getMaxPendingAvatarProposals

**Proposal roles implemented:** habitat_layout (concept → staging_habitat), avatar_candidate (image → identity).

**Eligibility (concept):** medium === "concept", critique_outcome in { continue, branch, shift_medium }, alignment ≥ 0.6, fertility ≥ 0.7, pull ≥ 0.6. Image: no eligibility check; must not already have a proposal for this artifact_id and pending count < avatar cap.

**Proposal creation rules:** Habitat: if at cap, refresh newest and archive older (legal FSM transition); else insert new. Avatar: insert if under cap and no existing proposal for this artifact. Runner only inserts/updates; no state transitions beyond initial pending_review or archival of older habitat proposals.

**Governance states:** proposal_record.proposal_state follows PROPOSAL_STATE_TRANSITIONS in governance-rules.ts (pending_review, needs_revision, approved_for_staging, staged, approved_for_publication, published, archived, rejected, ignored). Transitions and application are human-gated via API (PATCH, POST approve).

**Review process:** Operator reviews in Studio (review/surface/habitat, review/surface/avatar); approval and apply are separate API routes.

**Observability:** traceProposalId, traceProposalType, proposalCreated in session payload; proposal_record persisted; trace stores proposal_id.

---

### 1.8 Governance system

**Purpose:** Enforce allowed transitions for artifact approval and proposal state; prevent illegal transitions.

**Key files:**
- `apps/studio/lib/governance-rules.ts` — ARTIFACT_APPROVAL_TRANSITIONS, PROPOSAL_STATE_TRANSITIONS, isLegalArtifactApprovalTransition, isLegalProposalStateTransition
- `apps/studio/app/api/artifacts/[id]/approve/route.ts`, `apps/studio/app/api/proposals/[id]/approve/route.ts` — use transition guards

**Allowed autonomous actions (Twin):** Generate artifacts (pending_review, private). Create or refresh proposal_record (initial state pending_review). Archive older habitat_layout proposals when refreshing newest (only where transition to archived is legal). No approval_record or publication_record written by runner; no proposal state transition to approved/staged/published by runner.

**Human-gated transitions:** Artifact: pending_review/needs_revision → approved*, rejected, archived via POST /api/artifacts/[id]/approve. Proposal: state changes via PATCH or POST /api/proposals/[id]/approve. Publication: only when artifact is approved_for_publication. Identity and public habitat: apply after proposal approval or manual PATCH.

**Observability:** change_record written by approval/apply routes; governance rules are not logged per transition but enforce at API layer.

---

### 1.9 Observability systems

**Purpose:** Persist and expose session trace, deliberation, trajectory review, and runtime state for operators.

**Key files:**
- `apps/studio/lib/session-runner.ts` — writeTraceAndDeliberation, persistTrajectoryReview
- `apps/studio/lib/deliberation-trace.ts` — writeDeliberationTrace
- `apps/studio/lib/trajectory-review.ts` — deriveTrajectoryReview
- `apps/studio/lib/runtime-state-api.ts` — getRuntimeStatePayload, getRuntimeTracePayload, getRuntimeDeliberationPayload, getRuntimeContinuityPayload
- `apps/studio/lib/runtime-continuity.ts` — buildContinuityRows, buildContinuityAggregate
- `apps/studio/lib/ontology-helpers.ts` — classifyNarrativeState, classifyActionKind, deriveTensionKinds, deriveEvidenceKinds, classifyConfidenceBand

**What is persisted:** creative_session.trace (mode, drive, project/thread/idea ids and names, artifact_id, proposal_id, tokens_used, timestamps), creative_session.decision_summary (reasons, rejected_alternatives, next_action, confidence). deliberation_trace: observations_json, state_summary, tensions_json, hypotheses_json, evidence_checked_json, rejected_alternatives_json, chosen_action, confidence, execution_mode, human_gate_reason, outcome_summary. trajectory_review: narrative_state, action_kind, scores, issues_json, strengths_json, etc.

**What operators can see:** Runtime debug page: current state (runtime config, creative_state, return_candidates, synthesis_pressure), last 10 sessions (traces), latest deliberation (ontology panel), continuity history (narrative_state, action_kind, tension counts, confidence). GET /api/runtime/state, trace, deliberation, continuity. Metabolism panel (client) fetches /api/runtime/state.

**How reasoning is surfaced:** Deliberation trace holds observations (session_mode, selected_drive, narrative_state), evidence_checked (selected IDs, archive_candidate_available, backlog), hypotheses (selection_reason, action_kind, confidence_band). Continuity aggregates narrative_counts, action_counts, tension_counts, average_confidence. Ontology panel and continuity UI render these; confidence is from decisionSummary.confidence (default 0.7 unless set elsewhere).

---

## Section 2 — Partially implemented systems

### 2.1 Drive influence on generation

**Canon / intention:** Drive is part of the steering vocabulary (light_ontology, twin_decision_system); canon describes it as influencing creative direction.

**Current state:** Drive is computed (computeDriveWeights, selectDrive) and stored on creative_session and in trace and deliberation_trace. It is **not** passed to generateWriting or generateImage. SessionContext has selectedDrive but the agent does not include it in the prompt. So drive is **stored and traced only**; it does not steer generation.

**Decision (architecture closure audit 2026-03-12):** Drive is formally classified as a **descriptive/observability label** for the current architecture. It is not injected into the generation prompt. This is intentional: there is no runtime evidence yet that drive injection would meaningfully differentiate output. Drive injection into generation prompts is a future evolution (deferred to Group 3 of the implementation sequence). See `docs/architecture/architecture_closure_audit.md` §D.1 and §F.

**No gap pending:** The canon description "drive influences the pipeline's creative direction" means drive influences mode/focus decisions (via computeDriveWeights → computeSessionMode), not that it must appear in the generation prompt. This is documented in `docs/canon_v2/02_runtime/creative_metabolism.md` §3.

---

### 2.2 Explicit concept intent

**Canon:** twin_decision_system and "Future semantic upgrade: concept intent" describe concept intent as a semantic layer (what the artifact is for); explicit intent as smallest next layer (focus → concept intent → preferred medium → generation).

**Current state:** Concept intent is **inferred after the fact** from medium and path (concept → layout_spec, image → avatar_exploration). There is no concept_intent or artifact_intent field set before generation or passed into the prompt. Artifact role (layout_concept, image_concept) is inferred from medium + isCron after generation.

**Gap:** No first-class pre-generation concept intent. This is a future evolution (deferred to Group 3 of the implementation sequence). See `docs/architecture/architecture_closure_audit.md` §C.4.

---

### 2.3 Confidence signal

**Canon / UI:** Trajectory review and deliberation trace include confidence and confidence_band; ontology panel shows them.

**Current state (updated):** `applyConfidenceFromCritique` (session-runner.ts) now derives confidence as `(alignment_score + pull_score) / 2` and sets `confidence_truth = "inferred"` when evaluation is available, or `"defaulted"` when not. `decisionSummary.confidence` is no longer always 0.7; it is a real score from critique. `guardrail_stop = "low_confidence"` stops cron batches when confidence is below threshold.

**Status:** Implemented. See `applyConfidenceFromCritique` in session-runner.ts.

---

## Section 3 — Systems defined in canon but not implemented

### 3.1 System proposal lane

**Canon:** light_ontology and twin_decision_system list proposal_role `system_change_proposal` and decision_class / system_governed as reserved. System lanes exist in UI/canon for proposals that affect runtime logic, ontology, or configuration.

**Runtime:** No code path creates a proposal_record with lane_type = "system". manageProposals creates habitat_layout (concept), avatar_candidate (image), and extension proposals (medium lane). No system_change_proposal creation, caps, or apply flow in the runner.

**Verdict (architecture closure audit 2026-03-12):** System proposals are **intentionally human-initiated only**. The runner signals capability gaps through medium-lane extension proposals. System proposals — which affect platform, runtime, or governance behavior — require deliberate human judgment. This is a formal policy, not a pending implementation. See `docs/architecture/proposal_resolution_lanes_canon.md` §System proposals — initiation rule.

---

### 3.2 Extended medium types

**Canon:** light_ontology and concept intent mention possible future mediums (e.g. system, surface, code, structural concept). twin_decision_system lists only writing, concept, image as current.

**Runtime:** packages/core enums define artifact_medium as writing, image, audio, video, concept. Session runner and agent use only **writing, concept, image**. No generation path for audio or video; no "system" or "surface" or "code" medium. Pipeline and derivePreferredMedium are fixed on these three.

**Verdict:** Schema allows audio/video; **runtime does not**. No extension point to register new mediums without changing pipeline and runner.

---

### 3.3 Surface patch system

**Canon:** Discussions of staging layout changes, habitat mutations, structured UI changes; habitat_layout proposals carry habitat_payload_json (validated structure).

**Runtime:** Habitat proposals are created from concept artifacts; payload is built by buildMinimalHabitatPayloadFromConcept and validated by validateHabitatPayload. Application of approved habitat proposals (writing to public_habitat_content or staging) is done in approval/apply routes, not as a generic "patch engine" with schema, validator, apply/rollback, and change_record trail. So: **concept → proposal with payload exists**; **structured patch engine with rollback and formal change trail** is not implemented.

**Verdict:** Proposals with habitat payload exist; **no general staging patch engine** (patch schema, validator, apply/rollback, change_record) in runtime.

---

## Section 4 — Potential future systems

These would be required to support the target architecture implied by canon and prior analysis.

| Future system | Description | Would require |
|---------------|-------------|----------------|
| **Staging patch engine** | Structured mutations of staging habitat with clear lifecycle. | Patch schema (e.g. layout diff); validator; apply + rollback; change_record trail; optional preview. |
| **System proposal engine** | Proposals that affect runtime logic, ontology, or config. | proposal_role = system_change_proposal; subtype classification (e.g. decision_logic, ontology, runtime_config, mediums); review UI; operator approval and apply path; governance for system changes. |
| **Medium extension system** | New mediums without rewriting pipeline. | Registry or config of mediums; pipeline branch by medium type; derivePreferredMedium and eligibility rules extensible; artifact_role and proposal_role mapping per medium. |
| **Decision pressure signals** | Named pressures (archive_pressure, proposal_pressure, reflection_pressure, identity_pressure) that influence drive selection or mode. | Derive pressure scalars from state/backlog; feed into computeDriveWeights or computeSessionMode; optional exposure in trace. |
| **Explicit concept intent** | Pre-generation intent step. | focus → concept intent → preferred medium → generation; intent in prompt; optional artifact_intent/concept_intent field. |
| **Drive in prompt** | Drive steers generation content. | Pass selectedDrive (or label) into generateWriting/generateImage user prompt. |
| **Confidence from critique** | Confidence derived from evaluation/critique. | Map evaluation scores or critique outcome to a scalar; set decisionSummary.confidence in runner; or stop presenting as derived. |

---

## Section 5 — Architecture diagram

**Current runtime flow:**

```
state (creative_state_snapshot + live backlog)
    ↓
loadCreativeStateAndBacklog
    ↓
session mode + drive (selectModeAndDrive)
    ↓
focus selection (selectFocus: archive or project/thread)
    ↓
contexts (buildContexts: workingContext, sourceContext)
    ↓
preferred medium (derivePreferredMedium in runGeneration)
    ↓
generation (runSessionPipeline: writing or image)
    ↓
critique + evaluation (runCritiqueAndEvaluation)
    ↓
persistCoreOutputs (session, artifact, critique, evaluation, generation_run)
    ↓
persistDerivedState (archive_entry?, creative_state_snapshot, memory_record, recurrence writeback)
    ↓
manageProposals (habitat_layout / avatar_candidate, caps)
    ↓
writeTraceAndDeliberation + persistTrajectoryReview
    ↓
trace + observability (session trace, deliberation_trace, trajectory_review, runtime API)
```

**Governance boundary:** Runner creates artifacts and proposals only. All approval, staging, and public/identity mutation are human-gated via API (governance-rules guard transitions).

**Where potential systems would attach:**
- **Explicit concept intent:** Between focus selection and preferred medium (focus → concept intent → preferred medium → generation).
- **Drive in prompt:** Inside runSessionPipeline / generateWriting / generateImage (add drive to user prompt).
- **Confidence from critique:** After runCritiqueAndEvaluation or persistCoreOutputs; set state.decisionSummary.confidence.
- **System proposal engine:** New branch in manageProposals or a separate stage; proposal_role system_change_proposal; new apply route and UI.
- **Staging patch engine:** Downstream of proposal approval; apply route consumes habitat_payload_json or a patch schema and performs apply/rollback with change_record.
- **Medium extension:** Registry consulted in runGeneration and manageProposals; new branches for new mediums.
- **Decision pressure signals:** Inputs to selectModeAndDrive or new step; feed drive weights or mode thresholds.

---

## Section 6 — Summary

| System | Status | Notes |
|--------|--------|--------|
| Session orchestrator | Implemented | session-runner.ts; staged flow; SessionExecutionState |
| Decision pipeline | Implemented | Integrated in runner; state → mode → drive → focus → medium → generation → critique → proposals → trace |
| Creative state | Implemented | evaluation signals + updateCreativeState; snapshot per session; recurrence writeback |
| Archive + return intelligence | Implemented | return-intelligence.ts + taste bias; used when mode === return |
| Generation system | Implemented | @twin/agent; workingContext vs sourceContext; medium steers path; image upload |
| Critique + evaluation | Implemented | packages/evaluation; eligibility and recurrence depend on it |
| Proposal system | Implemented | habitat_layout, avatar_candidate; eligibility + caps; no apply by runner |
| Governance | Implemented | governance-rules.ts; artifact and proposal transition guards; human-gated apply |
| Observability | Implemented | trace, deliberation_trace, trajectory_review, runtime-state-api, continuity |
| Drive in generation | **Descriptive by design** | Stored, traced, and formally classified as observability label; generation prompt injection deferred to later evolution |
| Explicit concept intent | Deferred | Inferred post-generation only; canon defines as future layer; deferred to Group 3 |
| Confidence signal | Implemented | `applyConfidenceFromCritique` derives (alignment + pull) / 2; confidence_truth "inferred" or "defaulted"; guardrail_stop on low_confidence |
| System proposal lane | **Policy: human-initiated only** | Runner creates medium-lane extension proposals; system proposals are human-initiated by design; formally documented in proposal_resolution_lanes_canon.md |
| Surface patch engine | Not implemented | Concept → proposal with payload; no generic patch/rollback engine |
| Medium extension | Not implemented | Mediums fixed (writing, concept, image); schema has audio/video unused |
| Staging auto-mutation | Not implemented | All staging/public mutation human-gated |
| Decision pressure signals | Not implemented | Canon/traces mention tensions; not used as first-class drive/mode input |
