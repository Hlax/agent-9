# Implementation & Studio Architecture Audit — Deliverable

**Date:** 2025-03-13  
**Scope:** (1) "Hello Twin!" public fallback change, (2) Studio interface hard audit, (3) Proposed ideal Studio interface.  
**Checklist:** `docs/05_build/IMPLEMENTATION_CHECKLIST.md` — constraints confirmed before implementation.

---

## Summary

- **Implemented:** The static fallback content shown by the public twin when no snapshot-backed habitat exists was updated from **"Hello Twin"** to **"Hello Twin!"** in `apps/public-site/app/page.tsx`. This is the only place the public site renders when `hasPayload` is false; the change is UI-only and does not touch runtime, proposal, governance, staging, promotion, or snapshot logic.
- **Analyzed:** The Studio application was audited for alignment with the Twin operating model (Runtime → Proposal → Governance → Staging → Promotion → Public Snapshot). The audit maps Studio’s interactions to each layer, identifies boundary risks and clarity issues, and proposes an ideal Studio interface that makes the pipeline visually obvious and reinforces boundaries.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/public-site/app/page.tsx` | Fallback heading text updated from `Hello Twin` to `Hello Twin!`. |
| `docs/05_build/IMPLEMENTATION_AND_STUDIO_AUDIT_DELIVERABLE.md` | New: this deliverable (implementation notes, audit, proposal, boundary check). |

No other files were modified. No changes were made to runtime logic, proposal contracts, snapshot schema, governance FSM, or new system layers.

---

## Implementation (Hello Twin! change)

### Where the fallback text lived

- **Location:** `apps/public-site/app/page.tsx`, in the default export `PublicHome`.
- **Logic:** The page fetches `getHabitatContent("home")` from the Studio public API (`/api/public/habitat-content?page=home`). That API resolves content from **habitat_snapshot** only (latest approved public snapshot for the active identity). When the API returns no valid payload (no identity, no snapshot, or empty payload), `hasPayload` is false.
- **Rendering:** When `hasPayload` is false, the page renders a single `<h1>` as the main content. That heading previously said "Hello Twin"; it now says "Hello Twin!". When `hasPayload` is true, the page renders `HabitatBlocks` from the snapshot payload; the fallback is not shown.

### How it was updated

- The literal inside the `<h1>` was changed from `Hello Twin` to `Hello Twin!` (one character added).
- No API, environment, or data source was changed. The public-site still reads habitat content only via the existing Studio public API, which reads only from `habitat_snapshot`.

### How the change respects the Implementation Checklist

- **Ownership (1):** The change is **Serving / Public** — it only affects the static fallback copy shown when no snapshot exists. It does not touch Detection, Decision, Composition, or History.
- **Contract (2):** No change to proposal contract, snapshot payload shape, proposal states, identity/snapshot lineage, or canonical truth table.
- **Public truth (3):** Public read path is unchanged. Public still resolves from `habitat_snapshot` when the API returns a payload; the fallback is used only when the API returns no payload. No reads from staging, proposal, or runtime tables.
- **Governance (4):** No proposal state changes or governance logic touched.
- **Runtime (5):** Runtime is not involved; no mutation of staging or public state by runtime.
- **Agent authority (6):** Not applicable; this is static fallback text.
- **Staging (7):** Staging is not involved.
- **Promotion (8):** Promotion logic and snapshot creation are unchanged.
- **Projection (9):** No projection tables used.
- **Schema (10):** No schema changes.
- **Test (11):** No contract touched that requires a new test; existing public page behavior (snapshot vs fallback) is unchanged except the fallback string.
- **Documentation (12):** No architecture change; this deliverable documents the change.
- **Module boundary (13):** Only the public-site app was edited; no cross-layer dependencies introduced.
- **Data flow (14):** No stage bypass. The fallback is strictly when no snapshot exists: `if snapshot exists → render snapshot habitat; else → render fallback "Hello Twin!"`.
- **Final gate (15):** Correct module ownership, no new public source of truth, no governance bypass, no runtime mutation of public/staging, no contract change, docs updated via this deliverable.

---

## Studio Architecture Audit

### 1. Current Studio architecture — layers Studio interacts with

| Layer | How Studio interacts | Key entry points |
|-------|----------------------|------------------|
| **Runtime** | Reads creative state, backlog, config; triggers cron session; reads trace. Does not mutate public or staging. | `GET /api/runtime/state`, `GET /api/runtime/trace`, cron session route, `RuntimePanel`, session start. |
| **Proposal** | Creates proposals (chat, create-proposal, artifact→proposal); reads proposal_record; updates proposal_state via governance-validated routes. | `POST /api/chat`, `POST /api/artifacts/[id]/create-proposal`, `GET /api/staging/proposals`, `GET /api/proposals/*`, `PATCH /api/proposals/[id]`, `POST /api/proposals/[id]/approve`, `POST /api/proposals/[id]/unpublish`, `POST /api/staging/proposal/action`. |
| **Governance** | All proposal state transitions go through `canTransitionProposalState` / `getProposalAuthority` in `proposal-governance` and artifact transitions through `governance-rules`. UI does not hardcode legal actions; allowed actions come from governance. | `proposal-governance.ts`, `governance-rules.ts`, approve route, unpublish route, staging proposal action route. |
| **Staging** | Reads staging composition (`staging_habitat_content`); merges approved habitat proposals into staging via `mergeHabitatProposalIntoStaging`; does not treat staging as public truth. | `GET /api/staging/composition`, `GET /api/staging/proposals`, `StagingCompositionCard`, `mergeHabitatProposalIntoStaging` on approve_for_staging. |
| **Promotion** | Human-only: `POST /api/staging/promote` calls `promoteStagingToPublic`, which copies staging → public_habitat_content, creates a **new** `habitat_snapshot` row, advances proposal states to published via governance. Does not modify existing snapshots. | `POST /api/staging/promote`, `staging-composition.promoteStagingToPublic`, `createPublicHabitatSnapshot`. |
| **Snapshot (public)** | **Read-only for public serving:** `GET /api/public/habitat-content` reads from `habitat_snapshot` only. Studio also has `GET /api/habitat-content/live`, which reads **public_habitat_content** (promotion output), labeled “Promotion output” in the UI to avoid confusion with what the public site serves. | Public read: `apps/studio/app/api/public/habitat-content/route.ts` → `habitat_snapshot`. Studio “live” list: "Promotion output" (api/habitat-content/live) → `public_habitat_content`. |

So: Studio correctly uses **habitat_snapshot** as the source for the public-facing API. It uses **public_habitat_content** only for (1) promotion writing and (2) Studio’s own “live” and “clear” admin UX, not for defining what the public site shows.

### 2. Boundary risks

- **Direct publish (approve_for_publication) writes to public_habitat_content:** The approve route can write a single proposal’s habitat payload directly to `public_habitat_content` and advance state to published. This is documented as legacy/emergency (e.g. one-off fix without full staging). It does **not** create a new `habitat_snapshot` row; only promotion does. So the **public-site** (which reads from `habitat_snapshot`) will not show that content until a promotion runs and snapshots the current public_habitat_content. **Risk:** Operators may expect “approve for publication” to be immediately visible on the public site; with the current public read path from snapshot only, it is not until promotion. This is a product/expectation alignment issue, not a change to the public truth rule (public still reads from snapshot).
- **Unpublish clears public_habitat_content:** Unpublish route clears a slug in `public_habitat_content` and rolls proposal state back. Snapshot history is not modified (promotion contract preserved). Acceptable for rollback; no new risk to “public truth” if public read path remains snapshot-only.
- **habitat-content/live reads public_habitat_content:** Addressed by renaming the Studio block to “Promotion output” and clarifying in the UI that this is content written by the promotion step (public_habitat_content); the public site serves from the latest snapshot. This avoids conflating promotion output with what the public sees.

No other boundary violations found: Studio does not mutate snapshots directly, does not bypass governance for transitions, and does not expose staging as the public source of truth to the public-site.

### 3. Clarity issues (interface mixes architecture layers)

- **Home nav is flat:** Session, Source, Identity, Concepts, Artifacts, Review, Runtime are siblings. The pipeline (Runtime → Proposal → Governance → Staging → Promotion → Public) is not visually represented; “Review” and “Runtime” do not convey “detect → decide → compose → record → serve.”
- **Artifact vs proposal approval:** “Artifacts” and “Review” (proposals by lane) look like parallel queues. The distinction (artifact approval vs proposal approval and staging/public path) is not explained on the home page, which can blur the two governance models.
- **Staging appears only under Surface → Habitat:** Staging composition and “Push staging to public” live on the habitat page. The Review hub does not show “Staging” or “Public” as explicit stages, so the flow “proposal → staging → promotion → public” is not obvious from the top level.
- **“Approve for publication” vs “Push staging to public”:** Both can lead to published state. The canonical path (staging → promote) vs direct approve_for_publication (legacy) is documented in code and in the habitat page copy but could be clearer in the UI (e.g. “Publish via staging (preferred)” vs “Publish this proposal only (legacy)”).
- **Medium lane:** Medium proposals exist in the backend but have no dedicated review screen, so “Medium” as a lane (capabilities → roadmap, not staging/public) is under-exposed.
- **Runtime panel on home:** Runtime state and “Latest artifacts” are on the same page as “Review” links without a clear “Detection” vs “Decision” vs “Composition” framing.

These are clarity and information-architecture issues, not violations of the module boundaries in code.

---

## Proposed Studio Interface

### Design goal

Make the Twin pipeline **visually obvious** and reinforce:

- **Runtime** → **Proposal** → **Governance** → **Staging** → **Promotion** → **Public**

with no stage bypass, and with clear separation: runtime does not mutate public; governance remains canonical; staging remains candidate-only; promotion creates new snapshots only.

### Suggested layout (conceptual)

- **Top bar:**  
  - **Public snapshot preview** — read-only indicator of “what the public sees” (e.g. link to public site or a small “Latest public snapshot” label). No edit actions here. Reinforces that Public is the end of the pipeline.

- **Left panel — Detection / Runtime:**  
  - Runtime signals, agent observations, creative state, session start, trace.  
  - Label: “Runtime” or “Detection” so it’s clear this is the input to proposals, not decision or composition.

- **Center panel — Composition / Staging:**  
  - Staging workspace: current staging composition (per-page candidate habitat).  
  - Actions: “Push staging to public” (promotion) only from here.  
  - Proposal list for surface (habitat/name/avatar) with state and **governance-allowed** actions only.  
  - Label: “Staging” or “Composition” so it’s clear this is candidate state, not public truth.

- **Right panel — Governance / Proposal review:**  
  - Proposal review by lane (Surface / Medium / System).  
  - For each proposal: state and only actions that pass `canTransitionProposalState` (or equivalent).  
  - No “approve” that bypasses governance; no direct snapshot edit.  
  - Optional: separate sub-areas for “Pending review” vs “In staging” vs “Ready to promote” to mirror the pipeline.

Alternative that keeps current navigation but adds pipeline clarity:

- **Single “Pipeline” or “Flow” view:** Horizontal or vertical strip: **Runtime** | **Proposals** | **Governance** | **Staging** | **Promotion** | **Public**, each as a clickable area that opens the relevant screen.  
- **Review hub** explicitly says: “Surface → staging → public; Medium/System → governance only.”  
- **Staging** page: “Candidate composition. Public updates only when you promote.”  
- **Promotion** action only on Staging (or a dedicated “Promotion” step), not as a default on every proposal card.

### Data flow and interaction model

- **Runtime:** Read-only for “what the agent sees”; session start triggers runtime; runtime creates **proposals** only (e.g. pending_review), does not write to staging or snapshot.
- **Proposals:** Created by runtime or by operator (e.g. “Turn into proposal”). Listed in Governance / Proposal review. State changes only via governance (e.g. `canTransitionProposalState`).
- **Governance:** All transitions and “approve” actions go through canonical helpers. UI only offers actions that governance allows. No hardcoded state transitions.
- **Staging:** Filled by “approve for staging” (merge into staging_habitat_content). Shown as “candidate composition.” No UI to edit snapshots from here; only “Push staging to public” (promotion).
- **Promotion:** Single explicit action (e.g. “Push staging to public”) that runs the canonical promotion path: copy staging → public_habitat_content, create **new** habitat_snapshot row, advance proposal states via governance. No “edit existing snapshot” or “publish single proposal” as the primary path; direct approve_for_publication can remain as a labeled legacy option.
- **Public:** Read-only in Studio (link to public site or “what’s live” from snapshot). No Studio control to mutate what the public sees except via Promotion.

This keeps: **Studio does not mutate snapshots directly; governance transitions remain canonical; staging remains candidate-only; runtime remains proposal-only.**

---

## Boundary Check

Explicit confirmation against the Implementation Checklist and task constraints:

- **No new public source of truth:** Public read path remains **habitat_snapshot** (via `/api/public/habitat-content`). The “Hello Twin!” change is fallback copy when no snapshot exists. No new table or API introduced as public truth.
- **No governance bypass:** No code change to approval or transition logic. Studio continues to use `canTransitionProposalState` and proposal governance for all state changes; the proposal and audit do not introduce any bypass.
- **No runtime authority expansion:** Runtime was not modified. Runtime still only creates proposals (e.g. pending_review); it does not approve, publish, or snapshot.
- **No staging truth expansion:** Staging is still candidate-only. The change does not make staging readable by the public site or treat staging as canonical. Public-site still reads only from the snapshot-backed API or fallback.
- **No promotion contract change:** Promotion still creates a **new** snapshot row and does not modify existing snapshots. The “Hello Twin!” update does not touch promotion or snapshot schema.

---

## Follow-up Recommendations

1. **Public read path vs public_habitat_content:** Document clearly in architecture docs that the **public-site** resolves content from `habitat_snapshot` only; `public_habitat_content` is written by promotion (and legacy approve_for_publication) but is not the public read source. Optionally add a short “Public serving” section to the staging pipeline or architecture map.
2. **Studio “Promotion output”:** Implemented. The block is now labeled “Promotion output,” with copy stating that it shows content written by the promotion step (public_habitat_content) and that the public site serves from the latest snapshot. Optional: add a separate “Latest snapshot” read from `habitat_snapshot` for consistency.
3. **Implement proposed Studio layout (or pipeline view):** Adopt a layout or “Pipeline” view that surfaces Runtime → Proposal → Governance → Staging → Promotion → Public explicitly, with staging as the single place to “Push to public” and with governance-gated actions only.
4. **Medium lane UI:** Add a Medium review screen so capability/extension proposals are visible and resolved as “roadmap/spec,” not staging/public, reducing confusion with surface.
5. **Copy and labels:** Add one-line explanations on Review hub and Habitat page: “Preferred path: approve for staging → push staging to public; direct publish is legacy.” Consider labeling “Publish directly (legacy)” for approve_for_publication where it appears in the UI.
6. **Reuse existing plan:** Align implementation with `docs/05_build/STUDIO_UI_REDESIGN_PLAN.md`, which already covers lane clarity, staging semantics, and approval language; this deliverable’s proposed layout adds the explicit pipeline visualization (Runtime → … → Public) on top of that plan.

---

*End of deliverable.*
