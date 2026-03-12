# Proposal Resolution Lanes — Implementation Plan

**Objective:** Strengthen concept → proposal → staging → public and introduce explicit proposal resolution lanes (surface | medium | system) with one minimal interactive surface test.

---

## 1. Executive Summary

### What we changed
- **Lane semantics:** Only **surface** proposals can be approved for staging or publication. **Medium** (e.g. extension/capability) and **system** (governance/platform) proposals are expressible and stored but cannot enter staging/public; they resolve to roadmap or governance review (reserved).
- **DB:** Added `medium` to `approval_lane` enum; extension proposals use `lane_type = 'medium'`.
- **Approve route:** Guard: `approve_for_staging` and `approve_for_publication` are rejected for non-surface proposals with a clear error.
- **Surface pipeline hardened:** (1) When runner refreshes an existing habitat proposal, it now updates `artifact_id` and `target_id` so the proposal stays linked to the concept that supplied the content. (2) Legacy action `approve` is reachable from `pending_review` (FSM updated). (3) "Not already rejected" guard: runner skips creating a new habitat proposal if the same artifact already has a proposal in rejected or archived. (4) Trace records `proposal_outcome` (created | updated | skipped_cap | skipped_ineligible | skipped_rejected_archived).
- **Interactive surface:** New habitat block type `story_card` (minimal branching/card). New proposal role `interactive_module`. Create-proposal API accepts `proposal_role` and full `habitat_payload` for staging; payload validated and stored. Public and staging apps render `story_card`. No new runner path for generating interactive proposals in this pass; manual/create-proposal is the entry point.

### Why
- So the repo does not imply "all proposals go to staging/public."
- So surface work remains the only path that can merge to staging and promote to public.
- So medium (new capability) and system (platform/governance) are clearly separated and reserved for future workflow.
- So interactive user-facing modules are clearly surface (stageable) and one concrete block proves the path.

### Architectural risks reduced
- **Semantic leak:** Approve route no longer allows medium/system proposals to be "approved for staging/public"; they are blocked by lane check.
- **Traceability:** Proposal refresh now keeps artifact_id/target_id in sync with content.
- **Canon drift:** Rejected/archived guard and FSM legacy fix align code with documented behavior.

### What remains for later
- Full medium-lane workflow (roadmap/spec UI, runner originating medium proposals).
- Full system-lane workflow (governance review UI, runner originating system proposals).
- Runner-originated interactive_module proposals (e.g. concept → interactive payload).
- Broader interactive block types or framework.

---

## 2. Current-vs-Target Gap Assessment

| Area | Already aligns | Corrected | Deferred |
|------|----------------|-----------|----------|
| **Lane semantics** | lane_type exists (surface/system); concept and avatar are surface | Added medium; only surface can staging/publish; extension → medium | Medium/system resolution UI |
| **Staging/public** | Merge-on-approve, promote, composition | Approve route rejects non-surface for staging/public actions | — |
| **Proposal identity** | artifact_id, target_id on insert | Refresh now updates artifact_id/target_id | — |
| **FSM** | PROPOSAL_STATE_TRANSITIONS central | pending_review → approved allowed for legacy "approve" | — |
| **Rejected guard** | — | Runner checks same-artifact rejected/archived before insert | — |
| **Trace** | proposal_id, decision_summary | proposal_outcome added to trace | — |
| **Interactive** | — | story_card block, interactive_module role, renderers, create-proposal | Runner-generated interactive proposals |

---

## 3. Recommended Minimal Ontology

**Lean model: `lane_type` + `proposal_role` (no new column).**

- **lane_type** (approval_lane): `surface` | `medium` | `system`.
  - **surface** — Resolves via staging/public. Only this lane can be approved_for_staging or approve_for_publication (merge to staging, write to public).
  - **medium** — Resolves to roadmap/specification/later implementation. Cannot enter staging/public.
  - **system** — Resolves to human governance review/later implementation. Cannot enter staging/public; must not be auto-executed by runner.

- **proposal_role** (functional role): `habitat_layout` | `avatar_candidate` | `identity_name` | `interactive_module` | `medium_extension` | …  
  Used for filtering, display, and routing. No need for a separate `resolution_path` column; resolution is derived from lane_type.

- **proposal_type** (kind of change): `layout` | `component` | `navigation` | `workflow` | `avatar` | `extension` | …  
  Kept as-is for nuance; lane_type + proposal_role are the primary classifiers.

