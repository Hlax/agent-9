# Next UI pass — operational clarity

Now that the architecture (Surface / Medium / System lanes, staging-first, concept branching) is visible in the Studio and review UI, the next pass should focus on **operational clarity**, not cosmetic changes.

---

## 1. Next pass: Proposal detail surface — implemented

**Goal:** Proposals today exist only as list cards. That will break down when proposals become complex. Operators need a **proposal inspection page**.

**Route:** `/review/proposals/[id]`

**Content (minimal, not fancy):**

- **Proposal**
  - Title
  - Lane
  - Role
  - State
  - Created
  - Source concept (artifact_id / link if available)
- **Payload preview** (e.g. habitat_payload_json summarized or key fields; no need for full WYSIWYG)
- **Actions**
  - Approve (lane-appropriate: staging, roadmap, record only)
  - Reject
  - Archive

**Purpose:** Single place to inspect one proposal and take actions without relying only on list cards. Keeps the current list-based flows; this is additive.

**Implementation:** Route `app/review/proposals/[id]/page.tsx` (server) and `proposal-inspection-client.tsx` (client). All proposal list cards (habitat, avatar, name, medium, system) include an "Inspect" link to `/review/proposals/[id]`. Header shows title, lane, role, state, created; then Lane section, Affects, Source (concept link), Payload preview (collapsible if large), and lane-appropriate actions.

---

## 2. After that: Concept intelligence

**Goal:** Concepts currently show “Eligible for surface proposal” or “View surface proposal”. They should eventually show **outcome** from the run/trace:

- Proposal created
- Proposal updated
- Skipped (ineligible)

**Depends on:** Trace/session storing and exposing `proposal_outcome` (created | updated | skipped_cap | skipped_ineligible | skipped_rejected_archived) so the concepts list or concept card can display it. The backend already sets this; the UI needs to consume it (e.g. from session trace or from an API that returns the latest proposal outcome for an artifact).

**Scope:** Show outcome on concept cards or in the concept → proposal action block. No full concept page redesign required for this step.

---

## 3. After that: Session insight

**Goal:** Operator sees the chain:

- **Session** → **Concept** → **Proposal** → **Outcome**

**Do not build this yet.** Document it as the follow-up after Concept Intelligence so that when we do Session Insight, we have a clear path: session detail (or session list) shows which concepts were produced, which became proposals, and what the outcome was (created / updated / skipped).

---

## Summary

| Pass | What | Status |
|------|------|--------|
| **Proposal detail surface** | `/review/proposals/[id]` — inspection + actions | Done |
| **Concept intelligence** | Outcome on concepts (created / updated / skipped) from trace | After proposal detail |
| **Session insight** | Session → Concept → Proposal → Outcome | Later; do not build yet |
