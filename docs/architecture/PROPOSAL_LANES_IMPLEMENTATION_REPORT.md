# Proposal Lanes — Implementation Report

**Pass:** Approved proposal-lanes direction.  
**Goal:** concept → proposal → decision lane → resolution; surface-only staging/public; tightened surface semantics; one interactive surface proof point.

---

## 1. Executive summary

### What changed
- **Lane model:** `lane_type` supports surface | medium | system (DB enum + guards). Only surface proposals can be approved for staging or publication; medium/system return 400 with a clear message.
- **Surface pipeline:** Proposal refresh now updates `artifact_id` and `target_id` so linkage stays correct. Rejected/archived guard prevents creating a new habitat proposal when the same artifact already has a rejected/archived proposal. Session trace stores `proposal_outcome` (created | updated | skipped_cap | skipped_ineligible | skipped_rejected_archived). Legacy action `approve` is reachable from pending_review (FSM updated).
- **Lane guards:** Approve route rejects approve_for_staging and approve_for_publication for non-surface proposals.
- **Interactive surface:** `story_card` block (title + cards), `interactive_module` proposal role, create-proposal accepts role + habitat_payload for staging, public-site and habitat-staging render story_card (staging: minimal block preview).
- **Public release semantics:** Staging promotion is documented as the canonical path for habitat; direct-to-public approve_for_publication is legacy/emergency only (Option A).

### Why this scope
- Keeps the field model lean (lane_type + proposal_role; no new workflow state table).
- Fixes the known trust issues (refresh linkage, rejected guard, trace outcome) without redesigning the runner.
- One small interactive proof point (story_card) proves the path without building a framework.
- Option A (staging canonical) reduces ambiguity and keeps a single primary path to public.

### What became clearer/safer
- **Staging/public eligibility** is surface-only in code and docs.
- **Proposal ↔ artifact** stays truthful when content is refreshed.
- **Why no proposal** is visible in trace (skipped_cap, skipped_ineligible, skipped_rejected_archived).
- **How to publish habitat:** prefer Push staging to public; direct approve_for_publication is legacy.

---

## 2. Concrete implementation report (by file)

| File / area | What changed | Why | Kind |
|-------------|--------------|-----|------|
| **supabase/migrations/20260315000001_approval_lane_medium.sql** | Add value `medium` to enum `approval_lane` (idempotent DO block). Comment on type. | Lane model requires surface | medium | system. | Structural (schema) |
| **apps/studio/lib/governance-rules.ts** | Allow transition pending_review → approved. | Legacy action "approve" was unreachable; preserve as deprecated compatibility. | Semantic |
| **apps/studio/app/api/proposals/[id]/approve/route.ts** | (1) Lane guard: if action is approve_for_staging or approve_for_publication and lane !== surface, return 400. (2) Comment: public release semantics — staging promotion canonical, direct-to-public legacy. | Only surface can enter staging/public; document Option A. | Semantic + doc |
| **apps/studio/lib/session-runner.ts** | (1) When updating existing habitat proposal, also update artifact_id and target_id. (2) Before insert, check same artifact + rejected/archived; if found, skip and set proposalOutcome skipped_rejected_archived. (3) Add proposalOutcome to state and set created | updated | skipped_cap | skipped_ineligible | skipped_rejected_archived. (4) Persist proposal_outcome in session trace. (5) Extension proposals use lane_type 'medium'. | Linkage consistency; canon guard; observability; lane semantics. | Semantic |
| **apps/studio/lib/habitat-payload.ts** | Add StoryCardBlockSchema (id, type: story_card, title, cards[]). Add to HabitatBlockSchema union. Export StoryCardBlock type. | Minimal interactive surface block. | Structural (schema) |
| **apps/studio/app/api/artifacts/[id]/create-proposal/route.ts** | Accept body.proposal_role (default habitat_layout). Accept body.habitat_payload for staging_habitat; validate and store. Support lane_type medium. | Interactive and other roles; staging payload from API. | Semantic |
| **apps/public-site/app/page.tsx** | Add story_card to HabitatBlock type and ALLOWED_BLOCK_TYPES. Render branch: title + list of cards (label, content). | Public render for story_card. | UI/rendering |
| **apps/habitat-staging/app/page.tsx** | Add isBlock helper. Add StagingBlockPreview component (hero, text, story_card, other). Render StagingBlockPreview when composition page has blocks (in BeforeAfterPreview). | Staging shows block preview including story_card. | UI/rendering |
| **docs/02_runtime/concept_to_proposal_flow.md** | §5.1 Proposal resolution lanes: table surface | medium | system, rules, implementation note. | Canon alignment. | Docs |
| **docs/architecture/proposal_resolution_lanes_canon.md** | New doc: lanes, classification rule, interactive modules, public release semantics (Option A), implementation. | Single canon reference for lanes. | Docs |
| **docs/architecture/proposal_lanes_implementation_plan.md** | Full plan, gap assessment, ontology, example flows, deferred work. | Planning and reference. | Docs |
| **creative_session trace** | Field proposal_outcome (string | null) in trace object. | Operators can see why a proposal was or wasn’t created. | Semantic |

