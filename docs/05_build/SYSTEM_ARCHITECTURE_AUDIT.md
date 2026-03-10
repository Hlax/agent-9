# SYSTEM ARCHITECTURE AUDIT REPORT

Canon references: constitution, glossary, ontology, data_model, system_architecture, creative_state_model, session_loop, evaluation_signals, approval_state_machine, approval_rules, change_record_system, versioning_policy, intervention_rules.

Audit date: 2026-03 (codebase state at time of audit).

**Post-audit fixes (2026-03):** (1) `change_record` is written on approved system/canon (identity, avatar, habitat, system) in the approve route. (2) Project/thread selection is used in session run. (3) Stop limits, repetition detection, and token accounting are implemented. (4) Public and staging are wired to real data: public-site fetches `/api/public/artifacts`, habitat-staging fetches `/api/staging/proposals`. (5) Scheduler and runtime modes: `runtime_config` table, GET/PATCH `/api/runtime/config`, GET `/api/cron/session` (x-cron-secret), session run accepts cron auth; Studio Runtime panel for mode (slow/default/steady/turbo) and always-on.

---

## 1) Concept → Proposal Pipeline

**Status: PARTIAL**

**Implemented:**
- **proposal_record** table exists; used for surface and system lanes (`lane_type`: surface | system; `target_type`: concept, identity_name, avatar_candidate, public_habitat_proposal, habitat, etc.).
- Concept artifacts **can** become proposals: eligibility check (alignment ≥ 0.60, fertility ≥ 0.70, pull ≥ 0.60, critique_outcome in continue/branch/shift_medium) runs after session; when eligible, a `proposal_record` is created with `target_type: "concept"`, `artifact_id`/`target_id`, `proposal_state: "pending_review"`.
- Harvey override: "Turn into proposal" from Concepts page (POST `/api/artifacts/[id]/create-proposal`).
- Approval is required: Harvey reviews in Studio (Surface/Habitat proposals); `approve_for_staging` and `approve_for_publication` actions exist; no auto-activation.
- Staging before deployment: flow is `pending_review` → `approved_for_staging` → (build) → `staged` → `approved_for_publication` → `published`. Migration adds `target_surface` (studio | staging_habitat | public_habitat) and `proposal_type`.

**Issues:**
- Proposal types are not named **surface_proposal** / **system_proposal** / **canon_proposal** as in the audit spec; they are expressed via **lane_type** (surface | system) + **target_type** (concept, identity_name, …). Canon data_model uses `lane_type` and `target_type`; no separate "canon_proposal" type.
- **Canon proposals** (governance documents, runtime behavior, evaluation interpretation, identity structure) are not explicitly distinguished: system lane exists but there is no dedicated target_type or flow for "canon" (e.g. constitution/rule changes). Change_record_system expects meaningful system changes to be recorded in `change_record`; that table is not written when proposals are approved.

**Missing pieces:**
- Explicit **canon_proposal** target type or lane for governance-doc / runtime-behavior changes, and wiring so approved canon changes write to **change_record**.
- Clear mapping from audit’s "surface_proposal / system_proposal / canon_proposal" to current `lane_type` + `target_type` in docs and UI.

**Recommended fix:**
- Document that surface = `lane_type=surface`, system = `lane_type=system`, and (if desired) canon = system + specific `target_type` (e.g. governance_document, runtime_behavior), and that approved system/canon changes should insert into `change_record`.
- Add writes to `change_record` when Harvey approves system/canon proposals (e.g. in approve route or a dedicated canon-approval path).

---

## 2) Surface Deployment

**Status: PARTIAL**

**Implemented:**
- Artifact pipeline order is correct: **Generate** → **Self Critique** → **Evaluation Signals** → **Stored as draft** (`lifecycle_status: draft`, `current_approval_state: pending_review`) → **Approval queue** (Studio artifact review) → **Harvey review** → **Approval state update** (PATCH `/api/artifacts/[id]/approve`) → **Optional publication** (POST `/api/artifacts/[id]/publish` only when `current_approval_state === approved_for_publication`).
- **Studio** is the only environment where artifact and proposal review occurs (review/artifacts, review/surface, review/system).
- **Publish** is gated: publish route checks `approved_for_publication` and sets `current_publication_state: published`; governance-rules enforce approval ≠ publication.

**Issues:**
- **Staging habitat** (`apps/habitat-staging`): uses **mock** proposal/artifact data; it does **not** query the database for approved staging artifacts or proposals. So "staging only shows approved staging artifacts" is not enforced in code.
- **Public habitat** (`apps/public-site`): comment states "Only approved_for_publication + published artifacts should appear once wired," but the app does **not** query artifacts or publication state; it is a static shell. So "public only shows approved_for_publication artifacts" is not yet implemented.

