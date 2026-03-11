# Agent Decision Canon QA Report

**Prepared**: 2026-03-11  
**Audit scope**: canon_v2 docs vs. repo code as of this commit  
**Auditor**: Automated QA agent  
**Stabilization pass**: Issues 2–5 below were fixed in the stabilization pass (see §5 for verdict updates).

---

## 1. Executive Verdict

**VERDICT: YES, WITH NARROW SCOPE**

The core runtime decision layer is well-implemented and mostly verifiable against the canon_v2 docs. The major governance boundaries (artifact approval FSM, proposal FSM, habitat/avatar write paths, change_record audit) are enforced in code and match the canon with two material exceptions noted below.

**Why not a full YES:**

1. **`ExecutionMode` and `HumanGateReason` are declared but never behaviorally wired.** The runner always emits `executionMode: "auto"` and `humanGateReason: null`. Any canon claim about these fields influencing behavior is unsupported.
2. ~~**`apply_name` and `approve_avatar` actions in `POST /api/proposals/[id]/approve` are broken by the proposal FSM check.**~~ **FIXED**: Both actions now target `approved_for_staging`, a legal FSM transition from `pending_review`.
3. ~~**`packages/core/src/types.ts` `Identity` interface is missing five columns**~~ **FIXED**: All five fields added (`active_avatar_artifact_id`, `name_status`, `name_rationale`, `naming_readiness_score`, `naming_readiness_notes`).
4. ~~**`manageProposals` bypasses the FSM guard when archiving older proposals.**~~ **FIXED**: Archival now uses `isLegalProposalStateTransition` guard with an explicit comment.

The safe writeable scope is: **runtime decisions, proposal creation (not application), governance boundary classification, and deliberation trace contents**. `ExecutionMode`/`HumanGateReason` semantics cannot be canonized until wired.

---

## 2. Verified Runtime Decisions

