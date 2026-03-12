# Architecture Review: Concept → Proposal → Staging → Public

**Review date:** 2026-03-12  
**Last updated:** 2026-03-12 (post-pull: state semantics and promote → proposal sync)  
**Scope:** End-to-end pipeline integrity, latest implementation health, canon vs implementation, data model, observability, surface/governance, and improvement opportunities.

---

## A. Executive Verdict

| Dimension | Verdict |
|-----------|--------|
| **Overall architecture health** | **Decent** — core pipeline exists and is mostly coherent; staging composition and governance FSM are implemented. Several canon mismatches, one critical data-semantic bug, and observability gaps prevent a "strong" rating. |
| **Confidence in current direction** | **Moderate** — the branch model (staging_habitat_content, merge-on-approve, promote-to-public) is the right direction and is now wired. Confidence is reduced by: (1) two parallel paths to public (single-proposal publish vs promote), (2) runner "refresh" behavior that overwrites proposal content but not artifact_id, (3) missing "rejected/archived same artifact" guard, (4) legacy action "approve" no longer legal from pending_review. |
| **Biggest architectural win** | **Clear governance boundary**: Proposal FSM is centralized in `governance-rules.ts`; approve route and PATCH route both use `isLegalProposalStateTransition`. Merge-on-approve is a side-effect of approval, not a separate FSM. Public is only updated by human actions (approve_for_publication or promote). Runner never writes to staging_habitat_content or public_habitat_content. **State now reflects reality:** when content is written to a public surface (habitat upsert or avatar set), the proposal is advanced to `published` in one step; promote advances source proposals to `published` so proposal state and promotion stay in sync. |
| **Biggest architectural risk** | **Proposal record no longer 1:1 with artifact when "refresh" is used**: When there are existing active habitat proposals, the runner updates the *newest* proposal's title/summary/habitat_payload_json with the *current* session's concept but does *not* update artifact_id or target_id. So the proposal record points at the original artifact while displaying content from a different artifact. That breaks traceability and confuses "which concept produced this proposal." |

---

## B. End-to-End Flow Map (Actual Implementation)

### 1. Concept emergence

- **Source:** Session runner generates an artifact with `medium === "concept"` via the concept plugin (`packages/agent/src/mediums/concept-plugin.ts`). Concept plugin calls `generateWriting` with `preferMedium: "concept"`.
- **Pipeline:** `runSessionPipeline` → generation → `runCritiqueAndEvaluation` → `persistCoreOutputs` (session, artifact, critique, evaluation, generation_run) → `persistDerivedState` → **manageProposals** → `writeTraceAndDeliberation` → `persistTrajectoryReview`.
- **Explicit vs inferred:** Medium is explicit (artifact.medium). Proposal role and target surface are **hardcoded** in the runner for concept: `target_surface: "staging_habitat"`, `proposal_role: "habitat_layout"`, `target_type: "concept"`. Concept plugin declares `proposalRole: "habitat_layout"`, `targetSurface: "staging_habitat"` but the runner does not read the plugin for this; it branches on `artifact.medium === "concept"`.

### 2. Proposal eligibility

- **Where:** `apps/studio/lib/proposal-eligibility.ts` — `isProposalEligible(input)`.
- **Rules (implemented):** medium === "concept"; critique_outcome in { continue, branch, shift_medium }; alignment_score >= 0.6; fertility_score >= 0.7; pull_score >= 0.6.
- **Not implemented (canon):** "Not already rejected" — no check for an existing proposal for the **same artifact** in state rejected or archived. So the same concept artifact could get a new proposal after a previous one was rejected. Canon: `concept_to_proposal_flow.md` §2.

### 3. Proposal creation / refresh (habitat)