**Recommended fix:**
- Staging: add API or server data load that reads from `proposal_record` (and optionally artifacts) filtered by `proposal_state` (e.g. approved_for_staging, staged) and/or artifact approval state, and render that in staging UI instead of (or in addition to) mocks.
- Public: add data load that selects artifacts where `current_approval_state = 'approved_for_publication'` and `current_publication_state = 'published'`, and render them on the public site.

---

## 3) Creative Ecology Runtime

**Status: PARTIAL**

**Implemented:**
- **Sources / memory** loaded for session: `getBrainContext` (identity, creative state, memory, source items); `getLatestCreativeState`; working context string passed into `runSessionPipeline`.
- **Assess creative state:** `getLatestCreativeState(supabase)` returns previous state; state comes from `creative_state_snapshot`.
- **Compute creative drives:** `computeDriveWeights(previousState)` (packages/evaluation); uses identity_stability, creative_tension, curiosity_level, unfinished_projects, reflection_need, etc.
- **Select session mode:** `computeSessionMode(previousState)` returns one of continue | return | explore | reflect | rest.
- **Select drive:** `selectDrive(driveWeights)` picks one creative drive.
- **Choose medium:** via `preferMedium` (writing | concept | image) from session start request; pipeline generates one artifact.
- **Generate → Critique → Evaluation → Update state:** session run route runs pipeline, then runCritique, computeEvaluationSignals, updateCreativeState, stateToSnapshotRow, persists snapshot and memory.

**Issues:**
- **Select project / thread / idea:** not implemented. Session context passes `projectId: undefined`; there is no logic that loads projects or idea threads and chooses one. Pipeline and data model support `project_id` and thread/idea, but the session run route never sets them. So "Select Project / Thread / Idea" in the canon loop is missing in code.
- **Check stop conditions:** no explicit "check stop conditions" step in the session run; the loop runs once per manual trigger (one artifact per session). No in-session loop that checks stop limits before continuing.

**Recommended fix:**
- Add project/thread/idea selection (query active projects and idea threads, apply drive/state to choose one, pass `projectId` and optionally thread/idea into session context) or document that V1 is project-agnostic and selection is deferred.
- When adding multi-artifact or scheduled sessions, add an explicit "check stop conditions" step (see §6).

---

## 4) Creative Metabolism

**Status: FAIL**

**Implemented:**
- **Design only:** `creative_metabolism.md` describes creative_drive, creative_fatigue, curiosity_pressure, reflection_pressure, unresolved_pull, obsession_pressure, and their influence on session frequency and mode.
- **Creative state** has fields that could feed metabolism (e.g. `reflection_need`, `creative_tension`, `recent_exploration_rate`), and they are used for **drive weights** and **session mode** in the single-session path. There is no separate "metabolism" layer that decays or replenishes energy or throttles session frequency.

**Issues:**
- No **creative_drive**, **energy_decay**, **reflection_need** (as metabolism signals that influence *when* to run a session), or **exploration_pressure** implemented as runtime variables that affect scheduling or mode.
- No scheduler or always-on loop; sessions are only manual. So metabolism does not "influence session frequency, mode selection, reflection pressure, rest periods" in code.

**Recommended fix:**
- Implement metabolism as in `creative_metabolism.md`: derive creative_drive, fatigue, and pressures from state/history; expose them where a future scheduler can read them.
- When implementing the scheduler (§5), feed metabolism into "run or skip" and "which mode" decisions.

---

## 5) Always-On Session Modes

**Status: FAIL**

**Implemented:**
- **Design only:** `creative_metabolism.md` defines Default, Slow, Steady, Turbo and their intended generation rates and guardrails.
- **Manual session** works: one session per POST to `/api/session/run`, one artifact per session.

**Issues:**
- No **slow_mode**, **default_mode**, **steady_mode**, **turbo_mode** in code; no runtime mode selector or storage.
- No **generation scheduling**: no cron, no background loop, no "session frequency" throttle.
- No **compute guardrails** that force mode changes (e.g. downgrade to slow when token budget low).

**Recommended fix:**
- Implement scheduler as described in `creative_metabolism.md` and `session_loop.md`: loop that evaluates mode, metabolism, and limits, then triggers session run when threshold met.
- Add config or DB for runtime mode and throttle (e.g. max sessions per hour by mode); enforce in scheduler.

---

## 6) Stop Limits and Token Guardrails

**Status: FAIL**

**Implemented:**
- **system_architecture.md** §15 specifies: maximum artifacts per session, maximum tokens per session, stop-limit logic, archive triggers, mandatory reflection phases.
- **session_loop.md** references "stop_limit_triggered()" in a pseudo-loop.
- **creative_metabolism.md** lists guardrails (max_artifacts_per_session, max_tokens_per_session/hour, repetition detection, critique loop detection, etc.).
- **Chat** uses `max_tokens: 500` for completions; **generate-writing** and **generate-image** use model-specific token limits for the LLM call only. No session-level or hourly token cap.