| Decision | File / Function | Inputs | Outputs | Persisted / Audited? | Status |
|---|---|---|---|---|---|
| **Session mode selection** (`explore`/`return`) | `session-runner.ts` → `selectModeAndDrive` → `computeSessionMode(@twin/evaluation)` | Latest creative state snapshot (all 10 score fields) + live proposal backlog count | `state.sessionMode` | Yes — written to `deliberation_trace.observations_json.session_mode` and `creative_session.trace` | VERIFIED |
| **Drive selection** | `session-runner.ts` → `selectModeAndDrive` → `computeDriveWeights` + `selectDrive` | Creative state scores + live backlog | `state.selectedDrive` | Yes — `creative_session.selected_drive`, `deliberation_trace.observations_json.selected_drive` | VERIFIED |
| **Focus selection — archive return path** | `session-runner.ts` → `selectFocus` | `sessionMode === "return"`, `archive_entry` rows (up to 50) ordered by `created_at DESC`; weighted by `recurrence_score * 0.6 + creative_pull * 0.4 * recency_decay` | `selectedProjectId`, `selectedThreadId`, `selectedIdeaId`, `selectionSource = "archive"`, `archiveCandidateAvailable = true` | Yes — `deliberation_trace.evidence_checked_json`, `hypotheses_json.selection_reason = "archive_return_due_to_mode"` | VERIFIED |
| **Focus selection — project/thread/idea default** | `session-runner.ts` → `selectFocus` → `selectProjectAndThread(@twin/project-thread-selection)` | Active project/thread rows; weighted by recurrence and creative_pull | `selectedProjectId`, `selectedThreadId`, `selectedIdeaId`, `selectionSource = "project_thread"` | Yes — `deliberation_trace.evidence_checked_json`, `hypotheses_json.selection_reason = "project_thread_default"` | VERIFIED |
| **Archive decay weighting** | `session-runner.ts` → `selectFocus` | `recurrence_score`, `creative_pull`, `created_at` of archive entries; `getArchiveDecayHalfLifeDays()` (default 60 days, env-overridable) | Weighted probability per archive entry | Implicit in selection | VERIFIED |
| **Medium derivation** | `session-runner.ts` → `derivePreferredMedium` | Creative state scores (`reflection_need`, `unfinished_projects`, `avatar_alignment`, `expression_diversity`, `creative_tension`, `public_curation_backlog`), `isCron`, `explicit preferMedium` | `derivedPreferMedium` (`writing`/`concept`/`image`/null) | Yes — `creative_session.trace.generation_model` (indirect); `SessionRunSuccessPayload.requested_medium` | VERIFIED |
| **Artifact role inference** | `session-runner.ts` → `inferArtifactRole` | `artifact.medium`, `isCron` | `artifact_role: "layout_concept"` (concept+cron) or `"image_concept"` (image+cron) or null | Yes — `artifact.artifact_role` column (DB) | VERIFIED |
| **Proposal eligibility check** | `session-runner.ts` → `manageProposals` + `apps/studio/lib/proposal-eligibility.ts` → `isProposalEligible` | `medium`, `alignment_score >= 0.6`, `fertility_score >= 0.7`, `pull_score >= 0.6`, `critique_outcome ∈ {continue, branch, shift_medium}` | `eligibility.eligible: boolean` | Not directly; controls whether `proposal_record` is inserted | VERIFIED |
| **Proposal cap enforcement** | `session-runner.ts` → `manageProposals` | `getMaxPendingHabitatLayoutProposals()` (default 2), count of `proposal_record` rows with `lane_type=surface`, `proposal_role=habitat_layout`, `proposal_state ∈ {pending_review, approved_for_staging, staged}`; `getMaxPendingAvatarProposals()` (default 3), count of `pending_review` avatar proposals | Skip proposal creation when at cap | Yes — logs `[session] skipping...` | VERIFIED |
| **Proposal create / refresh (habitat layout)** | `session-runner.ts` → `manageProposals` | Eligible concept artifact; existing active proposals | Insert new `proposal_record` (state `pending_review`) or update newest existing + archive older ones | Yes — `proposal_record` row; `traceProposalId`, `traceProposalType` in session trace | VERIFIED |
| **Proposal create (avatar candidate)** | `session-runner.ts` → `manageProposals` | Image artifact; no existing `avatar_candidate` proposal for this artifact; pending avatar count < cap | Insert `proposal_record` (state `pending_review`) | Yes — `proposal_record` row | VERIFIED |
| **Archive older habitat proposals** | `session-runner.ts` → `manageProposals` | Existing active proposals beyond the newest one | Directly sets `proposal_state = "archived"` on older rows (bypasses FSM guard) | Yes — DB update; **not** covered by `isLegalProposalStateTransition` call | PARTIALLY VERIFIED — gap noted (§5) |
| **Token limit enforcement** | `session-runner.ts` → `runGeneration` + `stop-limits.ts` → `isOverTokenLimit` | `tokensUsed` from pipeline result; `getMaxTokensPerSession()` (default 0 = disabled, env `MAX_TOKENS_PER_SESSION`) | Throws `SessionRunError(400)` if exceeded | Session aborted — no persist | VERIFIED |
| **Max artifacts per session cap** | `session-runner.ts` → `runGeneration` + `stop-limits.ts` → `getMaxArtifactsPerSession` | `MAX_ARTIFACTS_PER_SESSION` env (default 1) | `pipelineResult.artifacts.slice(0, maxArtifacts)` | Implicit in what gets persisted | VERIFIED |
| **Repetition detection** | `session-runner.ts` → `persistCoreOutputs` + `apps/studio/lib/repetition-detection.ts` → `detectRepetition` | Last N `critique_outcome` values (window from `REPETITION_WINDOW`, default 5; threshold `REPETITION_THRESHOLD = 4`) | `state.repetitionDetected: boolean` (feeds creative state update) | Implicit in creative state snapshot | VERIFIED |
| **Creative state update** | `session-runner.ts` → `persistDerivedState` + `@twin/evaluation` → `updateCreativeState` | Previous creative state, evaluation signals, `repetitionDetected`, session signals (`isReflection`, `exploredNewMedium`, `addedUnfinishedWork`) | New creative state values → `creative_state_snapshot` insert | Yes — `creative_state_snapshot` row | VERIFIED |
| **Memory record creation** | `session-runner.ts` → `persistDerivedState` | Artifact title, summary, critique summary; `evaluation.pull_score`, `evaluation.recurrence_score` | `memory_record` insert (`memory_type = "session_reflection"`) | Yes — `memory_record` row | VERIFIED |
| **Archive entry creation (critique_outcome)** | `session-runner.ts` → `persistDerivedState` | `critique.critique_outcome === "archive_candidate"` | `archive_entry` insert | Yes — `archive_entry` row; soft failure (warning) | VERIFIED |
| **Recurrence writeback** | `session-runner.ts` → `persistDerivedState` | `evaluation.recurrence_score`, `selectedIdeaId`, `selectedThreadId` | Update `idea.recurrence_score` and/or `idea_thread.recurrence_score` | Yes — DB update; soft failure (warning) | VERIFIED |
| **Daily token usage tracking** | `session-runner.ts` → `persistDerivedState` + `runtime-config.ts` → `addTokenUsage` | `pipelineResult.tokensUsed`; `tokens_used_today` and `tokens_reset_at` in `runtime_config` | Upsert `runtime_config` keys `tokens_used_today` + `tokens_reset_at` | Yes — `runtime_config` table | VERIFIED |
| **Scheduler mode / interval gating** | `apps/studio/app/api/cron/session/route.ts` + `runtime-config.ts` → `getIntervalMs`, `getSessionsRunInLastHour` | `runtime_config.mode` (slow/default/steady/turbo), `last_run_at`, sessions in last hour vs `MAX_SESSIONS_PER_HOUR` (default 4) | Skip or run session | Yes — `runtime_config.last_run_at` updated after successful run | VERIFIED |
| **Deliberation trace write** | `session-runner.ts` → `writeTraceAndDeliberation` + `deliberation-trace.ts` → `writeDeliberationTrace` | Full `SessionExecutionState` (mode, drive, focus, backlog, proposal ID, execution_mode, human_gate_reason, etc.) | `deliberation_trace` row insert | Yes — `deliberation_trace` table, indexed `(session_id, created_at DESC)` | VERIFIED |
| **Session trace + decision_summary write** | `session-runner.ts` → `writeTraceAndDeliberation` | `state.decisionSummary`, `metabolismMode`, project/thread/idea labels | Update `creative_session.trace` (JSONB) and `creative_session.decision_summary` (JSONB) | Yes — `creative_session` columns (added in migrations) | VERIFIED |
| **Execution mode classification** | `session-runner.ts` → `initializeExecutionState` | None (hardcoded) | `executionMode: "auto"`, `humanGateReason: null` — never changed | Yes — emitted to `deliberation_trace.execution_mode` / `human_gate_reason` | PARTIALLY VERIFIED — always null/auto, not behaviorally wired (§5) |
| **Metabolism mode capture** | `session-runner.ts` → `writeTraceAndDeliberation` → `getRuntimeConfig(supabase)` | `runtime_config.mode` DB value | `state.metabolismMode`; emitted to `deliberation_trace.observations_json.metabolism_mode` | Yes — in deliberation trace | VERIFIED |
| **Early exit (no artifact)** | `session-runner.ts` → `runSessionInternal` | `!state.primaryArtifact \|\| !state.pipelineResult` | Skip all persist stages; `finalizeResult(state)` returns `persisted: false`, `artifact_count: 0` | No DB writes | VERIFIED |
| **Null supabase no-op** | `session-runner.ts` → `runSessionInternal` | `supabase === null` | All persist stages no-op | `persisted: false` in payload | VERIFIED |