- **Eligible path:** If `isProposalEligible` is true and backlog is under cap (`getMaxPendingHabitatLayoutProposals()`):
  - **No existing active proposals** (no row with lane_type=surface, proposal_role=habitat_layout, target_surface=staging_habitat, state in pending_review | approved_for_staging | staged): **Insert** new `proposal_record` with artifact_id, target_id = current artifact, title/summary/habitat_payload_json from `buildMinimalHabitatPayloadFromConcept` + validate.
  - **Existing active proposals:** **Update** the **newest** such proposal (by created_at desc) with current artifact's title, summary, habitat_payload_json. **Do not** update artifact_id or target_id. Then **archive** all older active proposals (FSM: transition to archived if legal).
- **Payload:** `buildMinimalHabitatPayloadFromConcept(title, summary)` always produces `page: "home"`, single hero block, version 1. So all runner-created habitat proposals target the home page only.
- **Silent behavior:** If cap is reached, no proposal is created/updated; `decisionSummary.next_action` may be set to "Focus on reviewing existing habitat layout proposals...". Trace gets `proposal_id` = undefined (or previous). No explicit "proposal_skipped_reason" in trace.

### 4. Proposal typing / role assignment

- **Explicit in DB:** proposal_record has lane_type, target_type, target_surface, proposal_type, proposal_role. Set at insert time in the runner; not derived from a registry at runtime for concept/avatar. Extension proposals use `state.extension_classification` for proposal_role.
- **Naming:** target_type "concept" is used for habitat layout proposals sourced from a concept artifact. Approve route uses `proposal.target_type === "concept"` to treat as habitat for staging merge. So "concept" here means "concept-sourced habitat proposal," not "generic concept."

### 5. Staging target selection and staged payload

- **Staging target:** All runner-created habitat proposals have target_surface = "staging_habitat". There is no "selection" — it's fixed.
- **Staged payload application:** When Harvey calls **POST /api/proposals/[id]/approve** with **action: "approve_for_staging"**:
  1. Payload is normalized (habitat_payload_json may be string from JSONB; parse; support habitatPayloadJson key).
  2. If proposal has habitat payload and (target_surface === "staging_habitat" || target_type === "concept"), **merge** is called: `mergeHabitatProposalIntoStaging(supabase, id, habitatPayload, proposal.title)`.
  3. Merge: validate (full schema or minimal page+blocks); upsert `staging_habitat_content` (slug = payload.page, title, body=null, payload_json, source_proposal_id = proposal id).
  4. If merge returns applied: false → **return 400, do not update proposal state.**
  5. Otherwise, later in the route: proposal_record.proposal_state is set to newState (e.g. approved_for_staging).
- **Staging composition:** GET /api/staging/composition returns all rows from staging_habitat_content. Habitat-staging app uses composition as primary render source when pages.length > 0; otherwise shows proposal list (with mock fallback if no Studio URL).

### 6. Public promotion or publish boundary

- **Two paths:**
  1. **Promote staging (branch model):** POST /api/staging/promote — (1) Fails with a clear error if staging_habitat_content is empty. (2) Copies all staging_habitat_content rows to public_habitat_content. (3) Bulk-updates source proposals (by source_proposal_id, deduped) from states approved_for_staging | staged | approved_for_publication to **published**. (4) Inserts habitat_promotion_record. Returns promotionId, slugsUpdated, proposalsPublished. Auth required. Proposal state update is best-effort (non-fatal if it fails; promotion is still recorded).
  2. **Single-proposal publish (legacy):** POST approve with action **approve_for_publication** (or approve_publication). For habitat/concept: validate payload, upsert one slug into public_habitat_content, write change_record; then, because content was written, the route sets proposal_state to **published** (not approved_for_publication). For avatar_candidate: set active_avatar_artifact_id, then proposal_state → **published**. For all other lanes the state is set to approved_for_publication (pending a separate publish step). So when the approve route actually writes to a public surface, the proposal advances to published in one step.
- **Governance:** Both paths require an authenticated user. Runner never calls promote or approve.

### 7. Human approval / governed transition points

