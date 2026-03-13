# Studio UI Architecture Audit (Read-Only)

**Date:** 2025-03-13  
**Purpose:** Document how the current Studio UI maps to the Twin system architecture (Runtime → Proposal → Governance → Staging → Promotion → Public Snapshot).  
**Constraint:** Analysis only; no code or UI changes.

**Reference:** `docs/05_build/IMPLEMENTATION_CHECKLIST.md` — Twin Operating Model: detect → decide → compose → record → serve.

---

## Summary

The Studio UI is **mixed**: it exposes all pipeline layers (Runtime, Proposal/Governance, Staging, Promotion, Public-related) but organizes them by **task and lane** (Session, Review by lane, Staging review, Habitat page) rather than by a single visible pipeline. Navigation is flat (home nav links to Session, Source, Identity, Concepts, Artifacts, Review, Runtime) and does not present the flow Runtime → Proposal → Governance → Staging → Promotion → Public as a single diagram or stepped layout. Staging and promotion are clearly present on the Surface → Habitat page (Staging composition card, Push staging to public, Promotion output). Proposal review is lane-based (Surface / Medium / System) and reads from `proposal_record`; transitions go through governance helpers. Studio does **not** show a “live twin” preview that reads from `habitat_snapshot`; it shows “Promotion output” from `public_habitat_content`. There are no identified violations of the Implementation Checklist (no direct snapshot mutation by Studio, no governance bypass, no staging-as-public-truth); the main gaps are **clarity** (pipeline not visually dominant) and **no snapshot-backed public preview** inside Studio.

---

## 1. Studio UI Surfaces

Primary entry points and locations:

| Surface | Location |
|--------|----------|
| **Studio homepage** | `apps/studio/app/page.tsx` |
| **Session start** | `apps/studio/app/session/page.tsx` (link from home: “Start”) |
| **Runtime panel (home)** | `apps/studio/app/components/runtime-panel.tsx` — mode, always-on, last run |
| **Runtime debug page** | `apps/studio/app/runtime/page.tsx` — state, trace, deliberation, continuity, timeline |
| **Metabolism panel (home)** | `apps/studio/app/components/metabolism-panel.tsx` — runtime state payload |
| **Review hub** | `apps/studio/app/review/page.tsx` — lane cards (Surface, Medium, System) |
| **Surface hub** | `apps/studio/app/review/surface/page.tsx` — Name, Habitat, Avatar |
| **Habitat proposal review** | `apps/studio/app/review/surface/habitat/page.tsx` — staging card, promotion output, proposal list |
| **Staging composition card** | `apps/studio/app/review/surface/habitat/staging-composition-card.tsx` — staging pages + “Push staging to public” |
| **Promotion output (live-habitat-pages)** | `apps/studio/app/review/surface/habitat/live-habitat-pages.tsx` — slugs in `public_habitat_content` + Clear |
| **Habitat proposal list** | `apps/studio/app/review/surface/habitat/habitat-proposal-list.tsx` — proposals by view (Pending / Approved / Archived) |
| **Staging review page** | `apps/studio/app/review/staging/page.tsx` → `staging-review-client.tsx` — combined buckets, actions from `/api/staging/review` |
| **Staging preview** | `apps/studio/app/review/staging/preview/page.tsx` — renders staging habitat from `staging_habitat_content` |
| **Proposal detail** | `apps/studio/app/review/proposals/[id]/page.tsx` + `proposal-inspection-client.tsx` — single proposal, approve/PATCH |
| **Name / Avatar / System / Medium lists** | `apps/studio/app/review/surface/name/`, `avatar/`, `apps/studio/app/review/system/`, `apps/studio/app/review/medium/` — proposal lists + actions |
| **Artifacts review** | `apps/studio/app/review/artifacts/page.tsx` — artifact approval (separate from proposal lanes) |
| **Concepts** | `apps/studio/app/concepts/page.tsx` — concepts + “Turn into proposal” |
| **Source / Identity** | `apps/studio/app/source/page.tsx`, `apps/studio/app/identity/page.tsx` |
| **Sessions list/detail** | `apps/studio/app/sessions/page.tsx`, `apps/studio/app/sessions/[id]/page.tsx` |

