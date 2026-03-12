# Studio & Review UI — Redesign Plan

**Purpose:** Reevaluate Studio and Review interfaces so they reflect the current proposal-lanes architecture, reduce confusion, and are mobile-friendly.  
**Type:** Product/interface architecture (not visual polish only).  
**Canon:** concept → proposal → decision lane → resolution; surface → staging → public; medium/system governed differently.

---

## A. Audit of the current interface

### What still reflects an outdated mental model

| Area | Current state | Problem |
|------|----------------|--------|
| **Proposals as one class** | Surface review is split by *target type* (name, habitat, avatar); no explicit “lane” language. System is a separate section. Medium has **no UI** at all. | Operators see “Surface” and “System” as two buckets, not three lanes (surface / medium / system). Medium proposals (e.g. extensions) exist in the backend but are invisible in the UI. |
| **Habitat copy** | Surface page: “Approve for publication when ready.” Habitat page: “Review staging habitat and public habitat proposals.” | Doesn’t state that **staging → push to public** is the canonical path and direct-to-public is legacy. Encourages “approve for publication” as default. |
| **Concept → proposal** | Concepts page shows artifact approval state; “Turn into proposal” creates a proposal with no indication of lane or role. Link says “View proposal” → goes to Surface home, not to the specific proposal. | Concept cards don’t show: lane (surface), role (habitat_layout / interactive_module), or outcome (created / updated / skipped). Single “View proposal” doesn’t teach staging/public path. |
| **Artifact vs proposal** | Home links to “Artifacts” and “Surface” as siblings. Concepts page links to “Artifact review” and “Surface.” | Conflates *artifact approval* (images, text, etc.) with *proposal review* (surface/medium/system). Two different governance models look like one. |
| **Staging semantics** | Staging composition card says “Public updates only when you push” and “Push staging to public.” | Good. Missing: one line that “This is the main way to publish habitat; direct approve-for-publication is for exceptions only.” |
| **Approval language** | Habitat: “Approve for staging” / “Approve for publication” / “Approve.” System: “Approve (record only).” | Surface actions are correct but not framed as “this goes to staging” vs “this goes straight to public (legacy).” System doesn’t say “Governance only — not a content publish.” |

### Where the interface is too flat or generic

- **Home nav:** One row of links (Session, Source, Identity, Concepts, Artifacts, Surface, System, Runtime). No hierarchy; “Surface” doesn’t say “content/staging/public” and “System” doesn’t say “governance.”
- **Surface landing:** Three equal cards (Name, Habitat, Avatar). No explanation that these are *surface lane* proposals that can go to staging/public. No mention of *interactive* (e.g. story_card / interactive_module).
- **Habitat list:** Filters by `proposal_role=habitat_layout` only. **Interactive_module** proposals (e.g. story_card) never appear in the habitat review list; they would need a different URL or an “All surface habitat” filter including both roles.
- **Proposal cards:** Habitat shows Role / Target / State as inline text. No visual lane indicator (e.g. “Surface” pill). State is raw (e.g. `approved_for_staging`) with no short explanation (“In staging” / “Ready to push”).
- **Concepts:** List is artifact-centric (approval state, “Turn into proposal”). No “proposal outcome” or “lane” on the card; no link to the specific proposal record.

### Where approval semantics are unclear

- **Habitat pending:** Primary button text varies (Approve for staging / Approve for publication / Approve) by target_type and payload. Correct but dense; no helper text like “This will merge into staging” or “This will publish directly (legacy).”
- **Habitat approved_for_staging/staged:** “Approve for publication” is shown; no distinction between “Publish via staging (recommended)” and “Publish this proposal only (legacy).” No note that normal flow is “Push staging to public” from the composition card.
- **System:** “Approve (record only)” is good; page copy could say explicitly “This does not publish content; it records your decision for governance.”
- **Artifacts:** Artifact approval (approve / approve_for_publication) is separate from proposal approval; the difference is not explained on the page.

### Where lane differences are not visible enough

