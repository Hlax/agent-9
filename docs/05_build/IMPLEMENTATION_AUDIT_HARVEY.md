# Implementation-Level Audit: Can This Twin Publish a Public Habitat with Avatar and Approved Work in 100 Cycles?

**Auditor:** Self-audit (implementation vs canon).  
**Canon read order used:** constitution → glossary → ontology_notes → data_model → system_architecture → creative_state_model → session_loop → evaluation_signals → (runtime: creative_metabolism, session_loop, approval_state_machine, change_record_system).

**Doc mapping (audit read order):**
- constitution → `docs/01_foundation/constitution.md`
- glossary → `docs/01_foundation/glossary.md`
- ontology → `docs/01_foundation/ontology_notes.md`
- data_model → `docs/01_foundation/data_model.md`
- system_architecture → `docs/02_runtime/system_architecture.md`
- creative_state_model → `docs/02_runtime/creative_state_model.md`
- session_loop → `docs/02_runtime/session_loop.md`
- evaluation_signals → `docs/03_governance/evaluation_signals.md` (in repo; 00_start_here lists it under Step 2)
- runtime → `docs/02_runtime/session_loop.md`, `creative_metabolism.md`, `docs/03_governance/approval_state_machine.md`, `change_record_system.md`

---

## 1. Executive verdict

**NO-GO.**

The system cannot today “publish a public_habitat with an avatar and approved work” in the sense the canon implies. The public surface shows **only** a list of published artifacts. There is **no** avatar/identity layer on the public habitat (no API, no UI), and **no** consumption of `public_habitat_content`. Avatar/embodiment exists only in Studio (identity table, Harvey PATCH/approve_avatar); it never reaches the public site. Approval → publication separation and artifact filtering are correctly enforced, but the “avatar + approved work” success case is only half-wired: approved work yes, avatar no, and “public habitat” is artifact-only.

---

## 2. Canon-to-code trace map

