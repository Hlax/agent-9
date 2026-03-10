# Avatar + Habitat V2 Proposal Readiness Audit

Concrete code-based audit: can the Twin propose an avatar and a Habitat V2 structured composition that Harvey can review, approve, and publish?

---

## 1. Verdict

**PARTIAL**

- **Habitat V2:** End-to-end path exists (concept → create-proposal with payload → approve_for_publication → public render). Habitat review UI now sends "Approve for publication" when the proposal has `target_surface: "public_habitat"` or `habitat_payload_json`, so concept-driven habitat proposals can be published from the list.
- **Avatar:** Data model and public render are wired. Twin does not create avatar proposals; approve_avatar does not set `active_avatar_artifact_id` from the proposal. Avatar selection is Harvey-only via "Set as active avatar" on an artifact.

---

## 2. Evidence Table

| Requirement | Status | File(s) | Function / Route | Explanation |
|-------------|--------|---------|------------------|-------------|
| **A. Avatar** | | | | |
| Canonical place for selected avatar | ✓ | `supabase/migrations/20250310000003_identity_active_avatar.sql`, `identity` table | `active_avatar_artifact_id` | Column exists; FK to artifact. |
| Twin generate avatar-oriented concept | ⚠ Partial | `packages/agent/src/generate-writing.ts` | `generateWriting`, SYSTEM_PROMPT | No "avatar" mode; reflect mode produces generic concepts. Twin can describe an avatar in text but there is no classification as avatar-oriented. |
| Avatar concept → proposal | ✗ | `apps/studio/app/api/artifacts/[id]/create-proposal/route.ts`, `apps/studio/app/api/session/run/route.ts` | create-proposal POST, session run | create-proposal accepts only `target_surface` (staging_habitat, public_habitat). No `target_type: avatar_candidate` or artifact_id for image. Session run creates only `target_type: "concept"`, `target_surface: "staging_habitat"`. |
| Proposal references approved image as avatar | ✗ | `apps/studio/app/api/proposals/route.ts`, chat route | POST /api/proposals, chat NAME_PROPOSAL | Avatar proposals created manually with title/summary/preview_uri; no `artifact_id` for the image. Chat creates only identity_name. |
| Harvey approve and publish avatar selection | ⚠ Partial | `apps/studio/app/api/proposals/[id]/approve/route.ts` | `action === "approve_avatar"` | Sets `identity.embodiment_direction` from proposal title/summary only. Does **not** set `identity.active_avatar_artifact_id`. |
| Public habitat renders chosen avatar | ✓ | `apps/studio/app/api/public/identity/route.ts`, `apps/public-site/app/page.tsx` | GET /api/public/identity, PublicHome | Identity includes avatar from `active_avatar_artifact_id`; public page shows avatar image. |
| **B. Habitat V2** | | | | |
| Place for structured habitat payloads | ✓ | `supabase/migrations/20250310000004_habitat_v2_payload.sql` | — | `proposal_record.habitat_payload_json`, `public_habitat_content.payload_json`. |
| Concept → proposal supports habitat | ✓ | `apps/studio/app/api/artifacts/[id]/create-proposal/route.ts` | POST body `target_surface: "public_habitat"`, `habitat_payload` | Validates payload, stores in `habitat_payload_json`; summary from payload. |
| Habitat proposal carries typed block data | ✓ | `apps/studio/lib/habitat-payload.ts` | HabitatProposalPayloadSchema, block unions | page, theme, blocks (hero, text, quote, artifact_grid, etc.). |
| Public habitat reads structured payloads | ✓ | `apps/studio/app/api/public/habitat-content/route.ts`, `apps/public-site/app/page.tsx` | GET /api/public/habitat-content, HabitatBlocks | Returns validated payload; public site renders allowlisted blocks when payload present. |
| Validator / schema enforcement | ✓ | `apps/studio/lib/habitat-payload.ts` | validateHabitatPayload, Zod schemas | Before persist (create-proposal), before publish (approve), before render (habitat-content). |
| Habitat list: approve for publication when payload present | ✓ | `apps/studio/app/review/surface/habitat/habitat-proposal-list.tsx` | handleApprove | When target_surface is public_habitat or habitat_payload_json present, sends approve_for_publication so payload is written to public_habitat_content. |
| **C. Safety** | | | | |
| Public site triggers DB writes | ✓ None | `apps/public-site/app/page.tsx` | getPublishedArtifacts, getPublicIdentity, getHabitatContent | Only `fetch` GET; no POST, no forms, no mutations. |
| Public API mutations / server actions | ✓ None | `apps/studio/app/api/public/*.ts` | identity, artifacts, habitat-content | All GET; no auth; read-only. |
| Arbitrary JSON / dynamic component injection | ✓ Blocked | `apps/public-site/app/page.tsx`, `apps/studio/lib/habitat-payload.ts` | ALLOWED_BLOCK_TYPES, isHabitatBlock, validateHabitatPayload | Render path only allows allowlisted block types; payload validated server-side. |
| **D. Governance** | | | | |
| Twin self-approve | ✓ No | `apps/studio/app/api/proposals/[id]/approve/route.ts` | POST | Requires `createClient().auth.getUser()`; unauthenticated call returns 401. |
| Twin self-publish | ✓ No | Same | approve_for_publication | Same auth; only Harvey (authenticated) can call. |
| Avatar/habitat reuse governance flow | ✓ | approve route | apply_name, approve_avatar, approve_for_publication | All go through same route with auth; change_record written. |
| Proposal summaries ≤200 words | ✓ | `apps/studio/lib/habitat-payload.ts`, create-proposal, proposals route | capSummaryTo200Words, summaryFromHabitatPayload | Habitat payload → short summary; all proposal summaries capped at 200 words. |