- **Proposal state:** All transitions guarded by `isLegalProposalStateTransition` (approve route and PATCH). Approve route maps action → newState; then checks FSM; then runs domain side-effects (merge, identity update, public upsert); then updates proposal_record.proposal_state.
- **Legacy action bug:** action "approve" sets newState = "approved". But PROPOSAL_STATE_TRANSITIONS does not allow pending_review → approved (only approved_for_staging, needs_revision, archived, rejected, ignored). So a pending_review proposal can never successfully use action "approve" — the route returns 400. The comment says "Legacy: keep approved for callers explicitly requesting it" but the FSM no longer allows that transition.

---

## C. Findings by Severity

### Updates since review (post-pull)

- **State reflects reality:** When the approve route writes to a public surface (habitat or avatar), it now advances the proposal to `published` in one step (contentPublished flag). No longer leaves proposals at approved_for_publication when content is already live.
- **Promote advances source proposals:** promoteStagingToPublic now bulk-updates source proposals (from staging_habitat_content.source_proposal_id) to `published` when they are in approved_for_staging | staged | approved_for_publication. Dedupes proposal IDs across pages. Return type includes proposalsPublished. Proposal state and promotion stay in sync.
- **Empty-staging guard:** Promote returns an error when staging composition is empty ("Staging composition is empty; nothing to promote to public."), avoiding no-op success.
- **Tests:** Approve-route tests cover gate state vs final state and contentPublished → published; staging-habitat-merge tests cover promote (empty guard, copy, promotion record, proposal advancement, errors, multi-page dedupe).
- **Unchanged:** The three critical items below (refresh/artifact_id, legacy approve unreachable, "not already rejected" guard) were not part of this pull and remain open.

### Critical

1. **Proposal refresh overwrites content but not artifact linkage** (`apps/studio/lib/session-runner.ts` ~1272–1279). When existing active habitat proposals exist, the runner updates the newest with current artifact's title, summary, habitat_payload_json. It does **not** update artifact_id or target_id. So the proposal record continues to reference the first artifact that created it while displaying content from the latest session. **Impact:** Traceability from proposal → artifact is wrong; "which concept produced this proposal" is ambiguous. **Fix:** Either (a) update artifact_id/target_id when refreshing (so the proposal "moves" to the latest concept), or (b) stop refreshing and create a new proposal per eligible concept (then cap/archive policy must be clarified), or (c) add a separate "source_artifact_id" vs "content_artifact_id" if both need to be represented.

2. **Legacy action "approve" is unreachable for pending_review** (`apps/studio/lib/governance-rules.ts` PROPOSAL_STATE_TRANSITIONS; `apps/studio/app/api/proposals/[id]/approve/route.ts`). newState = "approved" for action "approve", but pending_review → approved is not in the map. So any client sending action: "approve" for a pending_review proposal gets 400. **Fix:** Either add pending_review → approved in the FSM for legacy compatibility, or remove the "approve" action and document that approved_for_staging is the intended first step.

3. **Canon "not already rejected" not implemented** (concept_to_proposal_flow.md §2). Canon says: do not create a proposal if there is an existing proposal for this artifact in state rejected or archived (same lane/target). The runner never checks this. So the same concept can get a new proposal after rejection. **Fix:** Before insert, query proposal_record for same artifact_id, lane_type, proposal_role, and state in (rejected, archived); if any, skip create (or return a clear reason in trace).

### Important

4. **Dual path to public** — approve_for_publication writes one proposal's payload to public_habitat_content and now advances that proposal to published; promote copies full staging composition and advances source proposals to published. The two paths can still diverge in *which* content is on public (e.g. staging has A+B, public has only A from an earlier single-proposal approve). Design doc says "promotion is primary, single-proposal is legacy." Code does not enforce "prefer promotion"; both are equal. **Recommendation:** Document clearly which path is preferred; consider deprecating single-proposal-to-public for habitat or making it "emergency override" only.

5. **Runner always targets page "home"** — `buildMinimalHabitatPayloadFromConcept` always returns page: "home". So all session-created habitat proposals are for the home page. Canon and design allow multiple pages (e.g. works, about, installation). No bug per se, but limits product to a single-page staging story until something else produces other slugs.