---

## 3. Human-Gated vs Autonomous Matrix

| Action | Classification | Enforcing Route / Function | Evidence |
|---|---|---|---|
| **Session mode (explore/return) selection** | **Autonomous** | `session-runner.ts` → `selectModeAndDrive` | Derived from creative state; no human input |
| **Drive selection** | **Autonomous** | `session-runner.ts` → `selectModeAndDrive` | Derived from creative state weights |
| **Project / thread / idea focus selection** | **Autonomous** | `session-runner.ts` → `selectFocus` | Weighted random from active or archive rows |
| **Medium derivation (writing/concept/image)** | **Autonomous** | `session-runner.ts` → `derivePreferredMedium` | Creative state heuristic; caller can override via `preferMedium` option |
| **Artifact generation (LLM/image call)** | **Autonomous** | `session-runner.ts` → `runGeneration` → `runSessionPipeline(@twin/agent)` | No human gate |
| **Critique and evaluation** | **Autonomous** | `session-runner.ts` → `runCritiqueAndEvaluation` | LLM critique + deterministic evaluation signals |
| **Archive entry creation (from critique)** | **Autonomous** | `session-runner.ts` → `persistDerivedState` | Triggered when `critique_outcome === "archive_candidate"` |
| **Recurrence writeback** | **Autonomous** | `session-runner.ts` → `persistDerivedState` | Writes to `idea.recurrence_score`, `idea_thread.recurrence_score` |
| **Memory record creation** | **Autonomous** | `session-runner.ts` → `persistDerivedState` | One row per completed session |
| **Habitat layout proposal creation / refresh** | **Proposal-only** (agent creates; human applies) | `session-runner.ts` → `manageProposals` | Inserts `proposal_record` with state `pending_review`; does not call approve route |
| **Avatar candidate proposal creation** | **Proposal-only** (agent creates; human applies) | `session-runner.ts` → `manageProposals` | Inserts `proposal_record` with state `pending_review`; does not call approve route |
| **Archive older habitat proposals** | **Autonomous** (gap) | `session-runner.ts` → `manageProposals` (direct DB update) | Bypasses FSM guard; sets `proposal_state = "archived"` directly — see §5 |
| **Artifact approval state change** | **Human-gated** | `POST /api/artifacts/[id]/approve` | FSM guard `isLegalArtifactApprovalTransition`; requires auth; inserts `approval_record` |
| **Artifact publish** | **Human-gated** | `POST /api/artifacts/[id]/publish` | Requires `current_approval_state === "approved_for_publication"`; staging gate via `passesStagingGate`; requires auth; inserts `publication_record` |
| **Artifact archive entry (via approval route)** | **Human-gated** | `POST /api/artifacts/[id]/approve` (when `approval_state === "archived"`) | Auth-gated; idempotent archive_entry upsert |
| **Proposal state transition (PATCH)** | **Human-gated** | `PATCH /api/proposals/[id]` | FSM guard `isValidProposalTransition`; requires auth |
| **Proposal approve + apply (name, avatar, habitat)** | **Human-gated** | `POST /api/proposals/[id]/approve` | FSM guard `isLegalProposalStateTransition`; requires auth; writes `change_record` on application |
| **Identity name update (via proposal)** | **Human-gated** | `POST /api/proposals/[id]/approve` (action `apply_name`) | Updates `identity.name`; writes `change_record` (identity_update); **currently broken by FSM gap — §5** |
| **Embodiment direction update (via proposal)** | **Human-gated** | `POST /api/proposals/[id]/approve` (action `approve_avatar`) | Updates `identity.embodiment_direction`; writes `change_record` (embodiment_update); **currently broken by FSM gap — §5** |
| **Active avatar set (via proposal)** | **Human-gated** | `POST /api/proposals/[id]/approve` (action `approve_for_publication`, `target_type = "avatar_candidate"`) | Validates artifact is image + approved; updates `identity.active_avatar_artifact_id`; writes `change_record` (avatar_update) |
| **Active avatar set (via identity PATCH)** | **Manual override** | `PATCH /api/identity` | Validates artifact is image + approved/approved_for_publication; requires auth; writes `change_record` (embodiment_update) when avatar changes; **bypasses proposal lane entirely** |
| **Habitat content publication (via proposal)** | **Human-gated** | `POST /api/proposals/[id]/approve` (action `approve_for_publication`, habitat target_type) | Validates `habitat_payload_json`; checks all referenced artifact IDs are published or active avatar; upserts `public_habitat_content`; writes `change_record` (habitat_update) |
| **Habitat content clear** | **Human-gated** | `POST /api/habitat-content/clear` | Requires auth; slug must be in `{home, works, about, installation}`; always writes `change_record` (habitat_update, reason: manual_habitat_clear) |
| **Identity fields update (name, summary, philosophy, directions)** | **Human-gated** | `PATCH /api/identity` | Requires auth; FSM-like guard on `name_status === "accepted"` (blocks name change after acceptance) |
| **Runtime config (mode, always_on)** | **Human-gated** | `PATCH /api/runtime/config/route.ts` (if present) / `setRuntimeConfig` in `runtime-config.ts` | Auth-gated in API route; no change_record written for runtime config changes |
| **Proposal unpublish (rollback)** | **Human-gated / privileged** | `POST /api/proposals/[id]/unpublish` | Privileged rollback path; exists separately from PATCH (see governance-rules comment) |

---

## 4. Canon v2 Truth Table