---

## 3. Missing Wiring

1. **Avatar proposal (fixed):** Session run now creates an `avatar_candidate` proposal when an image artifact is produced, with `artifact_id`, title, summary, preview_uri. So the Twin proposes each generated image as a potential avatar.

2. **approve_for_publication for avatar (fixed):** When action is `approve_for_publication` and `target_type === "avatar_candidate"`, the route validates the proposal’s `artifact_id` is an approved image, then sets `identity.active_avatar_artifact_id`. Legacy `approve_avatar` still only updates `embodiment_direction`.

3. **Twin-originated avatar proposal (fixed):** Session run creates an `avatar_candidate` proposal for each image artifact produced, with `artifact_id` set. Avatar list UI uses the same staging→public flow: "Approve for staging" and "Approve for publication" (publication sets active_avatar_artifact_id).

4. **Habitat review UI (fixed):** Concept proposals with `target_surface === "public_habitat"` or `habitat_payload_json` now get an "Approve for publication" button that sends `approve_for_publication`, so the payload is written to `public_habitat_content`. See `habitat-proposal-list.tsx` (handleApprove uses canPublishToPublic and action approve_for_publication).

5. **Session run (fixed):** Session run now builds a minimal habitat payload from the concept (title → hero headline, summary → subheadline), validates it, and attaches `habitat_payload_json` and `target_surface: "public_habitat"` when valid. So in normal runs, concept proposals are publishable: Harvey sees "Approve for publication" and can publish the minimal layout.

---

## 4. Minimum Implementation Plan

**Avatar (smallest safe path so Twin can propose an avatar Harvey can publish):**

- **Option A (minimal):** When Harvey approves an avatar_candidate proposal that has `artifact_id` set, set `identity.active_avatar_artifact_id = proposal.artifact_id`.
  - File: `apps/studio/app/api/proposals/[id]/approve/route.ts`. In the `approve_avatar` block: if `proposal.artifact_id` is set, validate it is an approved image artifact, then update identity with `active_avatar_artifact_id: proposal.artifact_id` (and optionally keep embodiment_direction from title/summary). Write change_record.
  - File: UI or API that creates avatar proposals: ensure `artifact_id` (and optionally `preview_uri`) are set when creating an avatar_candidate proposal (e.g. "Set as avatar proposal" from an artifact page that POSTs to /api/proposals with target_type avatar_candidate, artifact_id, title, summary).
