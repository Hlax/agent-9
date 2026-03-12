# Habitat branch / staging composition — architecture design

Design for an expanded habitat proposal and staging system that behaves like a **branch/workspace model**: proposals merge into a mutable staging composition; public updates only when a human promotes staging to public. No runner self-publish; governance and proposal FSM preserved.

---

## A. Architecture audit and current flow

### Current flow (end to end)

| Step | What happens today |
|------|---------------------|
| **Proposal creation** | Session runner (or Harvey) creates `proposal_record` with `habitat_payload_json`, `target_surface: staging_habitat`, `proposal_role: habitat_layout`. |
| **approve_for_staging** | POST `/api/proposals/[id]/approve` with `action: "approve_for_staging"` → only updates `proposal_record.proposal_state` to `approved_for_staging`. No write to a staging store. |
| **Staging API** | GET `/api/staging/proposals` returns proposal rows (including `habitat_payload_json`) where state in `approved_for_staging` \| `staged` \| … Staging app renders from this list. |
| **Habitat-staging render** | Reads GET `/api/staging/proposals`; shows “Layout payload” when present; no single coherent composition—multiple proposals can target the same page with no merge. |
| **approve_for_publication** | POST approve with `approve_for_publication` → for habitat/concept, writes **one proposal’s payload** to `public_habitat_content` (upsert by slug from payload.page). FSM → `approved_for_publication`. |
| **Public render** | Public site reads `public_habitat_content` (slug, title, body, payload_json). |

### What assumes “staging is just proposal rows”

- **GET /api/staging/proposals** returns a list of proposal records; the staging app treats that list as the source of truth. There is no “current staging composition” table.
- **approve_for_staging** has no side-effect that writes to any staging store; the only effect is FSM state change.
- **Conflict behavior**: If two approved proposals target the same page (e.g. both `page: "home"`), both appear in the list; the staging app has no rule for “which one wins” or how to merge.
- **Publication**: Today publication is **one proposal at a time**—approve_for_publication writes that proposal’s payload to `public_habitat_content`. There is no “push current staging as a whole” flow.

### Minimal robust architecture (target)

- **Staging composition**: A first-class store `staging_habitat_content` (one row per page/slug). Approved habitat proposals **merge** into this store when approved for staging (per-page replace: the approved proposal’s payload for that page becomes the staging content for that page). Provenance: each staging row records `source_proposal_id`(s) that last contributed.
- **Public composition**: Remains `public_habitat_content`. Updated only by a **promotion** action that copies the current staging composition (or a snapshot) to public.
- **Promotion event**: Table `habitat_promotion_record` (id, promoted_at, promoted_by, staging_snapshot_ref or summary, public_slugs_updated). Enables audit and optional rollback.
- **Provenance**: `staging_habitat_content.source_proposal_id` (single UUID) or `source_proposal_ids` (array) so we can trace staged content back to the proposal(s).

---

## B. New domain model

### Tables (new or extended)

| Concept | Implementation | Rationale |
|---------|----------------|-----------|
| **Staging habitat composition** | New table `staging_habitat_content` (slug PK, title, body, payload_json, source_proposal_id UUID, updated_at). One row per page. | Mirrors public_habitat_content; mutable as proposals are approved; single source of truth for “current staging.” |
| **Staging branch head** | No separate “branch” row. The staging composition *is* the branch head (current state of staging). Optional: add `staging_composition_version` integer or updated_at for “version” for promotion snapshot. | Simpler than a separate branch pointer; we can snapshot by time or by copying rows. |
| **Public composition** | Existing `public_habitat_content`. No schema change. | Public remains the promoted snapshot. |
| **Promotion event** | New table `habitat_promotion_record` (id, promoted_at, promoted_by, source_staging_updated_at or snapshot JSON, slugs_updated text[], created_at). | Audit trail and “what was pushed when.” |
| **Composition node provenance** | Column `staging_habitat_content.source_proposal_id` (UUID FK to proposal_record). For per-page replace, one proposal per page; optional future: `source_proposal_ids` if we support block-level merge. | Trace staged page back to the proposal that supplied it. |