| Concept | Canon expectation | Actual implementation | Status | Break point / notes |
|--------|--------------------|----------------------|--------|----------------------|
| **Identity / twin identity** | One current self-model; name, summary, philosophy, embodiment_direction, habitat_direction (data_model, ontology). | `identity` table (migration 20250108000001). Loaded: `getBrainContext` → `loadActiveIdentity` in `lib/brain-context.ts`. GET/PATCH `apps/studio/app/api/identity/route.ts`. Studio UI: `app/identity/page.tsx`, `identity-form.tsx`. | **Fully wired** (Studio only) | Not exposed to public habitat. |
| **Avatar / embodiment direction** | Part of identity; evolution via proposals and Harvey approval (constitution, approval_state_machine). | Stored in `identity.embodiment_direction`. Updated by: (1) PATCH `/api/identity`, (2) POST `/api/proposals/[id]/approve` with `action: approve_avatar` when `target_type === "avatar_candidate"` (`apps/studio/app/api/proposals/[id]/approve/route.ts`). Avatar proposals: `POST /api/proposals` with `target_type: "avatar_candidate"` (no session creates these; only chat creates `identity_name`). Review UI: `app/review/surface/avatar/avatar-proposal-list.tsx`. | **Partially wired** | Avatar never read by public-site. No `GET /api/public/identity` or equivalent. Public habitat has **no avatar model** in the UI. |
| **Creative session loop** | Assess state → select mode/drive → choose project/thread/idea → generate → critique → evaluate → update state/memory (session_loop, system_architecture). | Entry: POST `apps/studio/app/api/session/run/route.ts`. Loads state: `getLatestCreativeState`, `computeSessionMode`, `computeDriveWeights`, `selectDrive` (evaluation). Project/thread: `selectProjectAndThread` in `lib/project-thread-selection.ts`; only `projectId` passed to pipeline. Pipeline: `packages/agent/src/session-pipeline.ts` → `generateWriting` or `generateImage`; one artifact; `primary_idea_id`/`primary_thread_id` always null. Critique: `runCritique` (evaluation). Evaluation: `computeEvaluationSignals`. State update: `updateCreativeState`, `stateToSnapshotRow`; snapshot + memory inserted in session run route. | **Partially wired** | `ideaThreadId` from selection is never passed into pipeline; artifact lineage (primary_thread_id) always null. No “choose idea” step in pipeline. |
| **Self critique** | Post-generation qualitative judgment; critique_record; outcome (continue/branch/reflect/stop etc.) (glossary, self_critique_system). | `runCritique` from `@twin/evaluation` called in session run route after generation. Critique row inserted into `critique_record`. Outcome used for evaluation and repetition detection. | **Fully wired** | — |
| **Evaluation signals** | Structured scores from critique; feed state update and decisions; do not set approval (evaluation_signals). | `computeEvaluationSignals` in session run; row inserted into `evaluation_signal`. Scores on artifact row. Not used to set `current_approval_state`. | **Fully wired** | — |
| **Approval state history** | Approval transitions recorded; not overwritten (approval_state_machine, data_model approval_record). | Artifact approve: `apps/studio/app/api/artifacts/[id]/approve/route.ts` updates `artifact.current_approval_state` and inserts into `approval_record` (artifact_id, approval_state, reviewer, review_note, annotation_note). History preserved. | **Fully wired** | — |
| **Publication state / publish action** | Publication is separate from approval; only after approved_for_publication can publish set published (governance-rules, approval_state_machine). | Publish: POST `apps/studio/app/api/artifacts/[id]/publish/route.ts`. Requires `current_approval_state === approved_for_publication`; then sets `current_publication_state = published` and inserts `publication_record`. Staging gate: `passesStagingGate` in `lib/publish-gate.ts` — if artifact has linked proposals, at least one must be in approved_for_staging/staged/approved_for_publication/published. | **Fully wired** | — |
| **Staging habitat** | Preview layer; not public; shows approved-for-staging / staged proposals (staging_habitat, concept_to_proposal_flow). | GET `apps/studio/app/api/staging/proposals/route.ts` returns surface proposals in approved_for_staging/staged/approved_for_publication/published. `apps/habitat-staging/app/page.tsx` fetches that API and renders proposals; error handling present. Build state / before-after panels are mock. | **Partially wired** | Staging shows proposals from API. No artifact-level staging API. Build state = mock. |
| **Public habitat** | Curated surface; only approved_for_publication + published artifacts; Harvey curates (public_habitat, constitution). | GET `apps/studio/app/api/public/artifacts/route.ts`: selects artifact where `current_approval_state = 'approved_for_publication'` AND `current_publication_state = 'published'`. `apps/public-site/app/page.tsx` fetches that API only; renders list of artifacts (title, summary, medium, preview, date). No identity/avatar fetch; no `public_habitat_content` fetch. | **Partially wired** | Public site displays **only** published artifacts. No avatar, no identity, no narrative block from `public_habitat_content`. |
| **Source ingestion** | source_item; identity_seed etc. (data_model, source_item). | `apps/studio/app/api/source-items/route.ts`, upload, ingest, seed-default-identity; `getSourceContextForSession` in `lib/source-context.ts` used in brain context. | **Fully wired** (Studio) | — |
| **Memory updates** | memory_record; session reflection (data_model, memory_model). | Session run route inserts into `memory_record` (memory_type session_reflection, summary, source_session_id, source_artifact_id, importance/recurrence from evaluation). `@twin/memory` retrieveMemory used in getBrainContext. | **Fully wired** | — |
| **Idea thread / lineage** | idea_thread, idea_to_thread; selection in session loop (session_loop, data_model). | Tables exist. `selectProjectAndThread` in `lib/project-thread-selection.ts` returns `ideaThreadId`; session run passes only `projectId` to pipeline. Pipeline always sets `primary_idea_id: null`, `primary_thread_id: null`. | **Partially wired** | Thread selected but not passed to pipeline; artifact never linked to thread. |
| **Archive / return** | archive_entry; return drive (session_loop, archive_and_return). | No `archive_entry` inserts in session run. “Archive” exists as approval_state and proposal_state filter only. Return drive in weights; no archive resurfacing logic. | **Stubbed** | archive_entry table unused. Return is drive weight only. |
| **Change records** | Approved system/canon changes recorded (change_record_system). | `writeChangeRecord` in `lib/change-record.ts`. Called from `apps/studio/app/api/proposals/[id]/approve/route.ts` on apply_name, approve_avatar, approve_for_publication (habitat), and when lane_type === "system". | **Fully wired** | — |
| **Token guardrails / stop limits** | Max artifacts per session; max tokens; repetition; low-token throttle (system_architecture §15, creative_metabolism). | `lib/stop-limits.ts`: getMaxArtifactsPerSession, getMaxTokensPerSession, isOverTokenLimit, getLowTokenThreshold. Session run: hard 400 if isOverTokenLimit before persist; slice artifacts to maxArtifacts. `lib/repetition-detection.ts`: detectRepetition(critique_outcome); updateCreativeState(..., repetitionDetected) bumps reflection_need. Token usage: addTokenUsage in runtime_config (daily); cron checks LOW_TOKEN_THRESHOLD and sets mode to slow. | **Fully wired** | — |
| **Always-on / scheduled execution** | Scheduler; mode (slow/default/steady/turbo) (creative_metabolism). | `runtime_config` table; GET/PATCH `api/runtime/config`; GET `api/cron/session` (x-cron-secret); session run accepts cron secret; intervals by mode; Studio Runtime panel. | **Fully wired** | — |