- **Lane_type is never shown in the UI.** Surface pages filter by lane_type=surface but don’t label the queue as “Surface.” System page doesn’t say “System lane — governance only.”
- **Medium lane:** No screen. Extension/medium proposals are created by the runner but have no review queue, so operators can’t see “capability proposals → roadmap/spec.”
- **Navigation:** “Surface” and “System” are link labels; they don’t teach “surface = stageable content, system = governance.”

### Where concept/proposal branching could be represented better

- **Concepts page:** No “proposal outcome” (created / updated / skipped_cap / skipped_rejected_archived). Session trace has proposal_outcome but session detail page doesn’t show it. Concept card doesn’t show “→ Surface proposal” or “→ No proposal (skipped).”
- **“View proposal”** goes to /review/surface; user must then find habitat/name/avatar. Should deep-link to the proposal (e.g. surface/habitat with highlight or a proposal detail URL if added).
- **No proposal detail view.** All actions are from list cards; no dedicated page for one proposal with full metadata, payload preview, and staging/public context.

### Where staging/public/governance distinctions are confusing

- **Staging composition** appears on the habitat page only. Operators reviewing “Surface” from the hub don’t see staging until they open Habitat. So “staging” feels tied to habitat only (correct) but the *canonical path* (staging → public) isn’t stated on the Surface hub.
- **Live on public site** (live-habitat-pages) lists slugs and “Clear from public”; no link to “View staging” or “Push staging to public” in that block.
- **Governance:** System says “you implement changes” but doesn’t say “this lane does not touch staging or public content.”

### Where mobile experience is weak

- **No viewport or responsive layout.** globals.css has no breakpoints; body padding 1rem everywhere.
- **Home nav:** `display: flex; flexWrap: wrap` — wraps but stays dense; no hamburger or collapsed nav.
- **Surface landing:** `gridTemplateColumns: "repeat(3, minmax(0, 1fr))"` — three columns on all widths; on small screens cards are cramped.
- **Habitat proposal list:** Cards are full-width but buttons and metadata are inline/flex-wrap; on narrow screens actions can wrap awkwardly. No touch-friendly hit areas.
- **Staging composition / Live pages:** Same; no stacking or reflow for narrow viewports.
- **No touch targets:** Buttons use small padding (0.25rem 0.5rem, fontSize 0.8rem); not 44px min for touch.
- **Session detail / Concepts / Artifacts:** Single column but no max-width or padding tuned for mobile; no collapsible sections.

### Where there is too much density, duplication, or unnecessary complexity

- **Breadcrumb / back links** are ad hoc: “← Twin”, “← Surface”, “· Session · Artifact review · Surface”. Inconsistent and repeated on every page.
- **Two “approve” entry points:** Artifact review (artifact approval) and Surface (proposal approval). Same word “approve” for different semantics; no shared glossary in UI.
- **Habitat state + actions:** Many states (pending_review, approved_for_staging, staged, approved_for_publication, published) with different button sets; all on one card. Correct but dense; could use a small state diagram or grouped actions.
- **Mock layout data** appears when count is 0; adds conditional UI and “mock” labels that complicate the real flow.

---

## B. Proposed interface model

### Primary screens and their jobs

| Screen | Job | Reflects |
|--------|-----|----------|
| **Studio Home** | Entry: run session, open sources/identity, and **Review** (by lane). Latest artifacts as recap. | Single “Review” that leads to lane-aware review. |
| **Review (hub)** | Choose lane: **Surface** (content → staging/public), **Medium** (capabilities → roadmap), **System** (governance). Each with one-line explanation. | Three lanes, not two sections. |
| **Surface review** | Hub for surface queues: Name, Habitat (+ interactive), Avatar. Short copy: “These can go to staging and then public.” Link to Staging composition. | Surface = stageable content; staging is first-class. |
| **Surface → Habitat** | List surface habitat proposals (layout + interactive). Staging composition at top; then “Push staging to public”; then proposal list with clear state labels and staging-vs-public actions. | Canonical path visible; direct-to-public labeled legacy. |
| **Surface → Name / Avatar** | Unchanged in structure; add lane label “Surface” and one-line outcome (e.g. “Applies to identity name” / “Sets embodiment direction”). | Same as now but with lane clarity. |
| **Medium review** | Single list: medium proposals (e.g. extension). State: pending_review, approved, archived. Actions: Approve (record for roadmap), Reject, Archive. Copy: “These are not stageable; they go to roadmap/spec.” | Medium = capability; no staging/public. |
| **System review** | As now; add lane label “System” and copy: “Governance only. Does not publish content.” | System = governance; not content publish. |
| **Concepts** | List concept artifacts; each card shows proposal outcome if any (Created proposal / Updated proposal / Not eligible / Skipped) and link “View proposal” → deep link to correct surface queue or proposal. Optionally show “Surface” lane and role. | Concept → proposal → lane visible. |
| **Staging composition** | Keep on Habitat page; add one line: “Preferred way to publish habitat: approve proposals for staging, then push here.” | Canonical path in copy. |
| **Artifact review** | Keep separate; add short line: “Artifact approval (images, text). For concept-based content that becomes habitat, use Surface → Habitat.” | Distinguish artifact approval from proposal lanes. |