---

## 2. Architecture Mapping

Mapping of Studio UI surfaces to architecture layers and data sources:

| Studio UI surface | Code location | Layer | Data source / API |
|-------------------|---------------|--------|--------------------|
| Runtime panel (config) | `app/components/runtime-panel.tsx` | Runtime | `GET/PATCH /api/runtime/config` → runtime_config |
| Metabolism panel | `app/components/metabolism-panel.tsx` | Runtime | `GET /api/runtime/state` → creative_state_snapshot, artifact, proposal_record, runtime_config, etc. |
| Runtime debug page | `app/runtime/page.tsx` | Runtime | `getRuntimeStatePayload`, `getRuntimeTracePayload`, `getRuntimeDeliberationPayload`, `getRuntimeContinuityPayload`, `getSessionContinuityTimeline` → creative_session, deliberation_trace, proposal_record, artifact, trajectory_review |
| Review hub (counts) | `app/review/page.tsx` | Proposal / Governance | `proposal_record` (counts by lane_type) |
| Surface hub (counts) | `app/review/surface/page.tsx` | Proposal | `proposal_record` (surface count) |
| Habitat / Name / Avatar / System / Medium proposal lists | `app/review/surface/habitat/habitat-proposal-list.tsx`, name-proposal-list, avatar-proposal-list, system-proposal-list, medium-proposal-list | Proposal + Governance | `GET /api/proposals` → `proposal_record`; actions → `POST /api/proposals/[id]/approve`, `PATCH /api/proposals/[id]` (governance-validated) |
| Proposal detail | `app/review/proposals/[id]/page.tsx`, proposal-inspection-client.tsx | Proposal + Governance | `proposal_record` (single); approve/PATCH via governance |
| Staging composition card | `app/review/surface/habitat/staging-composition-card.tsx` | Staging + Promotion | `GET /api/staging/composition` → `staging_habitat_content`; `GET /api/staging/promote/history` → `habitat_promotion_record`; `POST /api/staging/promote` → promotion |
| Staging review client | `app/review/staging/staging-review-client.tsx` | Staging + Proposal + Governance | `GET /api/staging/review` → `proposal_record` + `staging_habitat_content`; actions via staging proposal action → governance |
| Staging preview | `app/review/staging/preview/page.tsx` | Staging | `staging_habitat_content` (read), artifact (for preview) |
| Push staging to public button | `staging-composition-card.tsx` | Promotion | `POST /api/staging/promote` → `promoteStagingToPublic` (lib) |
| Promotion output (live-habitat-pages) | `app/review/surface/habitat/live-habitat-pages.tsx` | Post-promotion write (not Serving) | `GET /api/habitat-content/live` → `public_habitat_content`; Clear → `POST /api/habitat-content/clear` → `public_habitat_content` |
| Public serving (what public site sees) | Not in Studio UI | Public Snapshot | `GET /api/public/habitat-content` (used by **public-site** app) → `habitat_snapshot` only. Studio does not render this. |

**Summary of data flow:**

- **Runtime:** runtime_config, creative_state_snapshot, creative_session, deliberation_trace, artifact, proposal_record (read for state/trace).
- **Proposal / Governance:** proposal_record (list, get, update state); all state changes via approve route or PATCH, which use `canTransitionProposalState` / proposal-governance.
- **Staging:** staging_habitat_content (read by composition, staging review, staging preview); writes to staging only via approve_for_staging path (mergeHabitatProposalIntoStaging in lib).
- **Promotion:** POST /api/staging/promote → staging_habitat_content (read) → public_habitat_content (upsert), habitat_snapshot (insert new row), proposal_record (update to published), habitat_promotion_record (insert).
- **Public:** Public-site reads habitat_snapshot via Studio’s `/api/public/habitat-content`. Studio shows “Promotion output” from public_habitat_content, not snapshot-backed “live twin.”

