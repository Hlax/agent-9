# Audit proof: what was fixed and what remains

For each audit section: exact files changed, runtime path that satisfies the requirement, full vs partial implementation, one concrete data/state example, test coverage, and canon doc updates. Then remaining gaps for always-on, governance-safe, and deployment-safe.

---

## 1) Concept → Proposal Pipeline

**Audit status:** PARTIAL → **partially addressed** (change_record write added; naming/canon_proposal unchanged).

### Files changed
- `apps/studio/lib/change-record.ts` (new)
- `apps/studio/app/api/proposals/[id]/approve/route.ts` (import + 4× `writeChangeRecord` calls)

### Runtime path that satisfies the requirement
- **POST** `/api/proposals/[id]/approve` with `action` in `apply_name` | `approve_avatar` | `approve_for_publication` | (any for system lane).
- On **apply_name**: after updating `identity.name`, calls `writeChangeRecord({ change_type: "identity_update", ... })`.
- On **approve_avatar**: after updating `identity.embodiment_direction`, calls `writeChangeRecord({ change_type: "embodiment_update", ... })`.
- On **approve_for_publication** (habitat/concept): after upserting `public_habitat_content`, calls `writeChangeRecord({ change_type: "habitat_update", ... })`.
- When **proposal.lane_type === "system"**: calls `writeChangeRecord({ change_type: "system_update", ... })`.

### Full vs partial
- **Full:** Approved identity, embodiment, habitat, and system proposals now insert into `change_record` with `approved: true`, `approved_by`, `effective_at`.
- **Partial:** No explicit `canon_proposal` target type; proposal types are still `lane_type` + `target_type`. No doc update mapping “surface_proposal / system_proposal / canon_proposal” to current schema.

### Concrete data/state example
1. Harvey approves an identity name proposal: POST `/api/proposals/{id}/approve` with `{ "action": "apply_name" }`.
2. `identity.name` and `name_status` are updated; `writeChangeRecord` inserts a row into `change_record` with `change_type: "identity_update"`, `target_type: "proposal_record"`, `target_id: <id>`, `approved: true`, `approved_by: <user.email>`.

### Test coverage
**None.** No automated test for the approve route or `writeChangeRecord`.

### Canon doc updated
**None.** `docs/03_governance/change_record_system.md` and `docs/01_foundation/data_model.md` were not updated. The audit’s “recommended fix” (document mapping + write change_record) is implemented in code only; naming (canon_proposal, etc.) is not documented.

---

## 2) Surface Deployment

**Audit status:** PARTIAL → **addressed** for “staging and public wired to real data”.

### Files changed
- `apps/studio/app/api/public/artifacts/route.ts` (existing GET)
- `apps/studio/app/api/staging/proposals/route.ts` (existing GET)
- `apps/public-site/app/page.tsx` (fetch `NEXT_PUBLIC_STUDIO_URL + '/api/public/artifacts'`, render list)
- `apps/habitat-staging/app/page.tsx` (fetch `NEXT_PUBLIC_STUDIO_URL + '/api/staging/proposals'`, map to `ChangeProposal`, use real list or mock fallback)
- `apps/public-site/.env.example`, `apps/habitat-staging/.env.example` (NEXT_PUBLIC_STUDIO_URL)

### Runtime path that satisfies the requirement
- **Public:** `GET /api/public/artifacts` → selects `artifact` where `current_approval_state = 'approved_for_publication'` and `current_publication_state = 'published'`; public-site page calls this (server-side, revalidate 60s) and renders artifacts.
- **Staging:** `GET /api/staging/proposals` → selects `proposal_record` where `lane_type = 'surface'` and `proposal_state` in (`approved_for_staging`, `staged`, `approved_for_publication`, `published`); habitat-staging page calls this (revalidate 30s) and shows proposals in “Change proposals”.

### Full vs partial
- **Full:** Public site shows only published artifacts from the API; staging shows only surface proposals in the approved/staged/published states. No auth on these APIs so cross-origin consumption works.
- **Partial:** Staging “Build state” and “Before/after” remain mock; no artifact-level staging API. Public site does not filter by habitat/slug if we add more content types later.