| Canon Claim | Doc Location | Code Evidence | Verdict | Notes |
|---|---|---|---|---|
| `SessionExecutionState` holds all stage data; stages are pure except I/O | `02_runtime/session_orchestrator.md §1, §4` | `interface SessionExecutionState` in `session-runner.ts`; each stage takes and returns state; side effects (Supabase, OpenAI) are only in stage bodies | **VERIFIED IN CODE** | Matches exactly |
| Staged flow: init → load → mode/drive → focus → contexts → generation → critique → persistCore → persistDerived → manageProposals → traceAndDeliberation → finalize | `02_runtime/session_orchestrator.md §2` | `runSessionInternal` in `session-runner.ts` | **VERIFIED IN CODE** | Order matches; early exit on no artifact confirmed |
| Early exit if no primaryArtifact / pipelineResult after `runGeneration` | `02_runtime/session_orchestrator.md §2` | `if (!state.primaryArtifact \|\| !state.pipelineResult) return finalizeResult(state)` in `runSessionInternal` | **VERIFIED IN CODE** | |
| `executionMode` initializes to `"auto"`; `"proposal_only"` and `"human_required"` reserved for future | `02_runtime/session_orchestrator.md §5` | `executionMode: "auto"` in `initializeExecutionState`; no other assignment in current runner | **VERIFIED IN CODE** | `executionMode` is always "auto" in all runs |
| `humanGateReason` is null by default; set only where a human gate is explicitly recorded | `02_runtime/session_orchestrator.md §5` | `humanGateReason: null` in `initializeExecutionState`; never reassigned in current code | **VERIFIED IN CODE** | Always null — see §5 for implications |
| Write ordering: persistCoreOutputs → persistDerivedState → manageProposals → writeTraceAndDeliberation | `02_runtime/session_orchestrator.md §6` | Sequential await calls in `runSessionInternal` | **VERIFIED IN CODE** | |
| `persistCoreOutputs` order: creative_session → artifact → critique_record → evaluation_signal → artifact score update → generation_run | `02_runtime/session_orchestrator.md §6`, `01_foundation/data_model.md §3` | `persistCoreOutputs` function body in `session-runner.ts` | **VERIFIED IN CODE** | |
| `persistDerivedState` order: creative_state_snapshot → memory_record → archive_entry (if needed) → recurrence writeback | `01_foundation/data_model.md §2`, `02_runtime/session_orchestrator.md §3` | `persistDerivedState` function body | **VERIFIED IN CODE** | Actual order: archive_entry → creative_state_snapshot → memory_record → recurrence writeback (state snapshot before memory) |
| Proposal creation without application: runner inserts only, does not transition or apply | `02_runtime/session_orchestrator.md §3`, `01_foundation/data_model.md §4` | `manageProposals` only calls `supabase.from("proposal_record").insert(...)` and `.update({title, summary, habitat_payload_json})` (never calls approve route or FSM transitions) | **VERIFIED IN CODE** | Exception: runner directly archives older proposals without FSM guard — §5 |
| Deliberation trace contents: `observations_json`, `evidence_checked_json`, `hypotheses_json`, `tensions_json`, `rejected_alternatives_json`, `chosen_action`, `confidence`, `execution_mode`, `human_gate_reason`, `outcome_summary` | `01_foundation/data_model.md §6` | `writeDeliberationTrace` called in `writeTraceAndDeliberation`; all fields populated from `SessionExecutionState` | **VERIFIED IN CODE** | Field keys match canon exactly |
| Deliberation trace is built only from `SessionExecutionState`; no extra DB reads for trace content | `01_foundation/data_model.md §6` | `writeTraceAndDeliberation` calls `getRuntimeConfig(supabase)` (one extra read for `metabolismMode`) and `getProjectThreadIdeaTraceLabels` (read for labels). Otherwise from state. | **PARTIALLY VERIFIED** | Two extra reads (runtime config + label lookup) occur during trace stage, not mentioned in canon |
| `deliberation_trace` table: `deliberation_trace_session_idx` on `(session_id, created_at DESC)` | `01_foundation/data_model.md §6` | Migration `20260311000002_deliberation_trace.sql`: `CREATE INDEX deliberation_trace_session_idx ON deliberation_trace(session_id, created_at DESC)` | **VERIFIED IN CODE** | |
| Artifact approval FSM: `ARTIFACT_APPROVAL_TRANSITIONS` enforced by `isLegalArtifactApprovalTransition` in `POST /api/artifacts/[id]/approve` | `03_governance/state_machines.md §2` | `governance-rules.ts` + `apps/studio/app/api/artifacts/[id]/approve/route.ts` | **VERIFIED IN CODE** | Full FSM confirmed; idempotent (`fromState === toState`) allowed |
| Artifact null/undefined current_approval_state: first write is always allowed | `03_governance/state_machines.md §2` | `isLegalArtifactApprovalTransition`: `if (!fromState) return true` | **VERIFIED IN CODE** | |
| Proposal FSM: `PROPOSAL_STATE_TRANSITIONS` enforced in both `PATCH /api/proposals/[id]` and `POST /api/proposals/[id]/approve` | `03_governance/state_machines.md §3` | `governance-rules.ts` `PROPOSAL_STATE_TRANSITIONS`; both routes call `isLegalProposalStateTransition` / `isValidProposalTransition` | **VERIFIED IN CODE** | See §5 for `apply_name`/`approve_avatar` FSM gap |
| `PATCH /api/proposals/[id]` body: `{ proposal_state }` only; no identity/habitat side effects | `03_governance/state_machines.md §3` | Route fetches proposal, checks FSM, updates `proposal_record.proposal_state` only | **VERIFIED IN CODE** | Does NOT write change_record — see §5 |
| `POST /api/proposals/[id]/approve` performs side effects then updates proposal_state | `03_governance/state_machines.md §3` | Route code: FSM check → side effects → `supabase.from("proposal_record").update({proposal_state})` | **VERIFIED IN CODE** | FSM check is FIRST (before side effects) |
| Habitat clear audit trail: always writes `change_record` (habitat_update, manual_habitat_clear) | `03_governance/audit_and_change_records.md §1`, `04_surfaces/public_habitat_and_avatar.md §5` | `POST /api/habitat-content/clear`: `await writeChangeRecord({... change_type: "habitat_update", reason: "manual_habitat_clear" })` — unconditional | **VERIFIED IN CODE** | |
| `change_record` written only by API routes (proposal approve, identity PATCH, habitat clear); not by session runner | `03_governance/audit_and_change_records.md §1` | No `writeChangeRecord` calls in `session-runner.ts`; calls exist only in `proposals/[id]/approve/route.ts`, `identity/route.ts`, `habitat-content/clear/route.ts` | **VERIFIED IN CODE** | |
| Avatar: set only through proposal approve route for `avatar_candidate` (or identity PATCH) | `04_surfaces/public_habitat_and_avatar.md §1, §4` | `POST /api/proposals/[id]/approve` (action `approve_for_publication` on `avatar_candidate`); `PATCH /api/identity` (for `active_avatar_artifact_id`) | **VERIFIED IN CODE** | Identity PATCH path is implementation-defined per canon; confirmed to write change_record |
| Avatar image must be approved or approved_for_publication before setting | `04_surfaces/public_habitat_and_avatar.md §1` | `POST /api/proposals/[id]/approve`: checks `art.current_approval_state !== "approved" && art.current_approval_state !== "approved_for_publication"` → 400; `PATCH /api/identity` checks same | **VERIFIED IN CODE** | |
| Habitat content: written only by proposal approve (habitat type) or habitat-content/clear | `04_surfaces/public_habitat_and_avatar.md §2` | Only two write paths: `POST /api/proposals/[id]/approve` with habitat target_type (upsert) and `POST /api/habitat-content/clear` (update to null) | **VERIFIED IN CODE** | |
| Session runner does NOT write `public_habitat_content`, `identity`, or `active_avatar_artifact_id` | `04_surfaces/public_habitat_and_avatar.md §3` | No such writes in `session-runner.ts` | **VERIFIED IN CODE** | |
| `runtime_config` table: keys `mode`, `always_on`, `last_run_at`, `tokens_used_today`, `tokens_reset_at` | `02_runtime/creative_metabolism.md §1` | `runtime-config.ts` → `getRuntimeConfig` reads those exact keys; migration `20250310000002_runtime_config.sql` creates the table | **VERIFIED IN CODE** | |
| RuntimeMode intervals: slow=30min, default=1hr, steady=5min, turbo=45s | `02_runtime/creative_metabolism.md §1` | `runtime-config.ts` → `getIntervalMs`: slow=`30*60*1000`, default=`60*60*1000`, steady=`5*60*1000`, turbo=`45*1000` | **VERIFIED IN CODE** | |
| `metabolismMode` in session = runtime scheduler mode read at `writeTraceAndDeliberation` stage | `02_runtime/creative_metabolism.md §2` | `writeTraceAndDeliberation` calls `getRuntimeConfig(supabase)` → `metabolismMode = runtimeConfig.mode` | **VERIFIED IN CODE** | |
| Stop limits: max artifacts/session, max tokens/session, pending avatar proposals cap, pending habitat layout proposals cap, archive decay half-life | `02_runtime/creative_metabolism.md §5` | `stop-limits.ts` exports all five; all used in `session-runner.ts` | **VERIFIED IN CODE** | All caps are env-overridable |
| `proposal_role` column in `proposal_record` exists | `01_foundation/data_model.md §4`, `02_runtime/session_orchestrator.md §3` | Migration `20250311000001_missing_columns.sql`: `ALTER TABLE proposal_record ADD COLUMN IF NOT EXISTS proposal_role TEXT` | **VERIFIED IN CODE** | Added by migration (was missing from initial schema) |
| `creative_session.decision_summary` (JSONB) column exists | `01_foundation/data_model.md §1`, `02_runtime/session_orchestrator.md §3` | Migration `20250311000001_missing_columns.sql`: `ALTER TABLE creative_session ADD COLUMN IF NOT EXISTS decision_summary JSONB` | **VERIFIED IN CODE** | Added by migration |
| `creative_session.trace` (JSONB) column exists | `01_foundation/data_model.md §1` | Migration `20250310000005_creative_session_trace.sql`: `ALTER TABLE creative_session ADD COLUMN IF NOT EXISTS trace JSONB NULL` | **VERIFIED IN CODE** | |
| `identity.active_avatar_artifact_id` column exists | `01_foundation/data_model.md §1`, `04_surfaces/public_habitat_and_avatar.md §1` | Migration `20250310000003_identity_active_avatar.sql`: `ALTER TABLE identity ADD COLUMN IF NOT EXISTS active_avatar_artifact_id UUID` | **VERIFIED IN CODE** | **Missing from `packages/core/src/types.ts` `Identity` interface — §5** |
| Shared type alignment: `Artifact.artifact_role`, `Artifact.target_surface` are optional | `01_foundation/data_model.md §9` | `packages/core/src/types.ts`: both declared as `artifact_role?: string \| null` and `target_surface?: string \| null` | **VERIFIED IN CODE** | |
| Shared type alignment: `ProposalRecord.artifact_id`, `target_surface`, `proposal_role`, `habitat_payload_json` are optional | `01_foundation/data_model.md §9` | `packages/core/src/types.ts`: `artifact_id?: string \| null`, `target_surface?: string \| null`, `proposal_role?: string \| null`, `habitat_payload_json?: Record<string, unknown> \| null` | **VERIFIED IN CODE** | |
| `Identity` shared type includes `active_avatar_artifact_id`, `name_status`, `naming_readiness_score`, etc. | `01_foundation/data_model.md §1, §9` | `packages/core/src/types.ts` `Identity` interface does NOT include these fields | **CONTRADICTED BY CODE** | See §5 |
| `publication_record` written only by publish route | `03_governance/audit_and_change_records.md §3` | `POST /api/artifacts/[id]/publish` inserts `publication_record`; no other write sites found | **VERIFIED IN CODE** | |
| `approval_record` written only by artifact approve route | `03_governance/audit_and_change_records.md §2` | `POST /api/artifacts/[id]/approve` inserts `approval_record`; session runner does NOT | **VERIFIED IN CODE** | |
| Habitat clear slug constraint: `{home, works, about, installation}` | `04_surfaces/public_habitat_and_avatar.md §5` | `const ALLOWED_SLUGS = ["home", "works", "about", "installation"]` in clear route | **VERIFIED IN CODE** | |
| Proposal approve FSM check happens BEFORE side effects | `03_governance/state_machines.md §3` | `POST /api/proposals/[id]/approve`: FSM guard returns 400 before any identity/habitat/change_record writes | **VERIFIED IN CODE** | |
| Staging gate for artifact publish: `passesStagingGate` | `03_governance/state_machines.md §1` (implied); `04_surfaces` (implied) | `POST /api/artifacts/[id]/publish` calls `passesStagingGate(linkedProposals, artifact)` from `publish-gate.ts`; gate only applies to proposal-intent artifacts | **VERIFIED IN CODE** | Not explicitly described in canon_v2 docs; implementation-defined |
| `change_record.approved` is always `true` when written | `03_governance/audit_and_change_records.md §1` | `writeChangeRecord` hardcodes `approved: true` in every call | **VERIFIED IN CODE** | |