---

## 3. End-to-end scenario trace: avatar + approved work → public habitat

**Scenario:** Twin develops or selects an avatar direction, produces artifacts, routes them through critique/evaluation/review, gets something approved for publication, and the public habitat shows (1) an avatar/embodiment identity element and (2) approved published works only.

### 3.1 Where avatar data originates

- **Identity row:** `identity.embodiment_direction` (and name, summary, philosophy, habitat_direction). Set by: (1) Harvey PATCH `/api/identity`, (2) bootstrap from source (`api/identity/bootstrap`), (3) approve_avatar from a proposal (`proposals/[id]/approve` with action `approve_avatar`).
- **Avatar proposals:** `proposal_record` with `target_type = 'avatar_candidate'`. Created only by POST `/api/proposals` with body `target_type: "avatar_candidate"`. No session and no chat path creates avatar_candidate (chat creates only identity_name). So avatar direction can be refined by Harvey editing identity or by Harvey creating an avatar_candidate proposal and approving it; there is no Twin-originated avatar proposal flow in code.

### 3.2 Where it is stored

- Identity: `identity` table, `embodiment_direction` (and related fields).
- Approved artifact: `artifact` with `current_approval_state = 'approved_for_publication'`, then after publish `current_publication_state = 'published'`.

### 3.3 How it would be reviewed/approved

- Artifacts: Harvey uses review/artifacts; POST `/api/artifacts/[id]/approve` with `approval_state: approved_for_publication`; then POST `/api/artifacts/[id]/publish`. Staging gate enforced (linked proposals must have passed staging).
- Avatar: Harvey uses review/surface/avatar; POST `/api/proposals/[id]/approve` with `action: approve_avatar`; identity.embodiment_direction updated; change_record written.

### 3.4 How it would become publishable

- Artifact: Must be approved_for_publication then publish called. Enforced in code.
- Avatar: There is no “publish” for identity/avatar to the public. Identity is not a publishable unit in the public API; it is only in Studio.

### 3.5 How the public habitat fetches it

- **Artifacts:** Public site calls `GET {NEXT_PUBLIC_STUDIO_URL}/api/public/artifacts`. That route selects from `artifact` where `current_approval_state = 'approved_for_publication'` and `current_publication_state = 'published'`. So published artifacts are fetched correctly.
- **Avatar/identity:** There is no public API that returns identity or embodiment_direction. No `GET /api/public/identity` or similar. Public-site does not call any identity endpoint.

### 3.6 How the public habitat decides what to render

- **Today:** `apps/public-site/app/page.tsx` renders only the list from `getPublishedArtifacts()`: title, summary, medium, preview_uri/content_uri, created_at. No identity block, no avatar, no narrative from `public_habitat_content`.
- **public_habitat_content:** Written when Harvey approves a habitat/concept proposal (approve route upserts `public_habitat_content` slug `home`). No route or page in public-site reads this table. So it is **dead for the public surface**.

### 3.7 What breaks today

1. **No avatar on public habitat.** Avatar/embodiment exists only in Studio. Public site has no identity/avatar data source and no UI for it.
2. **public_habitat_content unused.** Approved habitat content is written to DB but never consumed by public-site.
3. **Avatar proposals are manual only.** No session or chat creates avatar_candidate; Harvey must create proposals via POST /api/proposals or equivalent. So “Twin develops or selects an avatar direction” in an automated way is not implemented.

**Conclusion:** There is **no true avatar model on the public habitat**. The public habitat is “list of published artifacts” only. Approval and publication are correctly separated; drafts and staging-only items stay out of public. The missing piece is the **identity/avatar layer** and (optionally) use of `public_habitat_content` on the public surface.

---

## 4. “100 cycles or fewer” in practical terms