**Decision rule (canon):**
- If the user experiences it directly in habitat/public → **surface**.
- If it creates a new reusable expressive capability → **medium**.
- If it changes platform/runtime/governance behavior → **system**.

---

## 4. Concrete Implementation Plan (Files Touched)

| File / area | Change |
|-------------|--------|
| **supabase/migrations/** | New migration: add value `'medium'` to enum `approval_lane`. |
| **apps/studio/app/api/proposals/[id]/approve/route.ts** | At top of handler: if action is approve_for_staging or approve_for_publication and proposal.lane_type is not 'surface', return 400 with message that only surface proposals can be approved for staging/public. |
| **apps/studio/lib/governance-rules.ts** | Add `"approved"` to allowed transitions from `pending_review` (so legacy "approve" works). |
| **apps/studio/lib/session-runner.ts** | (1) When updating existing habitat proposal, also set artifact_id and target_id to current artifact. (2) Before inserting new habitat proposal, query for existing proposal same artifact_id + lane_type surface + proposal_role habitat_layout + state in (rejected, archived); if any, skip insert and set proposal_outcome skipped_rejected_archived. (3) Set proposal_outcome in state (created | updated | skipped_cap | skipped_ineligible | skipped_rejected_archived) and persist in trace. (4) Extension proposals: use lane_type `'medium'` instead of `'system'`. |
| **apps/studio/lib/habitat-payload.ts** | Add StoryCardBlockSchema (id, type: story_card, title, cards: array of { label, content }); add to HabitatBlockSchema union; export type. |
| **apps/studio/app/api/artifacts/[id]/create-proposal/route.ts** | Accept optional body.proposal_role (default habitat_layout). When target_surface is staging_habitat, accept body.habitat_payload; validate and store as habitat_payload_json. Set proposal_role on insert. |
| **apps/public-site/app/page.tsx** | Add story_card to HabitatBlock type and ALLOWED_BLOCK_TYPES; add render branch for story_card (simple card list or click-to-reveal). |
| **apps/habitat-staging** | Add story_card to composition page renderer if it has a block renderer (or reuse same pattern as public). |
| **packages/core/src/types.ts** | Ensure ProposalRecord has proposal_type; add proposal_role if missing. |
| **docs/02_runtime/concept_to_proposal_flow.md** | Add section on proposal resolution lanes (surface / medium / system) and resolution paths. |
| **docs/architecture/** | Add short canon patch: only surface → staging/public; medium → roadmap; system → governance; interactive modules are surface. |
| **creative_session trace** | Store proposal_outcome in session trace (e.g. trace.proposal_outcome). |

---

## 5. Example Flows (Intended Behavior)

### Surface proposal (habitat_layout)
1. Concept artifact created → eligible → runner creates proposal (lane_type=surface, proposal_role=habitat_layout).
2. Harvey approves for staging → merge into staging_habitat_content; proposal_state → approved_for_staging.
3. Harvey promotes staging to public → public_habitat_content updated; proposal_state → published.

### Interactive surface proposal (interactive_module)
1. Harvey (or future runner) creates proposal via POST /api/artifacts/[id]/create-proposal with proposal_role=interactive_module and habitat_payload containing a story_card block.
2. Same as above: approve for staging → merge; promote → public. Staging and public render story_card block.

### Medium proposal (e.g. medium_extension)
1. Runner creates proposal (lane_type=medium, proposal_role=medium_extension). No staging merge.
2. Harvey cannot use approve_for_staging or approve_for_publication; route returns 400 "Only surface lane proposals can be approved for staging or publication."
3. Resolution path (reserved): roadmap/specification/later implementation. No UI in this pass.

### System proposal (future)
1. Proposal with lane_type=system (e.g. change review thresholds). No staging merge, no auto-execute.
2. Same 400 for approve_for_staging / approve_for_publication.
3. Resolution path (reserved): human governance review and later implementation.

---

## 7. Example flows (intended behavior)

See §5 above for surface, interactive, medium, and system example flows.

## 8. Deferred work

- **Done this pass:** Lane guard, surface hardening (refresh linkage, FSM legacy, rejected guard, trace outcome), story_card block + interactive_module role + create-proposal + public renderer, medium enum + extension reclassification, docs/canon.
- **Later:** Medium-lane resolution UI (roadmap/spec); system-lane resolution UI (governance review); runner-originated interactive_module proposals; additional interactive block types; runner-originated system proposals; full interactive block UX (e.g. click-to-reveal) in public/staging.