- **Option B (Twin-originated):** Add a path for the Twin to create an avatar proposal (e.g. from chat or session when an approved image is referenced, or a dedicated "Propose as avatar" from concept/artifact). That would require: (1) creating proposal with target_type avatar_candidate and artifact_id; (2) same approve_avatar change as Option A.

**Habitat V2 (done):**

- **Habitat review UI:** Implemented. When the proposal has `target_surface === "public_habitat"` or `habitat_payload_json`, the button shows "Approve for publication" and sends `approve_for_publication`. File: `apps/studio/app/review/surface/habitat/habitat-proposal-list.tsx`.

- **Session run:** Implemented. When a concept proposal is auto-created, a minimal Habitat V2 payload is built from the concept title/summary (one hero block), validated, and stored with `target_surface: "public_habitat"`. So each eligible concept becomes a publishable proposal. See `buildMinimalHabitatPayloadFromConcept` in `habitat-payload.ts` and session run insert in `session/run/route.ts`.

---

## 5. Risk List

| Risk | Severity | Where | Mitigation |
|------|----------|--------|-------------|
| Public site could call non-public Studio endpoints | Low | public-site uses NEXT_PUBLIC_STUDIO_URL | Public site only calls /api/public/* (identity, artifacts, habitat-content). No other endpoints linked. Ensure no future client code posts to mutate APIs. |
| Habitat payload bypassing validation | None | create-proposal, approve, habitat-content | All three validate with Zod; invalid payload not stored or returned. |
| Arbitrary component/HTML from payload | None | habitat-payload schema, public page | No custom_html/embed/script; render is fixed block types and safe props only. |
| Proposal approval without auth | None | approve route | All approve actions require `getUser()`; 401 if not authenticated. |
| Staging habitat or deployment from public | None | Public site has no links to staging or deploy | Not applicable; public site is read-only. |

**No critical risks identified.** Public habitat is read-only; governance is gated by auth; payload is allowlisted and validated.

---

## Required Audit Answers (exact)

**A. Avatar Readiness**

- **Canonical place in data model for selected avatar?** Yes: `identity.active_avatar_artifact_id`.
- **Can the Twin generate an avatar-oriented concept today?** Only as free text in a generic concept; no classification or dedicated path.
- **Can an avatar concept become a proposal?** No. create-proposal does not support avatar_candidate; session run does not create avatar proposals.
- **Can a proposal reference an approved image artifact as avatar source?** No. Avatar proposals are created without `artifact_id`; approve_avatar does not read artifact_id.
- **Can Harvey approve and publish that avatar selection?** Partially. Harvey can set the avatar via "Set as active avatar" on an artifact (PATCH identity). Approving an avatar_candidate proposal does not set active_avatar_artifact_id.
- **Does the public habitat actually render a chosen avatar?** Yes. GET /api/public/identity returns avatar; public page renders it.

**B. Habitat V2 Readiness**

- **Place for structured habitat payloads?** Yes: `proposal_record.habitat_payload_json`, `public_habitat_content.payload_json`.
- **Concept-to-proposal supports habitat proposals?** Yes when Harvey calls create-proposal with `target_surface: "public_habitat"` and `habitat_payload`. Session run does not create these.
- **Can a habitat proposal carry typed block data / page + theme + blocks?** Yes. Schema and validator in `habitat-payload.ts`; stored in habitat_payload_json.
- **Does the public habitat read structured payloads?** Yes. GET /api/public/habitat-content; public page renders blocks when payload present.
- **Validator/schema enforcement?** Yes. Zod in `habitat-payload.ts`; used at create-proposal, approve, and habitat-content.

**C. Safety**

- Public habitat does not trigger DB writes, API mutations, server actions, forms, uploads, auth flows, or execution of arbitrary code. No raw HTML/script injection; only allowlisted blocks. No bypass of validation in the code paths audited.

**D. Governance**

- Twin cannot self-approve or self-publish; approve route requires auth. Avatar and habitat proposals use the same governance flow (proposal → Harvey approve → publish/apply). No route bypasses approval for these flows.