---

## 5. Contradictions and Ambiguities

### 5.1 `apply_name` and `approve_avatar` actions are blocked by proposal FSM (BUG)

**Canon claim**: `POST /api/proposals/[id]/approve` with `action = "apply_name"` sets identity name from proposal; `action = "approve_avatar"` updates embodiment direction.  
**Code reality**: Both actions map `newState = "approved"` (the default). The FSM guard runs before side effects:

```typescript
let newState = "approved" as string;
// ... (no reassignment for apply_name or approve_avatar)
if (!isLegalProposalStateTransition(proposal.proposal_state, newState)) {
  return NextResponse.json({ error: ... }, { status: 400 });
}
```

`PROPOSAL_STATE_TRANSITIONS` has no entry that leads to `"approved"` as a target state — it appears only as a *from* state (legacy). `isLegalProposalStateTransition` has no idempotent bypass (unlike `isLegalArtifactApprovalTransition`). Therefore:

- Any proposal in `pending_review` (all agent-created proposals start here): `isLegalProposalStateTransition("pending_review", "approved")` → checks `["needs_revision", "approved_for_staging", "archived", "rejected", "ignored"].includes("approved")` → **false** → HTTP 400.
- Any proposal already in `"approved"`: `isLegalProposalStateTransition("approved", "approved")` → checks `["approved_for_staging", "approved_for_publication", "archived", "rejected"].includes("approved")` → **false** → HTTP 400.