**Operational definition of success (for this repo):** Within 100 session runs (or cron-triggered runs), the system can plausibly: (1) create or refine an avatar/identity artifact or direction, (2) avoid getting stuck in repetition or undefined loops, (3) produce reviewable artifacts, (4) preserve approval history, (5) have Harvey set at least one artifact to approved_for_publication, (6) have Harvey publish it so it becomes published, (7) have that item appear on the public habitat, (8) keep drafts and staging-only items out of public, (9) do so without silent state jumps.

**Assessment:**

- **Create or refine avatar:** Only via Harvey (identity PATCH or manual avatar_candidate proposal). No Twin-originated avatar proposal in 100 runs. So “refine” is possible only with manual steps.
- **Avoid repetition/loops:** Repetition detection and reflection_need bump exist; token hard stop and LOW_TOKEN_THRESHOLD exist. So 100 cycles are not obviously dangerous.
- **Produce reviewable artifacts:** Yes; each run can produce one artifact → pending_review.
- **Preserve approval history:** Yes; approval_record and publication_record.
- **approved_for_publication then published:** Yes; gates enforced.
- **Render published item on public habitat:** Yes for **artifacts**; public site shows them.
- **Drafts/staging out of public:** Yes; filter is approval + publication.
- **Avatar on public:** No; public has no avatar.

**100-cycle verdict:** **Unrealistic for “avatar + approved work” on public.** For “approved work only” it is **optimistic but plausible** (depends on Harvey review cadence and session success rate). For “avatar + approved work” it is **meaningful only if** the missing link—public habitat reading identity/avatar—is added; otherwise “100 cycles” does not change the fact that the public surface cannot show an avatar.

---

## 5. Stop limits, guardrails, and loop health

| Protection | Implemented? | Evidence | Note |
|------------|--------------|----------|------|
| Repeated low-novelty looping | Partially | `updateCreativeState` uses novelty from emergence/recurrence; low novelty increases reflection_need. No explicit “skip session if novelty too low” in cron. | State nudges; no hard skip. |
| Repeated critique patterns | Yes | `detectRepetition(supabase, critique_outcome)` in session run; when ≥ REPETITION_THRESHOLD same outcome in window, `repetitionDetected` → `updateCreativeState(..., true)` → reflection_need ≥ 0.7. | Implemented. |
| Too many cycles on same artifact/thread | No | No “cycles per artifact” or “cycles per thread” cap. Thread is selected but not written to artifact; no per-thread cycle counter. | Missing; could make 100 cycles noisy on one thread. |
| Token / budget guardrails | Yes | Hard stop when over MAX_TOKENS_PER_SESSION (400, no persist). LOW_TOKEN_THRESHOLD switches mode to slow. Daily token tally in runtime_config. | Implemented. |
| Forced reflection / rest / archive | Partially | reflection_need drives drive weights (reflection drive); no forced “must reflect next” or “must rest” session type. No archive_entry creation. | Weights only; no mandatory reflect/rest. |
| Scheduler throttling / mode switch | Yes | getIntervalMs(mode); cron respects interval; LOW_TOKEN_THRESHOLD forces slow. | Implemented. |

**Impact on 100 cycles:** Token and repetition protections make 100 cycles non-trivial to blow up. Lack of per-thread/per-artifact cycle caps and lack of forced reflect/rest means the run could be “noisy” or repetitive without hard failure. Not fatal for a single 100-cycle test, but not fully diagnostic either.

---

## 6. Publication safety and governance

| Requirement | Enforced in code? | Evidence |
|-------------|--------------------|----------|
| No artifact becomes public just because it was generated | Yes | New artifacts get `current_approval_state: pending_review`, `current_publication_state: private`. Public API filters on approved_for_publication + published. |
| No artifact becomes public just because it was approved | Yes | Publish route requires approved_for_publication; then sets published. Two-step. |
| No governance proposal self-activates without Harvey | Yes | apply_name, approve_avatar, approve_for_publication only in approve route; auth required. |
| Review history preserved, not overwritten | Yes | approval_record insert on each approve; artifact.current_approval_state updated but history in approval_record. |
| Public habitat fetch filtered to publication-ready records | Yes | `api/public/artifacts`: `.eq('current_approval_state','approved_for_publication').eq('current_publication_state','published')`. |
| Staging not treated as public | Yes | Staging uses separate API and app; public uses public/artifacts. No mixing. |

**Verdict:** Publication and governance are correctly enforced. No blockers here for “approved work only” public display.

---

## 7. Blocker table