### How concepts, proposals, staging, and public relate visually

- **Concepts page:** Each concept card: title, summary, artifact state, and a **proposal line**: “Surface proposal: Created” with link to “View in Surface → Habitat” (or Name/Avatar), or “No proposal” with reason (e.g. “Skipped — cap” / “Skipped — previously rejected”). No raw proposal_record_id; use “View in Surface” that goes to the right queue (and later to proposal detail if we add it).
- **Surface hub:** Three cards (Name, Habitat, Avatar). Subtitle: “Content that can go to staging and public.” Below or beside Habitat: “Staging: [summary]. Push to public from Habitat page.”
- **Habitat page:** Top: “Staging composition” (current). One line: “Publishing habitat: approve for staging → push below. Direct publish is for exceptions only.” Then “Push staging to public.” Then “Live on public site.” Then tabs + proposal list. Each proposal card: optional “Surface” pill; state as human phrase (“Pending” / “In staging” / “Staged” / “Approved for publication” / “Published”); actions grouped (Stage / Publish / Reject/Archive).
- **Public:** “Live on public site” stays; no need for a separate “public” screen. Staging composition + push button is the gate to public.

### How lane_type appears in the UI

- **Review hub:** Three options: “Surface — content for staging and public”, “Medium — capabilities for roadmap”, “System — governance”.
- **Surface pages:** Optional small label “Surface” (pill or text) in the page title or above the list so operators see the lane.
- **Medium page:** Title “Medium proposals” + “Capabilities and extensions. Not stageable; resolve to roadmap/spec.”
- **System page:** Title “System proposals” + “Governance and platform. Not a content publish.”
- **Proposal cards:** In Surface lists, lane is implicit (we only show surface). In a future unified “All proposals” view, show a lane pill (Surface / Medium / System). For this pass, no need for “All proposals”; keep lane-separated screens.

### How proposal_role appears in the UI

- **Habitat list:** Today it filters to `habitat_layout` only. **Change:** either (a) include `interactive_module` in the same list (e.g. API call `proposal_role=habitat_layout,interactive_module` or no role filter for surface habitat) so layout and interactive proposals appear together, or (b) add a sub-tab “Layout” vs “Interactive” with the same actions. Prefer (a) with a **role badge** on the card: “Layout” or “Interactive” so operators see the difference without two queues.
- **Name / Avatar:** Role is implicit (identity_name, avatar_candidate). No need to show role text.
- **Medium:** When we add the page, show role (e.g. medium_extension) as secondary text.
- **System:** Already shows target_type; optional role if we ever add it.

### How approval actions differ by lane

- **Surface (Habitat):** Primary: “Approve for staging” (concept) or “Approve for publication” (when applicable). Secondary: Reject, Archive. Once in staging: “Approve for publication” (with tooltip or helper: “Or use ‘Push staging to public’ above for all staged content.”). Label direct approve_for_publication as “Publish directly (legacy)” in UI or docs in the page.
- **Surface (Name/Avatar):** Keep “Apply name” / “Approve for staging” etc. Add one line: “Surface: applies to identity.”
- **Medium:** “Approve (record for roadmap)” and “Reject” / “Archive.” No staging or publish buttons.
- **System:** “Approve (record only)” and “Archive.” Copy: “Records your decision; does not publish content.”