**Issues:**
- **max artifacts per session:** not enforced; pipeline produces exactly one artifact per run; no loop that could exceed a cap.
- **max tokens per session:** not implemented; no counting or capping of tokens across the session.
- **Repetition detection:** not implemented in session run.
- **Critique loop detection:** not implemented.
- **Token exhaustion fallback:** no low-token threshold or automatic downgrade to slow/pause.
- No "Check stop conditions → continue vs reflect/end" branch in the session path.

**Recommended fix:**
- Add config (env or DB): e.g. `MAX_ARTIFACTS_PER_SESSION`, `MAX_TOKENS_PER_SESSION`, `LOW_TOKEN_THRESHOLD`.
- In session run (and in any future multi-artifact or scheduler loop): before or after each artifact, check artifact count and token usage; if over limit, skip further generation and optionally force reflect/rest or end session.
- Add repetition/critique-loop detection (e.g. last N critiques same outcome, or low novelty streak) and feed into "reflect/end" decision or into metabolism.

---

## 7) Judgment Pipeline

**Status: PASS**

**Implemented:**
- Order is correct: **Generation** (runSessionPipeline) → **Self Critique** (runCritique) → **Evaluation Signals** (computeEvaluationSignals) → **Stored as draft** with `current_approval_state: pending_review` → **Harvey review** (Studio) → **Approval state update** (PATCH approve) → **Archive / Continue / Publish** (approve route and publish route).
- **Critique does not determine approval:** critique outcome is stored and used for evaluation derivation; approval state is set only by Harvey via `/api/artifacts/[id]/approve`.
- **Evaluation signals do not auto-approve:** scores are written to artifact and evaluation_signal; they do not change `current_approval_state`.
- **Harvey review controls approval state:** only the approve and publish API routes update approval/publication state; both require auth.

**Issues:** None for this section.

---

## 8) Governance Controls

**Status: PARTIAL**

**Implemented:**
- **Twin may propose; Harvey must approve:** Name, avatar, habitat, and concept proposals are stored in `proposal_record`; approval actions (apply_name, approve_avatar, approve_for_publication, approve_for_staging) require authenticated user and update state only when Harvey (or authenticated user) calls the approve API.
- **No self-activation of system changes:** Proposals do not change governance or identity until an approve endpoint is called; apply_name and approve_avatar explicitly update identity after approval.
- **change_record** table exists in schema (change_type, initiated_by, target_type, target_id, title, description, reason, approved, approved_by, effective_at).

**Issues:**
- **change_record is never written:** No code inserts into `change_record` when Harvey approves system or canon changes (or any change). Change_record_system canon says approved changes should be recorded; that is not implemented.
- **Approval gates** for artifact and proposal flows are in place; **activation logic** for system/canon (e.g. "when proposal approved, apply change and record it") is partial: name and avatar apply immediately, but there is no generic "system change application" that writes change_record.

**Recommended fix:**
- When Harvey approves any system or canon-affecting proposal (e.g. system lane or future canon_proposal type), insert a row into `change_record` (change_type, initiated_by, target_type, target_id, title, description, approved=true, approved_by, effective_at).
- Optionally add a small "governance log" in Studio that reads from `change_record` for transparency.

---

# FINAL SUMMARY

**Architecture readiness score (0–10): 5**

- Judgment pipeline and artifact approval/publication flow are correct and aligned with canon.
- Concept → proposal pipeline and creative ecology (state, drives, mode, one-shot session) are partially implemented; proposal and surface semantics are slightly different from the audit’s naming, and project/thread/idea selection is missing.
- Surface deployment is partially implemented: Studio and approval/publish are correct; staging and public habitats are not wired to real data.
- Creative metabolism, always-on session modes, stop limits/token guardrails, and change_record usage are not implemented; they exist only in design or schema.

---

**Top 5 highest-risk architectural gaps**

1. **No stop limits or token guardrails in session run** — Runaway or over-budget sessions are not prevented; canon’s "maximum artifacts per session" and "maximum tokens per session" are not enforced.
2. **No always-on scheduler or session modes** — Only manual sessions exist; no slow/default/steady/turbo modes, no throttling, no metabolism-driven scheduling. The system cannot run "continuously" as described in session_loop and creative_metabolism.
3. **Staging and public habitats not wired to data** — Staging uses mocks; public site does not show published artifacts. Surface deployment flow is incomplete and could lead to wrong assumptions about what appears where.
4. **change_record never written** — Governance and change_record_system require recording approved system/canon changes; no code path writes to change_record, so evolution is not auditable as specified.
5. **No project/thread/idea selection** — Session context always has projectId undefined; the canonical loop’s "Select Project / Thread / Idea" step is missing, so the runtime cannot direct work at specific threads or projects.