---

## 3. Current UI Model

The interface is **mixed** (neither purely timeline nor purely pipeline).

- **Pipeline-like elements:**  
  - Surface → Habitat page orders: Staging composition → Promotion output → Proposal list. So “staging → promotion → output” is visible on one page.  
  - Review is lane-based (Surface / Medium / System), and Surface sub-pages (Name, Habitat, Avatar) separate proposal types.  
  - “Push staging to public” is the single promotion control; it runs the canonical promotion path (new snapshot, no direct snapshot edit).

- **Not pipeline-like:**  
  - Home does not present a single flow (e.g. Runtime → Proposals → Governance → Staging → Promotion → Public).  
  - Navigation is flat: Session, Source, Identity, Concepts, Artifacts, Review, Runtime are siblings.  
  - Runtime appears both on home (Runtime panel, Metabolism panel) and on a separate Runtime debug page; “Detection” is not labeled as the first stage of the pipeline.  
  - Staging appears only after drilling into Review → Surface → Habitat (and on Review → Staging). So “Composition” is not a top-level concept.  
  - There is no “Public” panel that shows what the public site serves (habitat_snapshot); only “Promotion output” (public_habitat_content).

- **Timeline-like elements:**  
  - Runtime debug page shows session timeline, trace, continuity (time-ordered events).  
  - Promotion history is a list of past promotions (time-ordered).  
  - Proposal lists are ordered by created_at.  
  So there is a strong “list of events / records over time” feel alongside the “review by lane” and “staging → push” flow.

**Conclusion:** The UI is **mixed**: pipeline semantics exist (especially on the Habitat page and in promotion), but the overall navigation and framing are task/lane-based and timeline-like, not a single pipeline diagram.

---

## 4. “Previous Reviews” and Governance History

There is no UI panel literally named “Previous reviews.” The following represent review- and history-related surfaces:

- **Proposal lists (Pending / Approved / Archived):**  
  - **Where:** Habitat, Name, Avatar, System, Medium proposal list components.  
  - **Read from:** `GET /api/proposals` → `proposal_record` (filtered by lane_type, target_type, proposal_state).  
  - **What it is:** Current proposal state and metadata (proposal_state, title, summary, etc.). Each row is a proposal; the state reflects the outcome of governance (e.g. pending_review → approved_for_staging → staged → published). So this is **proposal state / governance outcome**, not a separate “review event” log.

- **Promotion history (in Staging composition card):**  
  - **Where:** `StagingCompositionCard` → details “Promotion history.”  
  - **Read from:** `GET /api/staging/promote/history` → `habitat_promotion_record` (id, promoted_at, promoted_by, slugs_updated).  
  - **What it is:** **History of promotion steps** (when staging was pushed to public), not per-proposal review events.

- **Proposal detail page:**  
  - **Where:** `/review/proposals/[id]`.  
  - **Read from:** `proposal_record` (single row) + artifact (if linked).  
  - **What it is:** One proposal’s current state and metadata; actions (approve, PATCH state) are governance transitions. So it’s **one proposal’s governance state**, not a list of “previous reviews.”

So:

- **Proposal history** = proposal_record rows and their states (governance decisions are encoded in proposal_state).  
- **Governance decisions** = same; transitions are done via approve/PATCH and validated by governance helpers.  
- **Runtime observations** = not labeled as “reviews”; they appear as runtime state, trace, and session timeline on the Runtime page.

There is no separate “review event” or “audit log” table surfaced in the UI; “previous reviews” effectively means “proposals and their current (or past) state” plus “promotion history.”

---

## 5. Staging Visibility

**Where staging is exposed:**

- **Staging composition card** (Surface → Habitat):  
  - **Read:** `GET /api/staging/composition` → `staging_habitat_content` (slug, title, body, payload_json, source_proposal_id, updated_at).  
  - **Write:** None from this component. Staging is written when a proposal is approved for staging (approve route calls `mergeHabitatProposalIntoStaging` → writes/upserts `staging_habitat_content`).