---

## C. Review interface (surface / medium / system)

### Surface review

- **Goal:** Make it obvious this is the **content/surface path** and that items **can go to staging** and then **affect public** via push.
- **Hub:** “Surface proposals — name, habitat, avatar. These can be approved for staging (habitat) or applied (name/avatar). Staging is the main path to public for habitat.”
- **Habitat:** Staging composition first; “Push staging to public” prominent. Proposal list with states: Pending → In staging → Staged → Approved for publication → Published. Buttons: “Approve for staging” (when pending) with short hint “Merges into staging”; “Approve for publication” when staged, with hint “Or push staging to public above.”
- **Name/Avatar:** Same as now; add “Surface” in title or subtitle so the lane is clear.

### Medium review

- **Goal:** Make it obvious these are **capability proposals**, **not stageable or publishable**; they belong to **roadmap/spec/later implementation**.
- **Page:** “Medium proposals.” Subtitle: “New capabilities (e.g. extensions). Not content; not stageable. Resolve to roadmap or spec.”
- **List:** proposal_role (e.g. medium_extension), title, summary, state. Actions: “Approve (record for roadmap)”, “Reject”, “Archive.” No staging or publish controls.
- **API:** GET /api/proposals?lane_type=medium&proposal_state=… already supported; add page and list component.

### System review

- **Goal:** Make it obvious these affect **runtime/platform/governance**, are **human-governed**, and are **not a content publish action**.
- **Page:** “System proposals.” Subtitle: “Platform and governance. Approving records your decision; it does not publish content.”
- **List:** Keep “Approve (record only)”; ensure copy on the page states “Governance only — not content publish.”

---

## D. Concept branching clarity

- **Concepts page (concept artifacts):** For each concept, after “Turn into proposal” / “View proposal”, show:
  - If proposal exists: “Surface proposal” (or “Medium” if we ever create medium from concept) + state (e.g. “Pending”) + link “View in Surface → Habitat” (or Name/Avatar) that goes to the right review queue. Use existing eligibility API; add optional proposal_record_id and lane/role in eligibility or a small “proposal summary” API so the card can show “Created” / “Updated” and the link.
  - If no proposal / ineligible: “Not eligible” or “Skipped” with reason (from trace: skipped_cap, skipped_rejected_archived). Session detail could show proposal_outcome in trace so operators can see it per session.
- **Concept card:** One line: “Proposal: [Created | Updated | Pending | Not eligible] — View in Surface → Habitat” (or Name/Avatar) so the user doesn’t need to open raw internals.
- **Session detail:** If trace includes proposal_outcome, display it in the session view (e.g. “Proposal outcome: created”) so the operator can correlate session run with proposal creation/update/skip.

---

## E. Mobile-friendly redesign guidance

### Navigation (small screens)

- **Home:** Replace single row of links with a **stacked list** or **collapsible “Menu”** (e.g. a button that toggles a drawer or accordion). Priority order: Start/Session, Concepts, Review (then expand to Surface / Medium / System), Source, Identity, Artifacts, Runtime. So “Review” is one entry that expands to lanes.
- **Breadcrumb:** Use a single back link or “Studio > Review > Surface > Habitat” as text or a compact dropdown on small screens.

### Density and layout

- **Surface hub:** On viewport &lt; 768px, use **single column**: Name card, then Habitat card, then Avatar card. Full width, stacked. Same for Review hub (Surface, Medium, System as three stacked cards).
- **Proposal lists:** Cards full width; **stack metadata** (title, then role/state on second line, then actions on third). Increase padding to 1rem and button min-height to 44px for touch.
- **Staging composition / Live pages:** Stack vertically; “Push staging to public” button full width on mobile. Promotion history in a `<details>` (already is).

### Actions

- **Primary action** per card: one clear button (e.g. “Approve for staging”). Secondary (Reject, Archive) as text links or a “…” menu to avoid clutter. Ensure **min 44px height** for primary buttons.
- **Tabs (Pending / Approved / Archived):** Keep as links; on mobile consider a `<select>` or segmented control so they don’t wrap awkwardly.