| Area | Blocker | Severity | Evidence | Why it matters | Fastest valid fix |
|------|---------|----------|----------|----------------|--------------------|
| Public habitat | No avatar/identity on public surface | **Fatal** | `apps/public-site/app/page.tsx` only fetches `/api/public/artifacts`; no identity/avatar API or UI. | “Public habitat with avatar” is not achievable. | Add GET `/api/public/identity` (read-only, active identity name + embodiment_direction + optional summary); public-site fetches and renders an avatar/identity block. |
| Public habitat | public_habitat_content never consumed | **High** | Approve route upserts `public_habitat_content`; no route in public-site or Studio public API reads it. | Canon “habitat” content (narrative/copy) never appears on public. | Either add GET `/api/public/habitat-content` and render on public-site or document that V1 public = artifacts only and habitat_content is for a later iteration. |
| Avatar flow | No Twin-originated avatar proposals | **High** | Only `identity_name` created by chat; create-proposal is concept-only; avatar_candidate only via manual POST /api/proposals. | In 100 cycles the Twin cannot “develop or select” an avatar direction into a proposal; only Harvey can. | Optional: allow session or chat to create avatar_candidate proposals when certain conditions hold; or accept Harvey-only avatar for V1. |
| Session loop | ideaThreadId not passed to pipeline | **Medium** | `selectProjectAndThread` returns ideaThreadId; session run passes only projectId; pipeline sets primary_thread_id null. | Lineage and “return to thread” are not reflected on artifacts. | Pass ideaThreadId into SessionContext; pipeline sets artifact.primary_thread_id when provided. |
| Archive | archive_entry never written | **Low** | No code inserts into archive_entry. | Return drive and archive resurfacing are not backed by data. | Defer or add minimal archive_entry insert when Harvey archives an artifact. |

---

## 8. Go/no-go verdict

**NO-GO.**

**Justification:** The system can correctly produce artifacts, run critique/evaluation, record approval and publication, and show **only** published artifacts on the public site. So “approved work on public habitat” is wired. But the ask is “public habitat **with an avatar** and approved work.” The public habitat has no avatar: no API exposes identity/embodiment to the public, and the public-site app does not render any identity block. So the current repo would give false confidence for “avatar + approved work” — half the success case is missing. Until the public surface can show an avatar/identity element (and optionally use public_habitat_content), the answer is no-go for that target.

---

## 9. Shortest fix path (to reach GO)

1. **Public identity API and UI (required for avatar on public)**  
   - Add GET `/api/public/identity` (no auth): return active identity’s name, embodiment_direction, and optionally summary (and habitat_direction if desired), e.g. from `identity` where `is_active` and `status = 'active'`, limit 1.  
   - In `apps/public-site/app/page.tsx`, fetch this (e.g. alongside or before artifacts); render a clear “identity/avatar” block (e.g. name + short embodiment line).  
   - Ensures “public habitat with an avatar” is actually reachable.

2. **Optional: public_habitat_content**  
   - If canon “habitat” includes narrative/copy: add GET `/api/public/habitat-content` (e.g. by slug) and render that block on public-site.  
   - If V1 is artifacts-only, document that and leave habitat_content for later.

3. **Optional: ideaThreadId in pipeline**  
   - Pass `ideaThreadId` from `selectProjectAndThread` into session context and pipeline; set `artifact.primary_thread_id` when provided.  
   - Improves lineage and 100-cycle diagnosability; not required for “avatar + published work” to show.

Do not redesign the system. Prioritize (1); (2) and (3) as needed for scope.

---

## 10. Confidence level

**Medium.** The trace is based on direct inspection of routes, components, and tables. Remaining risks: (1) env or deployment details (e.g. NEXT_PUBLIC_STUDIO_URL) could prevent public-site from reaching Studio in some environments; (2) no automated e2e test that “publish one artifact → appears on public and no draft appears”; (3) avatar_candidate creation path (e.g. any other client or script) was not exhaustively searched.

---

## Can this Twin publish a real public habitat with an avatar and approved works in 100 cycles or less?

**No.**

**Why:** Approved works **can** be published and shown on the public habitat: approval and publication are separate and enforced, and the public site correctly lists only published artifacts. So “approved works” in 100 cycles is plausible. But the **avatar** is not on the public habitat at all. Identity and embodiment_direction exist only in Studio; there is no public API and no public UI for them. So “public habitat with an avatar and approved works” is not achievable until the public surface has an identity/avatar layer (e.g. GET /api/public/identity and a corresponding block on the public site). Without that, the answer is no.