6. **Staging app fallback to mock proposals** — When realProposals.length === 0 (e.g. no Studio URL or API empty), habitat-staging uses mockProposals so the UI always has something to show. That can mask "no proposals yet" or API misconfiguration. **Recommendation:** Prefer empty state + message when composition and proposals are both empty; use mocks only in dev or behind a flag.

7. **Trace does not record why proposal was skipped** — When proposal is not created (ineligible, cap, or refresh path that only updated), session trace has proposal_id and decision_summary but no explicit "proposal_skipped: ineligible" or "proposal_skipped: cap" or "proposal_updated_not_created". So "why did this concept not become a proposal?" requires inferring from eligibility thresholds and cap. **Recommendation:** Add a small field (e.g. proposal_outcome: "created" | "updated" | "skipped_cap" | "skipped_ineligible") to trace or deliberation.

### Nice to improve

8. **Surface release model doc vs implementation** — surface_release_model.md suggests states like draft_proposal, pending_staging_review, approved_for_staging, etc. Implementation uses pending_review, approved_for_staging, staged, approved_for_publication, published. Names don't match 1:1. Not blocking but can confuse.

9. **Approval state machine doc (artifact) vs proposal FSM** — docs/03_governance/approval_state_machine.md describes artifact approval (pending_review → approved, approved_for_publication, etc.). Proposal FSM in governance-rules is different (pending_review → approved_for_staging → staged → approved_for_publication → published). Both are valid but live in different docs; a single "state machines" doc that separates artifact vs proposal would help.

10. **Extension proposals use lane_type = system** — Phase 3 extension proposals are stored with lane_type = "system". Canon uses "system" for governance/canon proposals. Extension proposals are "operator review only; no apply in runner." Semantically they are a different kind of system proposal. Consider lane_type or target_type to distinguish "governance" vs "extension" if both grow.

---

## D. Canon Mismatches

| Canon (doc) | Implementation | Severity |
|-------------|----------------|---------|
| "Not already rejected: No existing proposal for this artifact in state rejected or archived" (concept_to_proposal_flow §2) | Runner does not check. Can create new proposal for same artifact after rejection. | Critical |
| "If eligible, create a proposal_record with proposal_state = pending_review" (concept_to_proposal_flow §2) | Runner may instead *update* an existing proposal and archive older ones; no new row. | Important (design choice but doc says "create") |
| Legacy "approve" action (approve route comment) | FSM does not allow pending_review → approved; route returns 400. | Critical |
| Staging = "first-class composition" + "merge on approve" (habitat_branch_staging_design) | Implemented. Merge-on-approve and staging_habitat_content are in place. | Aligned |
| "Promotion is primary path; single-proposal publish is legacy" (habitat_branch_staging_design §H) | Both paths are equal in code; no enforcement of "primary." | Minor |
| Approval state machine (approval_state_machine.md) | Describes artifact approval. Proposal FSM is separate and in governance-rules. | Doc split; not wrong but two sources of truth for "approval." |

---

## E. Recommended Changes

### Fix now

1. **Proposal refresh and artifact_id:** When the runner updates an existing habitat proposal with new title/summary/payload, either update artifact_id and target_id to the current artifact (so the proposal is "re-bound" to the latest concept), or stop updating and only create new proposals (and handle cap/archive policy). Prefer updating artifact_id/target_id so one "live" proposal reflects the latest eligible concept and traceability stays correct.
2. **Legacy "approve" action:** Either add `approved` to the list of allowed next states from pending_review in PROPOSAL_STATE_TRANSITIONS (if legacy clients need it), or remove the action and return 410 Gone with a message to use approve_for_staging.
3. **"Not already rejected" guard:** In manageProposals, before inserting a new habitat proposal for a concept, query for an existing proposal with same artifact_id, lane_type surface, proposal_role habitat_layout, and proposal_state in (rejected, archived). If found, skip create and optionally set decisionSummary/trace to indicate "proposal not created: prior proposal for this artifact was rejected or archived."

### Fix soon