---

## 3. Final lane model (implemented)

| Concept | Implemented meaning |
|---------|----------------------|
| **lane_type** | Enum: surface | medium | system (DB: approval_lane). Set at proposal creation. |
| **proposal_role** | Functional role: habitat_layout, avatar_candidate, identity_name, interactive_module, medium_extension, … Used for filtering and display. |
| **Staging eligibility** | Only surface proposals. Approve route rejects approve_for_staging for non-surface (400). |
| **Public eligibility** | Only surface proposals. Approve route rejects approve_for_publication for non-surface (400). Promote (staging → public) only affects content from staging_habitat_content (source proposals are surface). |
| **Medium resolution** | Stored as proposal; no staging/public. Resolves to roadmap/spec/later implementation (reserved; no UI in this pass). Extension proposals use lane_type = medium. |
| **System resolution** | Stored as proposal; no staging/public. Resolves to governance review/later implementation (reserved; no UI in this pass). Must not be auto-executed by runner. |

---

## 4. Interactive proof point (how it works now)

| Step | How it works in the repo |
|------|---------------------------|
| **Proposed** | POST /api/artifacts/[id]/create-proposal with body: proposal_role: "interactive_module", target_surface: "staging_habitat", habitat_payload: { version: 1, page: "home", blocks: [{ id: "sc_1", type: "story_card", title: "...", cards: [{ label: "A", content: "..." }] }] }. Creates proposal (lane_type surface, proposal_role interactive_module, habitat_payload_json stored). |
| **Renders in staging** | After approve_for_staging, payload is merged into staging_habitat_content. Habitat-staging fetches GET /api/staging/composition. StagingBlockPreview renders blocks: for story_card shows title + list of card labels/contents (and hero/text for other blocks). |
| **Reaches public** | (1) Push staging to public: POST /api/staging/promote copies staging_habitat_content → public_habitat_content; source proposals advanced to published. (2) Or single-proposal approve_for_publication (legacy) writes that proposal’s payload to public. Public-site fetches habitat content and renders story_card in the block loop (title + cards). |

---

## 5. Deferred work

| Implemented this pass | Reserved for later |
|----------------------|--------------------|
| Lane model (surface | medium | system); lane guards; surface hardening (refresh linkage, rejected guard, proposal_outcome); story_card block + interactive_module role; create-proposal role/payload; staging block preview; public release semantics (Option A) in docs and route comment. | Runner-originated medium proposals; runner-originated system proposals; medium-lane resolution UI (roadmap/spec); system-lane resolution UI (governance review); generalized interactive medium/framework; deeper registries or automation; full click-to-reveal or other interactive UX. |

---

## 6. QA checklist

Use this to verify the pass.

- [ ] **Surface proposal creation**  
  Run a session that produces a concept artifact (eligible). Confirm a proposal is created with lane_type surface, proposal_role habitat_layout. Check session trace has proposal_outcome "created" (or "updated" if refresh path).

- [ ] **Surface proposal refresh behavior**  
  With one existing active habitat proposal, run another session that produces an eligible concept. Confirm the existing proposal is updated (title/summary/payload) and that artifact_id and target_id are updated to the new artifact. Trace proposal_outcome "updated".

- [ ] **Rejected/archived guard behavior**  
  Create a proposal for a concept artifact, then reject or archive it. Run a new session that produces the same artifact (or create-proposal again for same artifact). Confirm no new proposal is created for that artifact; trace should show proposal_outcome "skipped_rejected_archived" (or equivalent) or no new proposal row.

- [ ] **Lane guard behavior**  
  Create or use a proposal with lane_type medium (e.g. extension proposal). Call POST approve with action approve_for_staging or approve_for_publication. Confirm 400 with message that only surface proposals can be approved for staging/public.

- [ ] **Interactive surface proposal rendering in staging**  
  Create a proposal via create-proposal with proposal_role interactive_module and habitat_payload containing a story_card block. Approve for staging. Open habitat-staging; confirm the composition shows the page and that the "Block preview" section shows the story_card (title + cards). 

- [ ] **Promotion to public**  
  With staging composition containing at least one page (e.g. from an approved proposal), call POST /api/staging/promote. Confirm public_habitat_content is updated and source proposals advance to published. If the composition included a story_card, confirm public-site renders it.

- [ ] **Legacy approve behavior**  
  For a pending_review proposal, call POST approve with action "approve". Confirm the proposal transitions to state "approved" (FSM allows it). No staging merge or public write for that action.

- [ ] **Direct-to-public (legacy path)**  
  For a surface habitat proposal, call POST approve with action approve_for_publication. Confirm the proposal’s payload is written to public_habitat_content and proposal state advances to published. Documented as legacy/emergency; staging promotion remains the canonical path.
