# Avatar V1 Implementation Report

## A. Files changed

**Created**
- `supabase/migrations/20250310000003_identity_active_avatar.sql`
- `apps/studio/app/api/public/identity/route.ts`
- `docs/05_build/AVATAR_V1_IMPLEMENTATION_REPORT.md` (this file)

**Edited**
- `apps/studio/app/api/identity/route.ts` — added `active_avatar_artifact_id` to IDENTITY_FIELDS and PATCH body; validation (artifact exists, medium image, approved); `writeChangeRecord(embodiment_update)` when setting active avatar.
- `apps/public-site/app/page.tsx` — added `getPublicIdentity()`, identity/avatar hero block (name, avatar image, summary or embodiment_direction), works section with avatar artifact excluded from list.
- `apps/studio/app/review/artifacts/artifact-actions.tsx` — added `medium` prop, `handleSetActiveAvatar()`, “Set as active avatar” button when `medium === "image"` and state is approved or approved_for_publication.
- `apps/studio/app/review/artifacts/page.tsx` — pass `medium={a.medium}` into `ArtifactActions`.

---

## B. Flow trace

**1. Avatar candidate artifact**
- Any image artifact created by the session pipeline (e.g. session with `preferMedium: "image"`) is stored in `artifact` with `current_approval_state: pending_review`, `medium: image`.
- No separate “avatar candidate” type; the artifact model is reused. Eligibility for avatar = image + approved (or approved_for_publication).

**2. Harvey activation/approval**
- Harvey opens **Review → Artifacts** (e.g. queue or approved view).
- For an **image** artifact in **approved** or **approved_for_publication**, the “Set as active avatar” button is shown.
- On click: `PATCH /api/identity` with body `{ active_avatar_artifact_id: artifactId }`.
- **Studio identity route** (auth required): loads active identity; validates artifact exists, `medium === "image"`, `current_approval_state` in `["approved", "approved_for_publication"]`; updates `identity.active_avatar_artifact_id`; if value changed to a non-null artifact, calls `writeChangeRecord(embodiment_update, target_type: "artifact", target_id: artifactId)`.

**3. Active avatar persistence**
- Single source of truth: `identity.active_avatar_artifact_id` (FK to `artifact.artifact_id`, ON DELETE SET NULL).
- One active avatar per active identity. No separate table.

**4. GET /api/public/identity**
- No auth. Loads active identity (`is_active`, `status = active`, order by `updated_at` desc, limit 1). Selects `name`, `summary`, `embodiment_direction`, `active_avatar_artifact_id`.
- If `active_avatar_artifact_id` is set, fetches that row from `artifact` (artifact_id, title, preview_uri, content_uri, medium).
- Returns `{ name, summary, embodiment_direction, avatar: { artifact_id, title, preview_uri, content_uri, medium } | null }`. On error or no DB, returns safe null/empty shape.

**5. Public-site rendering**
- Page runs `getPublicIdentity()` and `getPublishedArtifacts()` in parallel (same revalidate 60).
- **Identity/avatar block:** Title = `identity.name ?? "Twin"`. If `identity.avatar` and (preview_uri or content_uri), renders a 120×120 avatar image. Then summary or embodiment_direction as the short line.
- **Works section:** Label “Works”. List = `artifacts` minus the artifact whose `artifact_id === identity?.avatar?.artifact_id` (so the avatar does not appear again in the list). Same rendering as before (title, summary, image, medium, date). Works still come only from `GET /api/public/artifacts` (approved_for_publication + published).

**6. Published works rendering**
- Unchanged: `GET /api/public/artifacts` returns artifacts with `current_approval_state = approved_for_publication` and `current_publication_state = published`. Public site filters that list to exclude the active avatar artifact and renders the rest in the Works section.

---

## C. Intentionally not built (V1)

- **Automated Twin-originated avatar proposal** — No session or agent path that creates an “avatar candidate” proposal. Harvey chooses an approved image and sets it as active avatar from the artifact review UI.
- **Three.js / rich habitat avatar** — No 3D, animation, or stateful avatar. V1 is a single image in the identity block.
- **Animation / state-machine avatar** — No animated or multi-state avatar.
- **Visitor-informed identity** — No adaptation of identity or avatar based on visitor input.
- **public_habitat_content on public site** — Not wired. Table is still written by approve route for habitat proposals; public site does not fetch or render it. Left for a later iteration to avoid scope creep.
- **Identity page “Clear avatar” / avatar selector** — Active avatar is set only from Artifact review. Identity page could later show current avatar and a clear button; not required for V1.

---

## D. Manual test steps

1. **Apply migration**
   - From repo root: `pnpm exec supabase db push` (or `supabase db reset` if local).
   - Confirm `identity` has column `active_avatar_artifact_id`.

2. **Create an image artifact**
   - In Studio, run a session with “Image” (or preferMedium: image). Wait for one image artifact to be created and stored.

3. **Approve the image**
   - Go to **Review → Artifacts** (queue or approved). Find the image artifact. Use “Approve” to set state to approved_for_publication (or approved).

4. **Set as active avatar**
   - On that same image artifact, click “Set as active avatar”. Page should refresh without error. Optionally in DB: `identity.active_avatar_artifact_id` = that artifact’s id.

5. **Public identity API**
   - `GET http://localhost:3000/api/public/identity` (no auth; replace 3000 with Studio port). Expect JSON with `name`, `summary`, `embodiment_direction`, and `avatar: { artifact_id, title, preview_uri, content_uri, medium }`.

6. **Public site**
   - Set public-site `NEXT_PUBLIC_STUDIO_URL` to Studio (e.g. http://localhost:3000). Run public-site (e.g. port 3001). Open the public page. You should see: (1) Identity block with Twin name, avatar image (if URL valid), and summary/embodiment line; (2) “Works” section with published artifacts only, and the active avatar artifact **not** in the works list.

7. **Publish one work (optional)**
   - In Studio, approve another artifact (any medium) to approved_for_publication, then Publish. On the public site, that artifact should appear under Works; the avatar image should still appear only in the identity block.

8. **Governance**
   - Only an authenticated Harvey can PATCH identity (and set active avatar). Unauthenticated GET /api/public/identity does not mutate anything. Works remain gated by approved_for_publication + published.

---

## E. Verdict

**Is Avatar V1 wired end-to-end?**  
Yes. There is a single persisted active avatar (`identity.active_avatar_artifact_id`), a public read-only identity API, a public habitat that shows an identity/avatar block and a works list (with the avatar excluded from the list), and a Harvey-only “Set as active avatar” action on approved image artifacts with a change_record. The Twin cannot set its own public avatar.

**What is still optional/future?**
- Showing or clearing the active avatar from the Identity page.
- Consuming `public_habitat_content` on the public site (narrative/intro block).
- Twin-originated avatar proposals or richer embodiment/habitat flows (e.g. animation, 3D).