4. **Proposal skip reason in trace:** Add a clear proposal_outcome (or equivalent) to session trace / deliberation when no proposal is created or when only an update happened (e.g. "created" | "updated_existing" | "skipped_ineligible" | "skipped_cap" | "skipped_rejected_archived").
5. **Document and optionally restrict dual public path:** In docs, state that "Push staging to public" is the primary path and single-proposal approve_for_publication is legacy. Optionally add a feature flag or operator setting to disable direct-to-public for habitat.
6. **Staging app empty state:** When composition and real proposals are both empty, show an explicit empty state instead of mock data (or gate mocks on dev only).

### Watch for later

7. **Multi-page habitat from runner:** If product needs proposals for works/about/installation, extend buildMinimalHabitatPayloadFromConcept or add a way to derive page from context; or allow manual create-proposal with custom payload.
8. **Block-level merge:** Design doc mentions future block-level merge (add block, revise block). Current merge is page-level replace only; no schema change needed until that feature is scoped.
9. **Rollback promotion:** habitat_promotion_record stores slugs_updated and promoted_at but not full snapshot. Rollback is "manual" or future; document and consider storing snapshot for one-step rollback later.
10. **Surface release model alignment:** Align surface_release_model.md state names with actual proposal_state and staging/public semantics, or mark the doc as aspirational.

---

## F. Public-Readiness Verdict

**Verdict: Yes, but clean up X first.**

- **Improved in repo (post-pull):** State semantics and promote loop. When content is written to a public surface, proposals now advance to `published` (approve route and promote both). Empty promote is guarded and tested. No change to the three critical items below.
- **X = the following before treating the repo as fully public-ready:**
  1. **Fix the proposal refresh / artifact_id bug** (critical data integrity). Without this, public readers (or contributors) tracing "concept → proposal → staging" will see incorrect artifact linkage when refresh is used.
  2. **Resolve legacy "approve" action** — either make it legal from pending_review or remove it and document the transition.
  3. **Add the "not already rejected" guard** and document it in concept_to_proposal_flow so canon and code match.
  4. **Short public-facing README or ARCHITECTURE.md** that summarizes concept → proposal → staging → public in one page and points to the key code paths (manageProposals, approve route, staging-composition, promote). This reduces the risk of misinterpretation when the repo is public.

The core pipeline is implementable and the governance boundary is clear. State now reflects "published = content is live." The main remaining blockers are the semantic bug in proposal refresh, the dead legacy action, and the missing canon guard. After those, the repo can be made public with a clear "current state" doc.

---

## References (files and modules)

| Area | Primary files |
|------|----------------|
| Concept → proposal | `apps/studio/lib/session-runner.ts` (manageProposals), `apps/studio/lib/proposal-eligibility.ts`, `packages/agent/src/mediums/concept-plugin.ts` |
| Proposal FSM | `apps/studio/lib/governance-rules.ts` (PROPOSAL_STATE_TRANSITIONS, isLegalProposalStateTransition) |
| Approve + merge | `apps/studio/app/api/proposals/[id]/approve/route.ts`, `apps/studio/lib/staging-composition.ts` (mergeHabitatProposalIntoStaging) |
| Staging composition | `apps/studio/app/api/staging/composition/route.ts`, `apps/studio/app/api/staging/proposals/route.ts` |
| Promote to public | `apps/studio/app/api/staging/promote/route.ts`, `apps/studio/lib/staging-composition.ts` (promoteStagingToPublic) |
| Habitat payload | `apps/studio/lib/habitat-payload.ts` (validateHabitatPayload, buildMinimalHabitatPayloadFromConcept, parseHabitatPayloadForMerge) |
| Canon | `docs/02_runtime/concept_to_proposal_flow.md`, `docs/architecture/habitat_branch_staging_design.md`, `docs/03_governance/approval_state_machine.md` |
| DB | `supabase/migrations/20250108000001_twin_core_tables.sql` (proposal_record), `supabase/migrations/20260313000001_staging_habitat_composition.sql` |