### Concrete data/state example
1. An artifact is approved for publication and published: `current_approval_state = 'approved_for_publication'`, `current_publication_state = 'published'`.
2. Public site loads: GET `{NEXT_PUBLIC_STUDIO_URL}/api/public/artifacts` → Studio returns `{ artifacts: [{ artifact_id, title, summary, medium, ... }] }` → page renders list with preview/content.

### Test coverage
**None.** No test for public/staging APIs or for public-site/habitat-staging pages.

### Canon doc updated
**None.** No change to surface_release_model or staging_habitat_design.

---

## 3) Creative Ecology Runtime

**Audit status:** PARTIAL → **partially addressed** (project/thread selection added; thread not yet passed into pipeline).

### Files changed
- `apps/studio/lib/project-thread-selection.ts` (new: `selectProjectAndThread`)
- `apps/studio/app/api/session/run/route.ts` (call `selectProjectAndThread(supabase)`, pass `projectId: selectedProjectId` into `runSessionPipeline`)

### Runtime path that satisfies the requirement
- **POST** `/api/session/run` (manual or cron).
- When `supabase` exists: `selectProjectAndThread(supabase)` loads active projects, picks one, loads active `idea_thread` for that project, weights by `recurrence_score` and `creative_pull`, picks one thread; returns `{ projectId, ideaThreadId }`.
- `projectId` is passed to `runSessionPipeline` as `projectId: selectedProjectId ?? undefined`; session and artifact rows get that `project_id`. `ideaThreadId` is **not** passed into the pipeline (pipeline has no `ideaThreadId` in `SessionContext`).

### Full vs partial
- **Full:** Session run now selects a project and an idea thread from DB and uses the selected project for the session/artifact.
- **Partial:** Selected `ideaThreadId` is not passed into `runSessionPipeline` or into generation context; pipeline/agent do not yet use thread for prompt or artifact linkage.

### Concrete data/state example
1. DB has `project` (status active) and `idea_thread` (project_id, status active, recurrence_score, creative_pull).
2. Session run: `selectProjectAndThread` returns e.g. `{ projectId: "uuid-p", ideaThreadId: "uuid-t" }`; `runSessionPipeline` is called with `projectId: "uuid-p"`; inserted `creative_session` and `artifact` have `project_id: "uuid-p"`. Thread `uuid-t` is not in pipeline context.

### Test coverage
**None.** No test for `selectProjectAndThread` or session run with project selection.

### Canon doc updated
**None.** `session_loop.md` not updated to state that project selection is implemented and thread is selected but not yet wired into generation.

---

## 4) Creative Metabolism

**Audit status:** FAIL → **unchanged** (design only; no metabolism layer in code).

### Files changed
- **None** for metabolism itself. Scheduler and mode (§5) were added; they do not consume drive/fatigue/energy as runtime variables.

### Runtime path
- N/A. No “metabolism” layer that decays/replenishes energy or throttles session frequency based on creative_drive, energy_decay, reflection_pressure, exploration_pressure.

### Full vs partial
- **Partial:** State fields (e.g. `reflection_need`, `creative_tension`) and drive weights / session mode are used in the single-session path. No separate metabolism loop or scheduler input from those signals.

### Test coverage
**None.**

### Canon doc updated
**None.**

---

## 5) Always-On Session Modes

**Audit status:** FAIL → **addressed** (scheduler entrypoint, mode storage, cron auth, Studio UI).

### Files changed
- `supabase/migrations/20250310000002_runtime_config.sql` (new: `runtime_config` table)
- `apps/studio/lib/runtime-config.ts` (new: get/set config, getIntervalMs, setLastRunAt)
- `apps/studio/app/api/session/run/route.ts` (accept `x-cron-secret` as auth)
- `apps/studio/app/api/runtime/config/route.ts` (new: GET/PATCH)
- `apps/studio/app/api/cron/session/route.ts` (new: GET, check secret, interval, trigger run)
- `apps/studio/app/components/runtime-panel.tsx` (new), `apps/studio/app/page.tsx` (embed RuntimePanel)
- `apps/studio/.env.example` (CRON_SECRET, APP_URL, RUNTIME_MODE, ALWAYS_ON_ENABLED)