**Result**: `apply_name` and `approve_avatar` are currently broken for all proposals in typical states. These actions cannot be executed through the API as written. This must be resolved before these canon claims can be truthfully canonized.

**Fix options** (policy decision needed): (a) Add an idempotent bypass in `isLegalProposalStateTransition`, (b) Add `pending_review → approved` as a valid transition in the FSM map, or (c) Remap `apply_name`/`approve_avatar` to target a different state (e.g. `approved_for_staging`).

---

### 5.2 `manageProposals` bypasses FSM when archiving older proposals

**Canon claim**: Session runner creates proposal rows only; does not transition state.  
**Code reality**: When there are multiple active habitat_layout proposals, `manageProposals` directly sets `proposal_state = "archived"` on older ones via a Supabase update:

```typescript
await supabase.from("proposal_record").update({ proposal_state: "archived", ... })
  .in("proposal_record_id", older.map((o) => o.proposal_record_id));
```

This is an autonomous state mutation that:
1. Bypasses `isLegalProposalStateTransition` (no guard is called).
2. Bypasses `change_record` (no audit trail for these archivings).
3. Contradicts the canon claim that "session runner does not transition or apply proposals."

This is a governance gap: the session runner CAN autonomously archive proposals. It needs to be either (a) documented as an allowed autonomous action or (b) removed and replaced with a human-gated flow.

---

### 5.3 `packages/core/src/types.ts` `Identity` type is missing 5 DB columns

**Canon claim** (`data_model.md §1`, §9): `active_avatar_artifact_id`, `name_status`, `name_rationale`, `naming_readiness_score`, `naming_readiness_notes` are key fields of `identity`.  
**Code reality**: These columns exist in the DB (added by migrations `20250310000003_identity_active_avatar.sql` and `20250110000003_identity_naming_fields.sql`) and are actively used in API routes (`GET /api/identity` selects them; `PATCH /api/identity` updates them; `POST /api/proposals/[id]/approve` reads `name_status`). However, `packages/core/src/types.ts` `Identity` interface does not declare them.

Any consumer of the `Identity` type will not know these fields exist. This breaks shared type alignment claimed by canon_v2.

---

### 5.4 `approve_for_publication` vs `approve_publication` — two action strings for same path

**Code reality**: `POST /api/proposals/[id]/approve` applies habitat content or avatar logic on `action === "approve_for_publication" || action === "approve_publication"`. Only `"approve_for_publication"` is documented in the canon or route comment. `"approve_publication"` is an undocumented synonym. This is a silent API inconsistency.

---

### 5.5 `executionMode` and `humanGateReason` are declared but never behaviorally wired

**Canon claim** (`02_runtime/session_orchestrator.md §5`): "ExecutionMode: `auto` | `proposal_only` | `human_required`. Currently the runner initializes to `auto` and does not set `proposal_only` or `human_required` in code; classification is reserved for future use."  
**Status**: VERIFIED as accurate, but this means the deliberation trace always records `execution_mode: "auto"` and `human_gate_reason: null`. The canon correctly calls this out as future/reserved. No decision canon section can describe what triggers `proposal_only` or `human_required` until this is wired.