- **Staging review page** (`/review/staging`):  
  - **Read:** `GET /api/staging/review` → `proposal_record` (non-terminal states) + `staging_habitat_content`; combined into buckets (habitat, artifacts, critiques, extensions, system) with allowed_actions from governance.  
  - **Write:** Actions go through `/api/staging/proposal/action` (proxy to PATCH proposals or POST approve); staging content is updated only when approve_for_staging is applied (server-side merge into staging_habitat_content).

- **Staging preview** (`/review/staging/preview`):  
  - **Read:** `staging_habitat_content` (by slug) + artifact (for approved/published artifacts used in preview).  
  - **Write:** None; read-only preview.

**How proposals enter staging:**

- Operator chooses “Approve for staging” (or equivalent action) on a habitat/concept proposal.  
- Request hits `POST /api/proposals/[id]/approve` with action `approve_for_staging`.  
- Server updates proposal_record to `approved_for_staging` and, for habitat proposals, calls `mergeHabitatProposalIntoStaging`, which upserts into `staging_habitat_content` by page slug.  
- So staging is **write-only from the approve path**; no UI directly edits staging_habitat_content rows.

---

## 6. Promotion Controls

- **UI control:** “Push staging to public” button in `StagingCompositionCard` (`app/review/surface/habitat/staging-composition-card.tsx`).  
- **API:** `POST /api/staging/promote` (auth required).  
- **Implementation:** `apps/studio/app/api/staging/promote/route.ts` → `promoteStagingToPublic(supabase, promotedBy)` in `lib/staging-composition.ts`.

**What promotion does (from code):**

1. **Read:** `staging_habitat_content` (all rows: slug, title, body, payload_json, source_proposal_id).  
2. **Write:**  
   - **public_habitat_content:** upsert one row per staging page (slug, title, body, payload_json, updated_at).  
   - **habitat_snapshot:** insert a **new** row via `createPublicHabitatSnapshot` (identity_id, parent_snapshot_id, payload_json, trait_summary, source_session_ids); existing snapshots are never updated.  
   - **proposal_record:** update selected proposals (those in promotable states and passing governance) to `proposal_state = 'published'`.  
   - **habitat_promotion_record:** insert one row (promoted_at, promoted_by, slugs_updated, snapshot_id, previous_public_snapshot_id).

So promotion **both** creates a new `habitat_snapshot` **and** updates `public_habitat_content`. Public-site serving uses only `habitat_snapshot` (via `/api/public/habitat-content`); Studio’s “Promotion output” panel uses `public_habitat_content`.

---

## 7. Public Preview

- **In Studio:** There is **no** “public preview” that reads from `habitat_snapshot`.  
- **Promotion output panel** (`LiveHabitatPages`):  
  - **API:** `GET /api/habitat-content/live`.  
  - **Table:** `public_habitat_content` (slug, title, body, payload_json).  
  - **Purpose:** Show what promotion wrote (list of slugs with content + Clear per slug). Copy states that “The public site serves from the latest snapshot,” i.e. it does not claim this list is what the public sees.

- **Public-site app** (outside Studio):  
  - **API:** Calls Studio’s `GET /api/public/habitat-content?page=...`.  
  - **Table:** `habitat_snapshot` only (latest public snapshot for active identity).  
  - So “what is live” for the twin is **habitat_snapshot**, consumed by the public-site, not by a Studio panel.

**Conclusion:** Studio does not expose a “live twin” preview backed by `habitat_snapshot`. It exposes “Promotion output” (public_habitat_content). A user cannot “instantly see what is live” inside Studio without opening the public site.

---

## 8. Architectural Risks

Checked against the Implementation Checklist:

- **Studio mutating habitat_snapshot directly:** Not found. Snapshots are only created in `createPublicHabitatSnapshot` during promotion; no UI or route updates or deletes snapshot rows.  
- **Studio bypassing governance:** Not found. Proposal state changes go through `POST /api/proposals/[id]/approve` or `PATCH /api/proposals/[id]`, which use `canTransitionProposalState` / proposal-governance. Staging proposal action route proxies to these.  
- **Studio publishing content without snapshot creation:** Promotion creates both public_habitat_content and a new habitat_snapshot. The separate “approve_for_publication” (direct publish) path writes to public_habitat_content and updates proposal state but does **not** create a new snapshot (documented as legacy). So content can be in public_habitat_content without a new snapshot until the next promotion; the **public-site** still reads only from habitat_snapshot, so “public truth” remains snapshot-backed. Risk is product/expectation (operators may think direct publish is “live”), not a new source of truth.  
- **Studio reading staging as public truth:** Not found. Staging is read only for staging composition and staging preview; public-site never reads staging.  
- **Runtime mutating public/staging:** Not in scope for this UI audit; runtime is documented to create proposals only.

No violations of the checklist rules were identified. The main nuance is that Studio shows “Promotion output” (public_habitat_content) rather than “what the public sees” (habitat_snapshot), which can confuse “what I promoted” with “what is live.”

---

## 9. UI Clarity

- **Can a user instantly tell what is live?**  
  **No.** Studio does not show “live” (habitat_snapshot-backed) content. It shows “Promotion output” (public_habitat_content). To see what is live, the user must open the public site or know that live = latest snapshot.

- **Can a user instantly tell what is staged?**  
  **Yes**, on Surface → Habitat (Staging composition card) and on Review → Staging (staging review + preview). Staging is clearly labeled and read from staging_habitat_content.

- **Can a user instantly tell what proposals exist?**  
  **Partly.** Review hub shows counts by lane; to see actual proposals the user goes to Surface (Name/Habitat/Avatar), Medium, or System. So “what proposals exist” is one click away but not on a single screen.

- **Can a user instantly tell what runtime detected?**  
  **Partly.** Home has Runtime panel (config, last run) and Metabolism panel (runtime state). Full “what runtime detected” (trace, sessions, continuity) is on the Runtime debug page. So detection is visible but split between home and a dedicated page.

**Why clarity suffers:** The pipeline (Runtime → Proposal → Governance → Staging → Promotion → Public) is not the primary navigation model. Labels and layout are task/lane-based; “Public” as the end state is not shown inside Studio (no snapshot-backed preview). So “what is live” and “where I am in the pipeline” are not immediately obvious.

---

## 10. Recommended Next Step (Do Not Implement)

To move the UI closer to a **pipeline model** without changing architecture or contracts:

1. **Make the pipeline explicit in navigation or layout:**  
   e.g. a single “Pipeline” or “Flow” view: Runtime → Proposals → Governance → Staging → Promotion → Public, with each step linking to the existing screens (Runtime page, Review, Staging card, Promote button, and optionally a new “Public” read-only view).

2. **Add a “Public snapshot” or “Live twin” read-only panel in Studio:**  
   Consume `GET /api/public/habitat-content` (or a dedicated read from `habitat_snapshot`) and display “What the public site serves” (or “Latest public snapshot”) so that “live” is unambiguous and distinct from “Promotion output.”

3. **Keep “Promotion output” as-is but label it clearly:**  
   Already labeled; optionally add a short line: “Not the public read path; public site serves from snapshot.”

4. **On the Review hub, add a one-line pipeline reminder:**  
   e.g. “Flow: Proposals → Staging → Push to public → Snapshot.” So even without a full pipeline layout, the intended order is visible.

5. **Avoid mixing “timeline” and “pipeline” on the same screen without labels:**  
   e.g. on Runtime page, add a small “Detection (Runtime)” label so it’s clear this is the first stage of the pipeline.

These steps would improve alignment with the architecture (detect → decide → compose → record → serve) without refactoring code, routes, proposal contracts, or snapshot logic.

---

*End of audit.*