### Proposal detail and staging/public

- **Proposal detail:** If we add a detail page, use a **drawer or full-page** on mobile with close button; content stacked (title, summary, state, payload summary, actions at bottom).
- **Staging vs public:** On Habitat page, keep “Staging composition” and “Live on public site” as two stacked sections; no side-by-side on small screens.

### Core pages

- **Studio home:** Stack: nav (collapsible or list), Runtime panel, Metabolism, Latest artifacts. No multi-column.
- **Review hub:** Stack: Surface card, Medium card, System card.
- **Surface hub:** Stack: Name, Habitat, Avatar cards.
- **Habitat:** Stack: Staging composition, Push button, Live pages, Tabs, Proposal list. Use **accordions** optionally for “Promotion history” and “Live on public” if we want to shorten the scroll.
- **Concepts / Artifacts / Session:** Single column; consider **accordion per card** (expand to see actions) on mobile to reduce scroll, or keep one card per row with larger touch targets.

### Responsive implementation

- **CSS:** Add a small set of breakpoints (e.g. 600px, 768px). Use `min-width` media queries: below 768px, switch grids to 1 column; reduce horizontal padding; increase tap targets. Use `clamp()` or max-width for readable line length.
- **No separate “mobile site”;** same pages with responsive layout and one collapsible nav or stacked menu for small screens.

---

## F. Concrete redesign plan

### 1. Executive summary

- **Outdated:** (1) Proposals feel like two buckets (Surface vs System) with no Medium; (2) staging/public canonical path not stated in UI; (3) concept → proposal outcome and lane not visible; (4) habitat list hides interactive_module; (5) approval semantics (staging vs direct publish, governance vs content) under-explained; (6) no mobile strategy.
- **Change:** (1) Add Review hub with three lanes (Surface, Medium, System) and clear copy. (2) Add Medium review page and list. (3) Surface/Habitat: state staging as canonical path; include interactive_module in habitat list with role badge. (4) Concepts: show proposal outcome and deep link to Surface queue. (5) System/Medium: add lane copy (“not content publish” / “roadmap”). (6) Responsive: stacked layouts, nav collapse, 44px touch targets, breakpoints.
- **Stay:** Artifact review (separate from proposals). Session, Source, Identity, Runtime. Core approval flows (approve_for_staging, approve_for_publication, apply_name, approve_avatar, approve for system). Staging composition and Push to public placement. General information architecture of “Review by lane.”

### 2. UI architecture proposal (summary)

- **Top-level:** Studio Home → Session, Source, Identity, **Review** (hub), Concepts, Artifacts, Runtime.
- **Review hub:** Three lanes: Surface (content → staging/public), Medium (capabilities → roadmap), System (governance). Each links to its queue(s).
- **Surface:** Hub (Name, Habitat, Avatar) → Name / Habitat / Avatar pages. Habitat page: Staging composition + Push + Live + proposals (layout + interactive with role badge).
- **Medium:** Single page: list of medium proposals; Approve (record for roadmap), Reject, Archive.
- **System:** Current page + lane copy.
- **Concepts:** Cards show proposal outcome and “View in Surface → Habitat” (or Name/Avatar) with deep link.
- **Staging/public:** Staging composition on Habitat with one-line canonical-path copy; “Push staging to public” as primary publish path.

### 3. Review UX proposal (summary)

- **Surface:** “Content for staging and public.” Habitat: “Approve for staging” → “Push staging to public” preferred; “Approve for publication” for single proposal labeled as legacy option. State labels: Pending, In staging, Staged, Approved for publication, Published.
- **Medium:** “Capabilities for roadmap.” Actions: Approve (record), Reject, Archive. No staging/publish.
- **System:** “Governance only.” Approve (record only), Archive. Explicit “Does not publish content.”

### 4. Mobile UX proposal (summary)

- **Nav:** Collapsible menu or stacked links; Review as one entry expanding to Surface / Medium / System.
- **Hubs:** Single column &lt; 768px (Surface hub, Review hub).
- **Lists:** Full-width cards; stacked metadata; primary button 44px min; secondaries as links or menu.
- **Staging/Live:** Stacked sections; full-width Push button.
- **Breakpoints:** 600px, 768px; no separate mobile app.