---

### 5.6 `PATCH /api/proposals/[id]` — `"approved"` state not in `ALLOWED_PROPOSAL_STATES`

The route restricts target states to:
```typescript
const ALLOWED_PROPOSAL_STATES = [
  "archived", "rejected", "ignored", "needs_revision",
  "staged", "approved_for_staging", "approved_for_publication", "published",
];
```

The state `"approved"` is not in this list. This means PATCH cannot be used to set a proposal to `"approved"` — it must go through the `/approve` route. But the `/approve` route is broken for that transition (§5.1). The `"approved"` state in the FSM is effectively unreachable via any current API endpoint for a proposal starting in `"pending_review"`.

---

### 5.7 `PATCH /api/proposals/[id]` does not write `change_record`

The PATCH route updates `proposal_state` without writing a `change_record`. The approve route does write `change_record` for certain side-effect actions. This asymmetry is not documented in the canon. A state transition to `approved_for_staging` via PATCH leaves no change_record audit trail, while the same transition via the approve route with `action = "approve_for_staging"` also does not write a change_record (the approve route only writes change_record for: `apply_name`, `approve_avatar`, `approve_for_publication` on habitat/avatar, and `lane_type = "system"`). Habitat and avatar transitions are audited; staging transitions are not.

---

### 5.8 `persistDerivedState` write order differs slightly from canon description

**Canon claim**: "creative_state_snapshot → memory_record → archive_entry (if archive_candidate)"  
**Code reality** (verified in function body): archive_entry (if archive_candidate) → creative_state_snapshot → memory_record → recurrence writeback.  
The archive_entry is actually created *before* the creative_state_snapshot, not after. The memory_record is *last*, not second. Recurrence writeback is not mentioned in the per-stage table.

---

## 6. What Must Be Decided Before Writing `agent_decision_canon.md`

### 6a. Code Gaps (must be fixed for accurate canonization)

| Gap | Impact | Location |
|---|---|---|
| `apply_name` / `approve_avatar` FSM gap — both actions are broken (§5.1) | Identity name and embodiment direction cannot be updated via the approve route | `apps/studio/app/api/proposals/[id]/approve/route.ts` |
| `manageProposals` autonomous proposal archiving bypasses FSM (§5.2) | Canon cannot truthfully claim agent does not mutate proposal state | `apps/studio/lib/session-runner.ts` → `manageProposals` |
| `packages/core/src/types.ts` `Identity` type drift (§5.3) | Shared type alignment claim is false | `packages/core/src/types.ts` |
| `approve_publication` undocumented synonym (§5.4) | Undocumented API surface; potential confusion | `apps/studio/app/api/proposals/[id]/approve/route.ts` |
| `persistDerivedState` write order mismatch vs canon (§5.8) | Canon description is inaccurate | `01_foundation/data_model.md §2` and `session_orchestrator.md §3` table |

### 6b. Policy Decisions (must be resolved before canonization)

| Decision | Options | Implication |
|---|---|---|
| What should `apply_name` and `approve_avatar` target states be? | (a) Add `pending_review → approved`; (b) Use `approved_for_staging`; (c) Skip FSM for name/avatar actions | Determines whether these actions are FSM-governed or side-effect-only |
| Should the session runner be allowed to autonomously archive older proposals? | (a) Document as allowed autonomous action; (b) Remove, require human to archive stale proposals; (c) Keep but add FSM guard call | Affects the "proposal-only" vs "agent autonomous" boundary |
| Should `executionMode` be wired? If so, what triggers `proposal_only` vs `human_required`? | Policy decision on operator boundaries | Cannot write decision canon section on execution classification until answered |
| Should PATCH transitions to governed surfaces write `change_record`? | Currently only approve-route applications do | Affects audit coverage claim |
| Is `approve_publication` a supported alias or a bug? | Document or remove | Clean API surface |

### 6c. Documentation Cleanup

| Issue | Location |
|---|---|
| `persistDerivedState` write order corrected to: archive_entry → creative_state_snapshot → memory_record → recurrence writeback | `02_runtime/session_orchestrator.md §3` and `01_foundation/data_model.md §2` |
| Add `active_avatar_artifact_id`, `name_status`, `name_rationale`, `naming_readiness_score`, `naming_readiness_notes` to `Identity` fields in data_model §1 (already present) — update §9 to note type drift | `01_foundation/data_model.md §9` |
| Note that trace stage reads `getRuntimeConfig` and `getProjectThreadIdeaTraceLabels` (not "only from state") | `01_foundation/data_model.md §6` |
| Note that PATCH does not write `change_record`; audit coverage scope clarified | `03_governance/audit_and_change_records.md §1` or new section |

---

## 7. Narrowest Truthful Scope We Could Canonize Today

The following sections can be written from verified code evidence with no ambiguity:

### Safe to canonize now

1. **Runtime decision inventory**: Session mode, drive, focus selection (archive return + project/thread), medium derivation, artifact role inference, proposal eligibility and cap enforcement, archive entry creation, recurrence writeback, memory record creation, creative state update, daily token tracking — all verified.

2. **Proposal creation boundary** (narrowed): Agent creates `proposal_record` rows with state `pending_review` for `habitat_layout` (concept artifacts passing eligibility + cap) and `avatar_candidate` (image artifacts, no duplicate, cap). Agent does NOT call the approve route, does NOT transition proposal states through the governance API.  
*Caveat*: Agent DOES archive older habitat_layout proposals directly. This must be documented as an autonomous action or removed.

3. **Human-gated boundaries** (all verified): Artifact approval state changes, artifact publication, proposal state transitions via PATCH, proposal approval + application (name, avatar, habitat), identity field updates, public habitat content writes, habitat clear.

4. **Artifact approval FSM** (`isLegalArtifactApprovalTransition`): Full transition table verified. Terminal states (rejected, archived) are final. First write is unrestricted.

