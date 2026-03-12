# Proposal Lanes — QA & Validation Report

**Date:** 2026-03-12  
**Scope:** Behavior validation only (concept → proposal → decision lane → resolution; surface path concept → proposal → staging → public; interactive surface proof point).  
**Source of truth:** Implementation report, current repo code, and executed tests.

---

## 1. QA Verdict

**PASS WITH ISSUES**

The proposal-lanes implementation is **semantically correct** on the primary path: surface proposals are created and refreshed with truthful `artifact_id`/`target_id` linkage, the rejected/archived guard and `proposal_outcome` trace are in place, and the **approve route** enforces lane guards so only surface proposals can use `approve_for_staging` and `approve_for_publication`. Staging composition, promotion to public, and the interactive surface path (create-proposal with `interactive_module`/story_card → approve for staging → staging preview → promote) are implemented and covered by unit tests. The **critical** issue identified during QA—**PATCH /api/proposals/[id]** allowing transitions to `approved_for_staging`/`approved_for_publication`/`published` without a lane check—has been **fixed**: PATCH now selects `lane_type` and returns 400 for non-surface proposals when the requested state is one of those three. Remaining issues are **important** (lane guard not yet covered by an automated test) and **minor** (trace `skipped_ineligible`, create-proposal interactive lane doc/rule). With the PATCH fix applied, the lane model is enforced at both approve and PATCH entry points; the rest of the recommended cleanup is for robustness and clarity.

---

## 2. Behavior Validation Matrix

| Item | Status | Note |
|------|--------|------|
| Surface proposal creation | **Works** | Session-runner and create-proposal insert with `lane_type: "surface"`; tests and code path confirmed. |
| Surface proposal refresh | **Works** | manageProposals updates existing proposal with artifact_id, target_id, title, summary, payload. |
| artifact_id / target_id refresh linkage | **Works** | Update object in session-runner includes artifact_id and target_id. |
| Rejected/archived guard | **Works** | existingRejected query; skip insert and set proposalOutcome skipped_rejected_archived. |
| proposal_outcome trace visibility | **Partially works** | created/updated/skipped_cap/skipped_rejected_archived set and persisted; skipped_ineligible not set when concept ineligible (trace stays null). |
| approve_for_staging flow | **Works** | FSM + lane guard; merge into staging for habitat; state → approved_for_staging. |
| Staging composition correctness | **Works** | mergeHabitatProposalIntoStaging validated; story_card accepted; unit tests pass. |
| Staging promotion to public | **Works** | promoteStagingToPublic copies staging → public, advances source proposals to published; tests pass. |
| Public state matches staged state | **Works** | Promotion copies staging_habitat_content to public_habitat_content; source_proposal_id preserved. |
| Lane guard for medium proposals | **Works** | Approve route returns 400; PATCH now also returns 400 for surface-only states (fix applied in this pass). |
| Lane guard for system proposals | **Works** | Same as medium: both approve and PATCH enforce lane for surface-only states. |
| Interactive surface proposal creation | **Works** | create-proposal accepts proposal_role, habitat_payload; default lane_type surface; story_card validated. |
| Interactive staging render | **Works** | StagingBlockPreview renders story_card (title + cards); composition from staging API. |
| Interactive public promotion | **Works** | Same promotion path; story_card in public-site block render. |
| Canonical staging → public semantics | **Works** | Docs and approve-route comment state staging promotion canonical; direct approve_for_publication legacy/emergency. |
| Legacy direct-to-public behavior | **Works** | Still available via approve route for surface only; no contradiction in code. |
| Legacy approve behavior | **Works** | FSM allows pending_review → approved; system UI uses "approve" for system proposals. |

---

## 3. Findings by Severity

### Critical

**C1. PATCH /api/proposals/[id] bypasses lane guard — FIXED**

- **What was tested:** Code path for PATCH proposal state and approve route lane guard.
- **Steps:** (1) Create a proposal with lane_type = medium (e.g. extension path or create-proposal body). (2) Call PATCH /api/proposals/[id] with body `{ proposal_state: "approved_for_staging" }`.
- **What happened (before fix):** PATCH used FSM only; transition to `approved_for_staging` was allowed for any proposal. **After fix:** PATCH now selects `lane_type`, and if the requested state is `approved_for_staging`, `approved_for_publication`, or `published` and lane is not `surface`, returns 400 with a message to use the approve route.
- **Exact location:** `apps/studio/app/api/proposals/[id]/route.ts` (PATCH handler). Fix: select `lane_type`, define `SURFACE_ONLY_STATES`, and reject with 400 when target state is surface-only and lane !== surface.

### Important

**I1. Lane guard not covered by automated tests**

- **What was tested:** Test suite for approve route and staging.
- **Steps:** Run `vitest run lib/__tests__/approve-route-transitions.test.ts lib/__tests__/staging-habitat-merge.test.ts`.
- **What happened:** All 49 tests pass. Approve-route tests exercise FSM and state resolution; they do not mock a proposal with lane_type medium/system and assert 400 for approve_for_staging/approve_for_publication.
- **What should have happened:** At least one test that a non-surface proposal receives 400 with a clear message when requesting staging or publication.
- **Likely cause:** Lane guard was added after or alongside FSM tests; no test was added for lane rejection.
- **Exact location:** `apps/studio/lib/__tests__/approve-route-transitions.test.ts` (no lane_type scenarios). Lane guard in `apps/studio/app/api/proposals/[id]/approve/route.ts` lines 72–78.

### Minor

**M1. proposal_outcome "skipped_ineligible" never set**