### Runtime path that satisfies the requirement
- **GET** `/api/cron/session` with header `x-cron-secret: <CRON_SECRET>`: reads `runtime_config` (or env) for `mode`, `always_on`, `last_run_at`; if `always_on` and interval elapsed (or no prior run), POSTs to `/api/session/run` with same header, then sets `last_run_at`.
- **GET** `/api/runtime/config`: returns `mode`, `always_on`, `last_run_at`.
- **PATCH** `/api/runtime/config`: body `{ mode?, always_on? }`, auth required; updates `runtime_config`.
- **POST** `/api/session/run`: if header `x-cron-secret` matches `CRON_SECRET`, treated as authorized (no user required), runs as “harvey”.
- Intervals: slow 30 min, default 1 min, steady 5 min, turbo 45 s.

### Full vs partial
- **Full:** Mode and always-on are stored and read; cron can trigger sessions at mode-defined intervals; Studio UI shows and updates mode and always-on.
- **Partial:** No compute/token guardrails that force mode change (e.g. downgrade to slow when token budget low). No hourly/daily token budget or metabolism feeding “run or skip”.

### Concrete data/state example
1. Studio: set mode “steady”, always-on true. `runtime_config`: `mode=steady`, `always_on=true`, `last_run_at=null`.
2. Cron hits GET `/api/cron/session` with `x-cron-secret`. No previous run → triggers POST `/api/session/run` with secret; after run, sets `last_run_at=now()`. Next call within 5 min returns `{ skipped: true, reason: "interval", next_run_in_ms: ... }`.

### Test coverage
**None.** No test for cron route, runtime config API, or session run with cron secret.

### Canon doc updated
**None.** `creative_metabolism.md` not updated to state that scheduler and modes are implemented.

---

## 6) Stop Limits and Token Guardrails

**Audit status:** FAIL → **addressed** (limits, repetition, token accounting; no hard stop on token overage or critique-loop).

### Files changed
- `apps/studio/lib/stop-limits.ts` (new: getMaxArtifactsPerSession, getMaxTokensPerSession, getRepetitionWindow, isOverTokenLimit)
- `apps/studio/lib/repetition-detection.ts` (new: detectRepetition from last N critique_record)
- `packages/agent/src/generate-writing.ts` (return `usage` when present), `packages/agent/src/session-pipeline.ts` (tokensUsed in result)
- `packages/evaluation/src/creative-state.ts` (updateCreativeState(prev, evaluation, repetitionDetected); when repetitionDetected, bump reflection_need)
- `apps/studio/app/api/session/run/route.ts` (slice artifacts to maxArtifacts, isOverTokenLimit check, detectRepetition, pass repetitionDetected into updateCreativeState)
- `apps/studio/.env.example` (MAX_ARTIFACTS_PER_SESSION, MAX_TOKENS_PER_SESSION, REPETITION_WINDOW)

### Runtime path that satisfies the requirement
- **POST** `/api/session/run`: after `runSessionPipeline`, `artifacts = result.artifacts.slice(0, getMaxArtifactsPerSession())`; `isOverTokenLimit(result.tokensUsed)` is checked (no hard failure; session completes); after inserting critique, `detectRepetition(supabase, critique.critique_outcome)`; `updateCreativeState(previousState, evaluation, repetitionDetected)`; next snapshot gets higher `reflection_need` when repetition is detected.

### Full vs partial
- **Full:** Max artifacts per session enforced by slice; token usage collected and checked; repetition (same outcome in last N critiques) drives reflection_need; env config for limits and window.
- **Partial:** Token over-limit does not abort or force reflect/rest; no “critique loop” detection (e.g. N consecutive same outcome with different semantics); no LOW_TOKEN_THRESHOLD or auto downgrade to slow.