**Tradeoff (snapshot vs mutable branch):** We use a **mutable staging table** (staging_habitat_content) rather than an immutable snapshot chain so that (1) the Twin can keep refining staging over time as more proposals are approved, and (2) promotion is a simple “copy staging → public” without resolving a DAG. Optional future: store promotion snapshots as JSONB in habitat_promotion_record for rollback.

---

## C. Proposal → staging merge behavior

### When does merge happen?

- On **POST /api/proposals/[id]/approve** with `action: "approve_for_staging"` **and** the proposal is a habitat proposal (has `habitat_payload_json`, target_surface staging_habitat or concept with habitat payload).
- After FSM transition is validated, **before** or **after** updating proposal_record: call **merge habitat proposal into staging** (validate payload, then upsert staging_habitat_content for the page(s) in the payload).

### Merge semantics (per page)

- Habitat payload has `version`, `page`, `theme`, `blocks`. One proposal = **one page** (payload.page).
- **Replace**: For the page (slug) in the payload, upsert `staging_habitat_content` with (slug, title from proposal or payload, body optional, payload_json = validated payload, source_proposal_id = proposal_record_id, updated_at = now).
- **Conflict**: If another proposal had already been merged for that page, it is **replaced** (last-approved-wins). Provenance remains the latest proposal that contributed.

### Future: block-level and theme-level merge

- **Add block**: proposal_type or role could indicate “add block”; we’d append to staging page’s blocks (with dedupe by block id).
- **Revise block**: proposal targets block id; replace that block in staging.
- **Theme/layout**: merge theme keys into staging page’s theme; or replace theme.
- For V1 we ship **page-level replace only**; block/theme merge can be added later with clear proposal_type or role.

### Auditability

- Every staging row has `source_proposal_id` and `updated_at`. Proposal FSM state remains in proposal_record; we do not mutate proposal state from merge—merge is a **side-effect of approval**, not a separate FSM.

---

## D. Staging → public promotion

### Human action: “Push staging to public”

- New endpoint: **POST /api/staging/promote** (or POST /api/habitat/promote). Auth required (Studio operator).
- Behavior: (1) Read all rows from `staging_habitat_content`. (2) For each row, upsert into `public_habitat_content` (slug, title, body, payload_json, updated_at). (3) Insert `habitat_promotion_record` (promoted_at, promoted_by, slugs_updated, optional snapshot ref). (4) Return success and promotion id.
- **No** automatic promotion; no runner call. Public changes only when this endpoint is called.

### Rollback

- Existing **unpublish** (POST /api/proposals/[id]/unpublish) rolls back a **proposal** (e.g. from approved_for_publication back to approved_for_staging) and can clear public_habitat_content for affected slugs. That remains proposal-centric.
- For “rollback last promotion,” we could add POST /api/staging/promote/rollback that restores public from the previous promotion snapshot if we store snapshots in habitat_promotion_record. **V1**: store slugs_updated and promoted_at only; rollback can be “manual” or a later feature (restore from backup or re-run from staging after fixing). Document as future improvement.

---

## E. UI / operator experience

### Studio

- **Incoming habitat proposals**: Existing list; add indicator “Merged into staging” when proposal is approved_for_staging and its id equals staging_habitat_content.source_proposal_id for the page it targets.
- **Staging composition summary**: New section or card: “Staging composition” — list of slugs in staging_habitat_content with title and source proposal id (link to proposal). Optional: “Diff vs public” (slugs in staging not in public, slugs different, etc.).
- **Push staging to public**: Button “Push staging to public” → POST /api/staging/promote; show success and promotion id.
- **Promotion history**: List recent habitat_promotion_record rows (promoted_at, promoted_by, slugs_updated).

### Habitat-staging app

- **Primary data source**: GET **/api/staging/composition** (new) returning the current staging composition (all rows from staging_habitat_content). Renders the **coherent composition** (all pages), not a list of proposals.
- **Fallback**: If composition is empty, can still show GET /api/staging/proposals so “no staging yet” still shows something or a message.
- **Provenance**: In UI, optionally show “This page from proposal X” (link or tooltip) using source_proposal_id.

---

## F. Governance and semantics

### Proposal FSM (unchanged)