- **What was tested:** session-runner manageProposals when concept is ineligible.
- **Steps:** Run a session where the concept path is taken but eligibility.eligible is false (e.g. ineligible concept).
- **What happened:** Code does not set proposalOutcome when `!eligibility.eligible`; comment says "proposalOutcome stays null when no proposal path is taken for concept (ineligible)."
- **What should have happened:** Implementation report and trace semantics document proposal_outcome values including "skipped_ineligible"; trace would be clearer if we set proposalOutcome = "skipped_ineligible" when eligibility.eligible is false.
- **Likely cause:** Only explicit skip reasons (cap, rejected_archived) were wired; ineligible was left as "no proposal path."
- **Exact location:** `apps/studio/lib/session-runner.ts` around 1234–1238 (eligibility.eligible branch).

**M2. create-proposal allows interactive_module with lane_type medium**

- **What was tested:** create-proposal body handling.
- **Steps:** POST create-proposal with body `{ proposal_role: "interactive_module", lane_type: "medium", habitat_payload: { ... story_card } }`.
- **What happened:** API accepts; proposal is created with lane_type medium and proposal_role interactive_module.
- **What should have happened:** Canon says interactive user-facing habitat is surface. API could enforce "interactive_module ⇒ surface" or document that client must not pass lane_type for interactive proposals (current default is surface).
- **Likely cause:** create-proposal allows explicit lane_type override for flexibility; no semantic rule enforced for role vs lane.
- **Exact location:** `apps/studio/app/api/artifacts/[id]/create-proposal/route.ts` (body lane_type and proposal_role used independently).

---

## 4. Exact Repro Notes (Summary)

- **C1 (fixed):** Before fix: same steps yielded 200 and inconsistent state. After fix: PATCH with target state approved_for_staging (or approved_for_publication/published) for a medium/system proposal → 400 with message to use the approve route.
- **I1:** Run approve + staging tests; no test uses lane_type !== surface or asserts 400 for staging/public actions.
- **M1:** In session-runner, when eligibility.eligible is false, proposalOutcome remains null; trace proposal_outcome is null (not "skipped_ineligible").
- **M2:** POST create-proposal with proposal_role interactive_module and lane_type medium creates a medium proposal with interactive role (misclassification if interpreted as user-facing surface).

---

## 5. Architecture Trust Assessment

- **Does the surface path now feel trustworthy?**  
  Yes: creation, refresh, linkage, rejected guard, staging merge, and promotion are consistent. The PATCH bypass has been closed so both approve and PATCH enforce lane for surface-only states.

- **Do proposal lanes now behave like real semantic lanes, not just labels?**  
  Yes: both the approve route and PATCH reject non-surface proposals from moving to approved_for_staging, approved_for_publication, or published. No silent fallback.

- **Is interactive surface correctly classified?**  
  Yes by default: create-proposal defaults to surface; interactive_module + story_card creates a surface proposal and flows through staging and public correctly. Only if the client explicitly sends lane_type medium can an interactive proposal be misclassified (minor).

- **Is habitat public release semantics now clear enough?**  
  Yes: docs and approve route comment state that staging promotion is canonical and direct approve_for_publication is legacy/emergency. API behavior aligns (both paths only for surface).

- **Are any legacy paths still undermining clarity?**  
  Legacy "approve" (pending_review → approved) is kept for system proposals and is documented; it does not conflict with surface staging/public. The PATCH bypass has been closed.

---

## 6. Recommended Cleanup Pass

Tight, non-redesign cleanup to reach a stable, trustworthy state:

1. **PATCH lane guard (critical) — DONE**  
   Implemented in `apps/studio/app/api/proposals/[id]/route.ts`: select `lane_type`, reject with 400 when target state is `approved_for_staging`/`approved_for_publication`/`published` and lane is not surface.

2. **Lane guard test (important)**  
   Add a test in the approve-route test file (or a small integration test) that, for a proposal with `lane_type: "medium"`, POST approve with action `approve_for_staging` (and similarly `approve_for_publication`) returns 400 and does not change state. Prefer using the same test pattern as existing approve-route tests (e.g. mock Supabase or test the route with a test DB).

3. **Trace skipped_ineligible (minor)**  
   In session-runner, when `!eligibility.eligible` and the concept proposal path is the one that would have run, set `proposalOutcome = "skipped_ineligible"` (and persist in trace) so the trace matches the documented proposal_outcome semantics.

4. **create-proposal interactive lane (minor)**  
   Either document that for interactive_module the client must not set lane_type (or must set surface), or add a single rule: if `proposal_role === "interactive_module"` and body does not explicitly set lane_type to system, force lane_type to surface so interactive user-facing proposals cannot be created as medium by mistake.

No redesign or new features are recommended; the above suffices to close the lane bypass and align trace/docs with behavior.

---

## Success Condition Summary

| Question | Answer |
|----------|--------|
| Can we trust concept → proposal → staging → public for surface work? | **Yes**; approve route and PATCH both enforce lane for surface-only states. |
| Are medium/system proposals safely excluded from surface execution paths? | **Yes;** approve route and PATCH both reject non-surface from approved_for_staging / approved_for_publication / published. |
| Does the interactive surface proof point work end-to-end? | **Yes:** create-proposal (interactive_module + story_card) → approve for staging → staging preview → promote to public works; tests and code support it. |
| Is there only a small cleanup pass left, or is deeper rework needed? | **Small cleanup left:** add lane-guard test (important), optional trace + create-proposal tweaks (minor). No deeper rework required. |