### 5. Implementation plan (current repo)

| Item | Files / areas | Change |
|------|----------------|--------|
| **Review hub** | New: `app/review/page.tsx` (or redirect and make `app/review/surface/page.tsx` one of three). Prefer: `app/review/page.tsx` with three cards (Surface, Medium, System) and copy. | New page; links to /review/surface, /review/medium, /review/system. |
| **Medium review** | New: `app/review/medium/page.tsx`, `app/review/medium/medium-proposal-list.tsx` (client). Reuse pattern from system-proposal-list. | New route and list; GET proposals?lane_type=medium; actions Approve (approve), Reject (PATCH rejected), Archive (PATCH archived). |
| **Surface hub copy** | `app/review/surface/page.tsx` | Add subtitle: “Content that can go to staging and public.” Optional link “Staging summary” to #staging or to habitat. |
| **Habitat list: interactive + role** | `app/review/surface/habitat/habitat-proposal-list.tsx`, API call | Fetch with proposal_role=habitat_layout,interactive_module (or no role filter for target_type concept, public_habitat_proposal). Show role badge “Layout” / “Interactive” on card. |
| **Habitat: canonical path copy** | `app/review/surface/habitat/page.tsx` or staging-composition-card | One line above or in staging card: “Preferred way to publish: approve for staging, then push below. Direct publish is for exceptions only.” |
| **Habitat: state labels** | habitat-proposal-list.tsx | Map proposal_state to short label: In staging, Staged, Approved for publication, Published; keep Pending. Optionally add “Publish directly (legacy)” near approve_for_publication when used. |
| **System copy** | `app/review/system/page.tsx` | Add: “Governance only. Approving does not publish content.” |
| **Concepts: proposal outcome + link** | `app/concepts/page.tsx`, concept-proposal-actions.tsx, optional API | Eligibility or new small endpoint returns proposal_record_id, lane_type, proposal_state, target_type so card can show “Surface proposal: Pending” and link to /review/surface/habitat?highlight=id or /review/surface/name (etc.). If no proposal, show “Not eligible” or “Skipped” from eligibility.reason. |
| **Session: proposal_outcome** | `app/sessions/[id]/page.tsx` | If creative_session has trace with proposal_outcome, display it in session view. |
| **Home nav** | `app/page.tsx` | Add “Review” as single link to /review; in Review hub show Surface, Medium, System. Optionally keep direct links to Surface/System on home for speed. |
| **Responsive layout** | `app/globals.css`, surface/page.tsx, review (new) page, habitat page | Breakpoints 600px, 768px. Surface hub grid: 1 col &lt; 768px. Review hub: 1 col &lt; 768px. Body padding and max-width for readability. |
| **Nav collapse / stack** | `app/page.tsx`, `app/layout.tsx` or shared Nav component | On small viewport, show “Menu” button or stacked nav; expand to Surface / Medium / System under Review. |
| **Touch targets** | All review list components (habitat, name, avatar, system, medium) | Buttons: min-height 44px, padding 0.5rem 0.75rem. Secondary actions as links or grouped. |

**Order of work (suggested):**

1. **Phase 1 (lane and copy):** Review hub with three lanes; Medium review page and list; Surface/System/Habitat copy updates (canonical path, governance only, role badge + interactive in habitat list). No mobile yet.
2. **Phase 2 (concept + session):** Concepts proposal outcome and deep link; session detail proposal_outcome in trace.
3. **Phase 3 (mobile):** Responsive breakpoints, stacked layouts, nav collapse, touch targets.

**Defer:** Full proposal detail page (single-proposal view); “All proposals” cross-lane view; formal design system or component library. Mock layout removal can be a separate cleanup.

### 6. Recommended next implementation pass

**Scope:** Phase 1 only — lane clarity and Medium review, plus Habitat staging copy and interactive_module in list.

**Concrete steps:**