- States and transitions remain as in governance-rules (pending_review → approved_for_staging → staged → approved_for_publication → published, etc.).
- **approve_for_staging** now has a **domain side-effect** for habitat: merge proposal payload into staging_habitat_content. The FSM transition is still the gate; the merge is the effect.
- **approved_for_staging** meaning: “Harvey approved this proposal for staging; the proposal’s content has been merged into the staging composition (for habitat).” So “merged into staging” is true when (1) state is approved_for_staging (or staged, etc.) and (2) for habitat, the merge has been applied (we always apply on approve, so it’s redundant unless we later support “approve but defer merge”).

### Explicit meanings

| Term | Meaning |
|------|--------|
| **Approve (for staging)** | FSM → approved_for_staging; for habitat proposals, merge payload into staging_habitat_content. |
| **Merged into staging** | The proposal’s payload has been written to staging_habitat_content (by page). So staging composition now includes that content. |
| **Staging branch head** | The current set of rows in staging_habitat_content. No separate “head” pointer. |
| **Published to public** | Human triggered “Push staging to public”; public_habitat_content is updated from staging_habitat_content; promotion recorded. |
| **Staged** (proposal state) | FSM state “staged”; means “build/review done for this proposal”; does not by itself change staging composition (already merged on approve_for_staging). |

No ambiguous actions: approve_for_staging = FSM + merge. Promote = copy staging → public + record.

---

## G. Creativity / habitat capability ladder (design only; implementation scoped later)

### Safe capability ladder (conceptual)

1. **Safe content/layout** — Current: structured blocks (hero, text, artifact_grid, etc.), page, theme. Already in Habitat V2 schema.
2. **Safe styling/theme** — Richer theme (tone, density, motion, surfaceStyle); constrained custom style fields (no arbitrary CSS).
3. **Safe interactive components** — Registry of allowed React components (e.g. “accordion”, “tabs”); proposal can reference component id + props schema; renderer only instantiates from registry.
4. **Advanced (e.g. three.js/canvas)** — Guarded wrapper: component runs in sandbox or as approved “advanced block” type; no arbitrary code injection.

### Implementation approach (no arbitrary code)

- **Component registry**: Map block type or component_id to a server-approved component; reject unknown. Typed block schemas (Zod) per type.
- **Constrained styles**: Theme and block-level style fields as allowlisted enums or constrained objects; no raw HTML/CSS strings from proposals.
- **Advanced blocks**: Represent as proposal candidates (e.g. extension_classification or proposal_type “advanced_component”); until approved and wrapped, they do not execute—only show as “proposed” in review. When approved, only pre-registered wrappers can render.

**V1 scope**: No change to block types or execution model. This section is design for future expansion; existing Habitat V2 blocks remain the only executable content.

---

## H. Canon / doc alignment

### Docs that assume “staging = proposal rows” or one-proposal publication

- **concept_to_proposal_flow.md**: Says “agent may build in staging” after approved_for_staging; “Harvey reviews staging” then approve for publication. Does not say staging is a composition table. **Change**: Add subsection “Staging composition” — staging is a first-class composition (staging_habitat_content); approving a proposal merges it into staging; promotion to public is a separate “push staging to public” step.
- **habitat_proposal_audit_repair.md**: Describes current “staging API returns proposal rows” and “no staging table.” **Change**: Add “Post–branch design” note: staging composition table and merge-on-approve are now in place; staging app reads composition; promotion is push-to-public.
- **habitat_v2.md** (if it exists): May describe only proposal and public payload; add staging_habitat_content and promotion.

### Additive clarifications

- Approval for staging = FSM transition + merge into staging composition (habitat).
- Publication = human-triggered promotion from staging composition to public; not one-proposal-at-a-time public approval (that path can remain for backward compatibility: approve_for_publication still writes one proposal to public if we want to keep it; but the primary path is “promote staging.”) **Decision**: Keep approve_for_publication as-is for single-proposal publish; add “Push staging to public” as the main path. Both are valid; doc should state that promotion is the branch model, single-proposal publish is legacy/special case.

---

## Deliverables summary