### Concrete data/state example
1. `MAX_ARTIFACTS_PER_SESSION=1`, `REPETITION_WINDOW=5`, `REPETITION_THRESHOLD=4`. Last 4 critique_record have `critique_outcome: "continue"`; current critique is “continue”. `detectRepetition` returns true; `updateCreativeState(..., true)` sets `reflection_need = max(prev.reflection_need, 0.7)` in next snapshot.

### Test coverage
**None.** No test for stop-limits, repetition-detection, or session run with token/repetition behavior.

### Canon doc updated
**None.** system_architecture §15 and creative_metabolism not updated to reference these modules.

---

## 7) Judgment Pipeline

**Audit status:** PASS → **unchanged**. No code changes; audit already considered this correct.

### Files changed
- None.

### Test coverage
**None** (audit did not require new tests for this section).

### Canon doc updated
**None.**

---

## 8) Governance Controls

**Audit status:** PARTIAL → **partially addressed** (change_record written on approve; governance log UI not added).

### Files changed
- Same as §1: `apps/studio/lib/change-record.ts`, `apps/studio/app/api/proposals/[id]/approve/route.ts`.

### Runtime path
- Same as §1: approve route writes to `change_record` for identity, embodiment, habitat, and system approvals.

### Full vs partial
- **Full:** Approved system/canon-affecting proposals now insert into `change_record` with approved=true, approved_by, effective_at.
- **Partial:** No Studio “governance log” that reads from `change_record` for transparency.

### Test coverage
**None.**

### Canon doc updated
**None.**

---

# Remaining gaps: always-on, governance-safe, deployment-safe

## Always-on

1. **No metabolism-driven scheduling** — Scheduler uses only mode interval and `last_run_at`. It does not read creative_drive, energy, fatigue, or reflection_pressure to decide “run or skip” or to switch mode. So “metabolism influences session frequency” is not implemented.
2. **No token/compute guardrails in scheduler** — No hourly or daily token budget; no automatic downgrade to slow (or pause) when token/compute threshold is low. Turbo could burn through budget with no backoff.
3. **Token over-limit is soft** — Session run does not fail or force reflect when `isOverTokenLimit(result.tokensUsed)`; it only completes the session. So stop limit is not a hard guardrail.
4. **Cron dependency** — Always-on depends on an external cron (e.g. Vercel Cron) calling GET `/api/cron/session`. If cron is misconfigured or down, no sessions run; no in-process loop.
5. **ideaThreadId not in pipeline** — Selected thread is not passed into generation; session is project-scoped but not thread-directed for prompt/artifact.

## Governance-safe

1. **change_record not visible in Studio** — No UI to list or inspect `change_record`; Harvey cannot easily audit approved changes.
2. **No explicit canon_proposal type** — Governance/runtime-behavior changes are not distinguished from other system proposals; no dedicated target_type or flow for “canon” (e.g. constitution/rule changes).
3. **Canon docs not updated** — change_record_system, data_model, creative_metabolism, session_loop do not document the new behavior and mapping (e.g. lane_type vs surface_proposal/system_proposal/canon_proposal).

## Deployment-safe

1. **Staging build state still mock** — Habitat-staging “Build state” and “Before/after” panels are not wired to real build/deploy state or artifact comparison.
2. **Public/staging depend on NEXT_PUBLIC_STUDIO_URL** — If env is wrong or Studio is down, public site and staging show empty or fallback; no explicit error state or health check.
3. **No deployment gates in code** — Nothing prevents publishing an artifact that hasn’t passed staging or that doesn’t match a specific release; gates are process-only.
4. **Cron secret in env** — CRON_SECRET must be set and kept secure; if leaked, anyone can trigger session runs. No optional IP or additional auth for cron.

---

**Summary:** The audit fixes are implemented in code as described above; no automated tests cover them, and no canon docs were updated. Remaining gaps prevent the system from being fully always-on (metabolism, token guardrails, thread-in-pipeline), governance-safe (change_record visibility, canon_proposal clarity, doc updates), and deployment-safe (staging/build wiring, env/health, deployment gates).