1. Add **Review hub** at `app/review/page.tsx`: three cards (Surface, Medium, System) with one-line descriptions and links to /review/surface, /review/medium, /review/system.
2. Add **Medium review**: `app/review/medium/page.tsx` and a client list component that fetches `lane_type=medium`, shows Approve (record for roadmap) / Reject / Archive. Reuse system list pattern.
3. Update **Surface hub** copy: “Content that can go to staging and public.”
4. Update **Habitat**: (a) Staging composition card or page: add one line that staging → push is the preferred way to publish and direct publish is legacy. (b) Habitat list: include proposals with proposal_role=interactive_module (e.g. API `proposal_role=habitat_layout,interactive_module` or no role filter for surface habitat); show “Layout” / “Interactive” badge on each card.
5. Update **System** page copy: “Governance only. Approving does not publish content.”
6. Home: add link “Review” to /review (and optionally keep Surface/System links for backward compatibility).

**Out of scope for this pass:** Concept outcome deep link, session trace proposal_outcome, mobile responsive, proposal detail page.

**Success:** Operator sees three lanes on Review; Medium proposals are reviewable; Habitat shows staging as canonical and includes interactive proposals with a role badge; System states governance only.

### 7. Wireframe-level descriptions

**Review hub (/review):**

- Title: “Review”
- Subtitle: “Proposals by lane.”
- Three cards, stacked on narrow screen, grid on wide:
  - **Surface** — “Content for staging and public. Name, habitat, avatar.” Link: “Surface →”
  - **Medium** — “Capabilities and extensions. Roadmap/spec; not stageable.” Link: “Medium →”
  - **System** — “Governance and platform. Not a content publish.” Link: “System →”
- Footer: “← Studio”

**Surface hub (/review/surface):**

- Title: “Surface proposals”
- Subtitle: “Content that can go to staging and public.”
- Three cards (stack on mobile): Name (→ /review/surface/name), Habitat (→ /review/surface/habitat), Avatar (→ /review/surface/avatar). Optional: “Staging: manage from Habitat page.”
- “← Review”

**Habitat page (/review/surface/habitat):**

- “← Surface”
- **Staging composition** card: title “Staging composition”; line: “Preferred way to publish: approve proposals for staging, then push below. Direct publish is for exceptions only.” List of pages; button “Push staging to public”; details “Promotion history.”
- **Live on public site** (unchanged).
- Tabs: Pending | Approved | Archived.
- **Proposal list:** Each card: optional “Surface” pill; title; summary; **Role badge:** “Layout” or “Interactive”; State: “Pending” / “In staging” / “Staged” / “Approved for publication” / “Published”; line “Payload: present | none · In staging | On public | Not yet”; actions (Approve for staging, Reject, Ignore when pending; then Approve for publication, Mark as staged, Archive/Reject as allowed). On mobile: stack title, then role+state, then actions (one primary, secondaries as links).

**Medium page (/review/medium):**

- “← Review”
- Title: “Medium proposals”
- Subtitle: “Capabilities and extensions. Not stageable; resolve to roadmap or spec.”
- Tabs: Pending | Approved | Archived.
- List: card with title, summary, role (e.g. medium_extension), state, date. Actions: “Approve (record for roadmap)”, “Reject”, “Archive” when pending.

**System page (/review/system):**

- Same as now; add under title: “Governance only. Approving records your decision; it does not publish content.”

**Concepts card (future phase):**

- Below artifact info: line “Proposal: Surface — Created” or “Updated” or “Not eligible (cap)” with link “View in Surface → Habitat”. If no proposal, “Proposal: —” or “Not eligible (reason).”

---

## Success criteria (recap)

1. Studio UI better reflects the real architecture (three lanes, staging canonical, governance vs content).
2. Review UI makes lane-specific approval behavior obvious (Surface: staging/public; Medium: roadmap; System: governance only).
3. Concepts and proposals feel more legible and traceable (outcome and deep link in a follow-up pass).
4. Staging/public/governance distinctions are clearer (copy and placement).
5. Interface becomes meaningfully more mobile-friendly (Phase 3: responsive, nav, touch targets).
6. Implementation path is realistic and high-value (Phase 1 first: hub, Medium, copy, Habitat interactive + staging copy).

This plan is scoped to the current repo, avoids a full visual overhaul, and keeps structure and semantics ahead of styling. The recommended next pass is Phase 1 as above.