| # | Item | Status |
|---|------|--------|
| 1 | Root-cause / architecture summary | This doc §A. |
| 2 | Exact files changed | See implementation section below. |
| 3 | DB migrations | staging_habitat_content, habitat_promotion_record. |
| 4 | New/updated APIs | GET /api/staging/composition, POST /api/staging/promote, GET promotion history. |
| 5 | Before/after flow | §A current; §C–D target flow. |
| 6 | Proposal/staging/public semantics | §F. |
| 7 | Canon/doc changes | §H. |
| 8 | Remaining risks / future | Rollback from promotion; block-level merge; capability ladder. |

---

## Implementation (files and behavior)

### New migrations

- `staging_habitat_content`: slug (PK), title, body, payload_json, source_proposal_id (UUID FK proposal_record nullable), updated_at.
- `habitat_promotion_record`: id (UUID), promoted_at (timestamptz), promoted_by (text), slugs_updated (text[]), created_at.

### Approve route

- When action === "approve_for_staging" and proposal has habitat_payload_json and target_surface staging_habitat (or concept with habitat payload): validate payload, then upsert staging_habitat_content for payload.page (slug), set source_proposal_id = id. Then update proposal_record.proposal_state to approved_for_staging.

### New APIs

- **GET /api/staging/composition**: Returns { pages: staging_habitat_content rows } (slug, title, body, payload_json, source_proposal_id, updated_at). Used by habitat-staging to render.
- **POST /api/staging/promote**: Auth; copy staging_habitat_content → public_habitat_content; insert habitat_promotion_record; return { promotion_id, slugs_updated }.
- **GET /api/staging/promote/history**: List recent habitat_promotion_record (optional).

### Staging app

- Fetch GET /api/staging/composition; if pages length > 0, render from composition; else fallback to GET /api/staging/proposals or “No staging content yet.”

### Studio

- New: staging composition summary (list slugs + source proposal); “Push staging to public” button → POST /api/staging/promote; optional promotion history list.

### Backward compatibility

- GET /api/staging/proposals remains; staging app can prefer composition when available. Existing approve_for_publication (single-proposal → public) unchanged. Proposal FSM unchanged.

---

## Exact files changed (implementation)

| File | Change |
|------|--------|
| `supabase/migrations/20260313000001_staging_habitat_composition.sql` | New: staging_habitat_content, habitat_promotion_record tables. |
| `apps/studio/lib/staging-composition.ts` | New: mergeHabitatProposalIntoStaging, promoteStagingToPublic. |
| `apps/studio/app/api/staging/composition/route.ts` | New: GET composition (pages from staging_habitat_content). |
| `apps/studio/app/api/staging/promote/route.ts` | New: POST promote (copy staging → public, record promotion). |
| `apps/studio/app/api/staging/promote/history/route.ts` | New: GET promotion history. |
| `apps/studio/app/api/proposals/[id]/approve/route.ts` | On approve_for_staging + habitat payload: call mergeHabitatProposalIntoStaging before FSM update. |
| `apps/studio/app/review/surface/habitat/staging-composition-card.tsx` | New: Studio card (composition summary, Push to public, history). |
| `apps/studio/app/review/surface/habitat/page.tsx` | Mount StagingCompositionCard. |
| `apps/habitat-staging/app/page.tsx` | Fetch GET /api/staging/composition; StagingCompositionSection; BeforeAfterPreview accepts compositionPage; show “staging composition” when present. |
| `docs/02_runtime/concept_to_proposal_flow.md` | Staging composition, merge, promote semantics. |
| `docs/architecture/habitat_proposal_audit_repair.md` | Post–branch design note. |

---

## Remaining risks / future improvements

- **Rollback:** No “rollback last promotion” yet; restore-from-snapshot or manual. Optional: store full staging snapshot in habitat_promotion_record for one-step rollback.
- **Block-level merge:** Only page-level replace is implemented; block append/replace and theme merge can be added later with clear proposal_type/role.
- **Capability ladder (G):** Design only; no new block types or component registry in this change. Safe expansion (styling, interactive registry, advanced wrappers) is future work.
- **DB types:** After migration, run `pnpm db:generate` so Studio TypeScript sees staging_habitat_content and habitat_promotion_record in generated types (optional; runtime works without).
