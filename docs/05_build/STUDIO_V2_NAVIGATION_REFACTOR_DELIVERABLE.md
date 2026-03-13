# Studio v2 Navigation Refactor — Deliverable

**Date:** 2025-03-13  
**Scope:** UI/navigation refactor to align Studio with the Twin pipeline. No backend or contract changes.

---

## Summary

Studio navigation and layout were refactored so the pipeline is visible and stage-based:

1. **Top-level navigation** is now pipeline-oriented: **Studio | Runtime | Proposals | Staging | Promotion | Live Twin**, with secondary links (Start session, Source, Identity, Concepts, Artifacts) and Sign out. This nav appears on every page via the root layout.

2. **Studio home** has a **Pipeline** section with five cards linking to Runtime, Proposals, Staging, Promotion, and Live Twin, plus the existing Runtime panel, Metabolism panel, latest artifacts, and Studio chat.

3. A **Live Twin** page was added at `/live-twin`. It is read-only and fetches from **`GET /api/public/habitat-content`**, which reads only from **`habitat_snapshot`** (the same public read path the public site uses). It does not read from staging or `public_habitat_content`.

4. Back links on the Review and Runtime pages were updated from "← Twin" to "← Studio" so they point to the Studio home.

Existing routes and behavior are unchanged; only navigation, layout, and the new Live Twin view were added or reorganized.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/studio/app/layout.tsx` | Added global header with `StudioNav` so every page shows the pipeline nav. |
| `apps/studio/app/page.tsx` | Replaced flat nav with pipeline overview (five cards); removed duplicate nav (now in layout); subtitle explains pipeline. |
| `apps/studio/app/components/studio-nav.tsx` | **New.** Pipeline nav: Studio, Runtime, Proposals, Staging, Promotion, Live Twin + Start session, Source, Identity, Concepts, Artifacts, Sign out. |
| `apps/studio/app/live-twin/page.tsx` | **New.** Live Twin page (read-only); uses snapshot-backed public API. |
| `apps/studio/app/live-twin/live-twin-client.tsx` | **New.** Client component that fetches `/api/public/habitat-content?page=home` and displays payload or "No snapshot yet." |
| `apps/studio/app/review/page.tsx` | Back link text: "← Twin" → "← Studio". |
| `apps/studio/app/runtime/page.tsx` | Back link: "← Twin Studio" → "← Studio". |

---

## Navigation Changes

**New top-level structure (in `StudioNav`):**

- **Studio** → `/` (Studio home)
- **Runtime** → `/runtime` (sessions, trace, state)
- **Proposals** → `/review` (review hub by lane: Surface, Medium, System)
- **Staging** → `/review/staging` (staging review and preview)
- **Promotion** → `/review/surface/habitat` (staging composition, Push staging to public, promotion history, promotion output)
- **Live Twin** → `/live-twin` (new; snapshot-backed read-only view)

Secondary links unchanged: Start session → `/session`, Source, Identity, Concepts, Artifacts, Sign out.

**Mapping from previous structure:**

| Previous | Now |
|----------|-----|
| Single flat nav on home (Twin, Start, Source, Identity, Session, Concepts, Artifacts, Review, Runtime) | Pipeline nav in layout: Studio, Runtime, Proposals, Staging, Promotion, Live Twin + secondary |
| Review → Surface / Medium / System | Proposals → same `/review` hub |
| Staging page, Surface/Habitat page | Staging → `/review/staging`; Promotion → `/review/surface/habitat` |
| No dedicated “what’s live” view | Live Twin → `/live-twin` (snapshot-backed) |

**Pipeline overview on Studio home:** Five cards (Runtime, Proposals, Staging, Promotion, Live Twin) with short descriptions and links, so the flow is visible from the dashboard.

---

## Live Twin Handling

- **Added:** A read-only **Live Twin** page at `/live-twin`.
- **Data source:** It calls **`GET /api/public/habitat-content?page=home`**. That API (in `apps/studio/app/api/public/habitat-content/route.ts`) reads **only** from **`habitat_snapshot`** (latest approved public snapshot for the active identity). It does **not** read from `staging_habitat_content` or `public_habitat_content`.
- **UI:** The page states that the source is `habitat_snapshot` (public read path) and that it is not staging or the promotion output table. If there is no snapshot, it shows "No snapshot yet" and explains that the public site uses fallback until a snapshot exists. If there is a payload, it shows the home page slug and a simple list of block types and key content.
- **Honest labeling:** The existing "Promotion output" panel (on the Habitat page) still reads from `public_habitat_content` and remains separate; it is not labeled as the live twin. Only the new Live Twin page is labeled as the snapshot-backed public view.

---

## Boundary Check

Explicit confirmation against the Implementation Checklist and task rules:

- **No new public source of truth.** Public truth remains the latest approved `habitat_snapshot`. The Live Twin page only *reads* via the existing public API; it does not introduce a new table or API for public content.
- **No governance bypass.** No changes to proposal state transitions, approve routes, or PATCH behavior. All governance helpers and legal transition logic are unchanged.
- **No runtime authority expansion.** Runtime still only proposes; no new ability to approve, publish, or write to staging/public. No changes to runtime routes or behavior.
- **No staging truth expansion.** Staging remains candidate-only. The Live Twin page does not read from staging; it reads from the snapshot-backed public API only. No staging table is used as a public source.
- **No promotion contract change.** Promotion still creates a new immutable snapshot row and does not modify existing snapshots. No changes to `POST /api/staging/promote` or `promoteStagingToPublic` logic.
- **Data flow preserved.** The pipeline (Runtime → Proposal → Governance → Staging → Promotion → Public Snapshot) is only made more visible in the UI; no stage is bypassed or merged in the backend.

---

## Deferred / Not Implemented

- **Backend or API changes:** No changes to proposal schema, FSM, staging merge, promotion semantics, or public API contracts.
- **Snapshot ID / created_at on Live Twin:** The public habitat-content API does not return snapshot id or created_at. The Live Twin page shows payload and source description only; adding snapshot metadata would require a small API or response extension and was left for a later change.
- **Rename of existing routes:** Routes such as `/review`, `/review/surface/habitat`, `/review/staging` are unchanged so existing links and bookmarks keep working. The *nav labels* (Proposals, Staging, Promotion) map to these URLs.
- **Heavy design system or component library:** Only minimal styling (existing patterns) was used; no new design system or large migration.
- **Conditional nav (e.g. hide on login):** The pipeline nav is shown on all pages, including login. Hiding it on auth pages can be done later if desired.

---

## Follow-up Recommendations

1. **Optional:** Extend the public habitat-content API (or add a small metadata endpoint) to return latest snapshot id and created_at so the Live Twin page can show "Snapshot ID: 42, Published: …".
2. **Optional:** Add a "Open public site" link on the Live Twin page (e.g. to `NEXT_PUBLIC_PUBLIC_SITE_URL` or similar) so operators can jump to the real public twin.
3. **Optional:** On the Promotion page (`/review/surface/habitat`), add a short line that "Live Twin (snapshot-backed) is at Live Twin in the top nav" so the distinction between Promotion output and Live Twin stays clear.

---

*End of deliverable.*
