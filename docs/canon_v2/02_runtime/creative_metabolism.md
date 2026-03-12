# Creative metabolism (canon v2)

This document describes how the **actual** codebase implements "creative metabolism": runtime mode (scheduler cadence), session mode and drive selection, and how they affect artifact production and proposals. It does not speculate about future architecture.

---

## 1. Runtime mode (scheduler)

- **Source of truth**: `runtime_config` table and `apps/studio/lib/runtime-config.ts`.
- **Keys**: `mode`, `always_on`, `last_run_at`, `tokens_used_today`, `tokens_reset_at`.
- **RuntimeMode**: `"slow"` | `"default"` | `"steady"` | `"turbo"`.
- **Effect**: Cron uses `getIntervalMs(mode)` to enforce minimum time between session runs:
  - **slow**: 30 minutes
  - **default**: 1 minute
  - **steady**: 5 minutes
  - **turbo**: 45 seconds

Cron reads `getRuntimeConfig(supabase)` and skips running if the interval since `last_run_at` has not elapsed (and other guards such as session count in last hour). After a successful run, cron updates `last_run_at` and token usage.

---

## 2. Metabolism mode in the session

- **Metabolism mode** in the session is the **runtime scheduler mode** (e.g. cron vs manual). It is **not** an execution classification (auto/proposal_only/human_required).
- **Where it comes from**: In `writeTraceAndDeliberation`, the runner calls `getRuntimeConfig(supabase)` and sets `metabolismMode = runtimeConfig.mode`. This value is stored in:
  - `state.metabolismMode`
  - Session trace JSON (`mode`)
  - Deliberation trace `observations_json.metabolism_mode`
- **Manual runs**: When the session is triggered via POST /api/session/run (no cron), the runtime config may still return a mode (e.g. "default"); the "manual" vs "cron" distinction is whether the cron route invoked the runner. Implementation-defined: the UI may show "manual" when the run was not triggered by cron.

---

## 3. Session mode and drive

- **Session mode**: `explore` | `return` (and possibly others from `computeSessionMode` in `@twin/evaluation`). Derived from creative state and `public_curation_backlog`.
- **Drive**: Selected by `selectDrive(driveWeights)` from `computeDriveWeights(sessionState)`. Both use the latest creative state plus live backlog.
- **Drive steering status**: Drive is currently a **descriptive/observability label**. It is computed, stored on `creative_session.selected_drive`, and recorded in the session trace and `deliberation_trace.observations_json.selected_drive`. It is **not** injected into the generation prompt and does not branch the pipeline. Drive represents what the system "intends" in a session; injecting it into generation prompts is a future evolution when runtime evidence shows it would meaningfully differentiate output.
- **Purpose**: Session mode determines focus selection (e.g. "return" uses archive_entry). Drive is descriptive — informing observability and future steering — but does not by itself change generation content, focus, or governance.

---

## 4. Preferred medium

- **Explicit**: Caller can pass `preferMedium` in session options (writing, concept, image). This overrides any derived preference.
- **Derived**: `derivePreferredMedium(state, explicit, isCron)` uses creative state (e.g. reflection_need, unfinished_projects, avatar_alignment, expression_diversity, creative_tension, public_curation_backlog) and, for cron, a small random chance for image. Default is writing/concept path when null.
- **Artifact role**: `inferArtifactRole(medium, isCron)` sets roles such as `layout_concept` (concept + cron) and `image_concept` (image + cron) for trace/eligibility; it does not change governance.

---

## 5. Caps and limits

- **Stop-limits** (`apps/studio/lib/stop-limits.ts`): Max artifacts per session, max pending avatar proposals, max pending habitat layout proposals, token limit, archive decay half-life. These cap how many proposals are created and how often sessions run. Canon reference in code: system_architecture §15, creative_metabolism §7.

---

## 6. Proposal creation (metabolism output)

- The Twin does **not** mutate public habitat or identity directly. It creates **proposals** (proposal_record rows) when eligible:
  - **Habitat layout**: Concept artifacts (cron) that pass eligibility and caps → proposal_record with target_type for habitat.
  - **Avatar candidate**: Image artifacts (cron) that pass eligibility and caps → proposal_record with target_type avatar_candidate.
- Eligibility and caps are enforced in `manageProposals`. Creating a proposal does not change proposal_state beyond the initial state (e.g. pending_review); application is only via POST /api/proposals/[id]/approve (human-gated).

---

## 7. Summary

- **Creative metabolism** in code = runtime scheduler mode + session mode/drive + preferred medium derivation + caps. It controls *how often* and *what kind* of sessions run and what proposals are created.
- **Governance** is separate: proposals are created by the Twin; approval and application are human-gated and enforced by API routes and state machines (see 03_governance/state_machines.md).