5. **Proposal FSM** (`isLegalProposalStateTransition`): Full transition table verified. `pending_review` cannot reach `approved`. Terminal states final. PATCH and approve routes both enforce.

6. **Deliberation trace schema and contents**: Full schema verified; fields and JSON key semantics verified.

7. **Stop limits**: All five caps verified (artifacts/session, tokens/session, pending habitat proposals, pending avatar proposals, archive decay half-life). All env-overridable.

8. **Metabolism / scheduler gating**: Runtime mode intervals verified; cron guards (last_run_at, sessions per hour) verified.

9. **Audit trail coverage**: `change_record` writers verified (proposal approve + identity PATCH + habitat clear). Approve route FSM check runs before side effects — no partial state mutations.

10. **Prohibited autonomous actions** (verified): Agent does not write `public_habitat_content`, `identity` (name, avatar, directions), `approval_record`, `publication_record`, or call approve/PATCH routes.

### NOT safe to canonize yet (insufficient or broken evidence)

- `executionMode` / `humanGateReason` behavioral semantics — always null/auto in code.
- `apply_name` / `approve_avatar` as working approved paths — broken (§5.1).
- The `"approved"` proposal state as a reachable governance state — unreachable.
- Precise claim that agent never mutates proposal state — contradicted by §5.2.
- Identity type alignment in shared packages — contradicted by §5.3.

---

## 8. Recommendation

**Fix these items first (in order of severity):**

1. **Fix `apply_name` / `approve_avatar` FSM gap** — decide whether these actions should use a new state or bypass the FSM, implement, add test coverage. This is a broken governance action currently returning HTTP 400 for all normal proposals.

2. **Resolve `manageProposals` autonomous archiving** — either document it explicitly in the decision canon as an allowed autonomous action (with justification), or move it behind the governance API, or add an FSM guard call to ensure it matches the declared boundary.

3. **Fix `Identity` type drift in `packages/core/src/types.ts`** — add the five missing fields. This is a type-safety issue that contradicts a shared type alignment claim.

4. **Correct `persistDerivedState` write order in docs** — update `session_orchestrator.md` stage table and `data_model.md §2` to match actual code order.

5. **Document or remove `approve_publication` synonym** — clean up the undocumented API alias.

**After the above are resolved:**

- Wire `executionMode` to at least one non-`auto` value (e.g. set `"proposal_only"` when the session creates a proposal; set `"human_required"` when a human gate is hit) — or explicitly declare in the decision canon that `executionMode` is always `"auto"` in V1.
- Write the `agent_decision_canon.md` using the structure in §7 above as the starting skeleton.

**Then rerun this QA audit** to confirm fixes before publishing the canon.

---

## Appendix: Key File References

| Concern | File |
|---|---|
| Session orchestrator (all stages) | `apps/studio/lib/session-runner.ts` |
| Governance FSMs (artifact + proposal) | `apps/studio/lib/governance-rules.ts` |
| Proposal FSM wrapper | `apps/studio/lib/proposal-transitions.ts` |
| Change record writer | `apps/studio/lib/change-record.ts` |
| Stop limits + caps | `apps/studio/lib/stop-limits.ts` |
| Deliberation trace writer | `apps/studio/lib/deliberation-trace.ts` |
| Runtime config (mode, intervals, tokens) | `apps/studio/lib/runtime-config.ts` |
| Proposal eligibility (concept threshold) | `apps/studio/lib/proposal-eligibility.ts` |
| Staging gate for publish | `apps/studio/lib/publish-gate.ts` |
| Artifact approve route | `apps/studio/app/api/artifacts/[id]/approve/route.ts` |
| Artifact publish route | `apps/studio/app/api/artifacts/[id]/publish/route.ts` |
| Proposal PATCH route | `apps/studio/app/api/proposals/[id]/route.ts` |
| Proposal approve route | `apps/studio/app/api/proposals/[id]/approve/route.ts` |
| Habitat clear route | `apps/studio/app/api/habitat-content/clear/route.ts` |
| Identity PATCH/GET route | `apps/studio/app/api/identity/route.ts` |
| Shared types | `packages/core/src/types.ts` |
| Core tables migration | `supabase/migrations/20250108000001_twin_core_tables.sql` |
| Missing columns migration | `supabase/migrations/20250311000001_missing_columns.sql` |
| Deliberation trace migration | `supabase/migrations/20260311000002_deliberation_trace.sql` |
| Runtime config migration | `supabase/migrations/20250310000002_runtime_config.sql` |
| Active avatar column | `supabase/migrations/20250310000003_identity_active_avatar.sql` |
| Identity naming fields | `supabase/migrations/20250110000003_identity_naming_fields.sql` |

### Tests present

| Test | Coverage |
|---|---|
| `lib/__tests__/governance-rules.test.ts` | `isLegalProposalStateTransition` — comprehensive happy paths + illegal jumps + terminal states + unknown states |
| `lib/__tests__/proposal-transitions.test.ts` | `isValidProposalTransition` wrapper — same coverage |
| `lib/__tests__/artifact-approval-transitions.test.ts` | Artifact approval FSM transitions |
| `lib/__tests__/stop-limits.test.ts` | Stop limit functions |
| `lib/__tests__/archive-entry.test.ts` | Archive entry creation |
| `lib/__tests__/creative-state.test.ts` | Creative state update |
| `lib/__tests__/change-record.test.ts` | Change record writer |
| `lib/__tests__/signals.test.ts` | Evaluation signals |
| `lib/__tests__/publish-gate.test.ts` | Staging gate logic |
| `lib/__tests__/curation-backlog.test.ts` | Curation backlog computation |
| `lib/__tests__/project-thread-selection.test.ts` | Project/thread selection |

**No tests** for the session runner stages end-to-end, proposal approve route side effects, identity PATCH route, or habitat clear route.
