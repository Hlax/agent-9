# Staging Habitat design — proposals, preview, and system context

## Data shape / schema suggestion

### Proposal records (UI/system + habitat changes)

Use `proposal_record` (already present) as the canonical table for proposals, and extend it for UI/system/habitat changes instead of creating a completely new table.

**Existing core fields (for reference):**

- `proposal_record_id` (uuid, PK)
- `lane_type` (text) — e.g. `"surface"`, `"system"`, `"artifact"`
- `target_type` (text)
- `target_id` (uuid, nullable)
- `title` (text)
- `summary` (text, nullable)
- `proposal_state` (text) — e.g. `"pending_review"`, `"approved"`, `"archived"`
- `preview_uri` (text, nullable)
- `review_note` (text, nullable)
- `created_by` (text)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**New fields for habitat / UI / system proposals:**

- `target_surface` (text, enum-like)
  - Allowed values: `"studio" | "staging_habitat" | "public_habitat"`
  - Meaning: where this proposal would ultimately take effect.
- `proposal_type` (text, enum-like)
  - Allowed values: `"layout" | "component" | "navigation" | "workflow" | "visual_system" | "publishing"`.
  - Meaning: what kind of system/UI change this is.
- `artifact_id` (uuid, nullable)
  - Optional link to an artifact record when the proposal references a concrete artifact.
- `idea_thread_id` (uuid, nullable)
  - Optional link to an idea / discussion thread.
- `status` (text)
  - `\"proposed\" | \"under_review\" | \"approved\" | \"rejected\" | \"implemented\"`.
  - Separate from `proposal_state` (which reflects the review lane in Studio). `status` is the semantic lifecycle of the idea; `proposal_state` is how Studio is currently treating it.

**Separation of concerns:**

- **Approval state:** `proposal_state` on `proposal_record` + any `review_note`.
- **Publication state:** lives on the target surface (e.g. a `published` flag or `published_at` on a `habitat_layout` or `public_page` record), not on the proposal itself.
- **Implementation / deployment state:** lives in your build/deploy pipeline (e.g. deployment records, release notes), not in `proposal_record`.

The proposals table stays the **idea + review ledger**; Studio owns approval, staging owns preview, deployment owns rollout.

### Build / system context

Add a lightweight system-context API that reads git and runtime state and can be consumed by both Studio and Staging.

**Suggested route:** `apps/studio/app/api/system/context/route.ts`

**Suggested shape (V1):**

```json
{
  "environment": "staging",
  "git_branch": "feature/staging-habitat-v1",
  "commit_sha": "a1b2c3d4",
  "last_commit_message": "Refine staging habitat UI",
  "last_deploy_time": "2026-03-09T11:20:00.000Z",
  "app_version": "0.3.0-staging",
  "product_version": "0.3.0",
  "staging_in_sync_with_main": false,
  "pending_proposals": 7,
  "pending_approvals": 3
}
```

Staging Habitat can either read this directly or via a thin proxy (depending on how you deploy the apps).

## Route and component plan

### Studio (control surface)

- `GET /review/system` — already exists; uses `SystemProposalList`.
- `GET /review/surface/habitat` — already exists; shows habitat-related proposals.
- **New/extended usage of `proposal_record`:**
  - Use `lane_type = 'system'` and the new `target_surface` / `proposal_type` fields for UI/system/habitat proposals.
  - Keep approval flows in Studio only:
    - Approve / reject proposals.
    - Optionally mark when a proposal has been implemented or deployed (via `status`).

### Staging Habitat (preview + experiments)

- Existing entry: `apps/habitat-staging/app/page.tsx` (now expanded).
- Staging is **read-only** with respect to Studio / Public:
  - No direct writes to `proposal_record`.
  - No direct changes to Studio or Public layouts.

**Key UI sections on `/` (Staging Habitat home):**

1. **Build State panel**
   - Shows system context (environment, git branch, commit, deploy time, versions, sync-with-main).
   - In V1 this is backed by `mockBuildState` in the page.
   - In production it should fetch from `/api/system/context` (Studio) or a local proxy route.

2. **Change Proposals section**
   - Shows proposal cards shaped like:
     - `id`
     - `title`
     - `target_surface`
     - `proposal_type`
     - `rationale`
     - `artifact_id` / `idea_thread_id`
     - `preview_url`
     - `status`
     - `created_at` / `updated_at`
   - In V1 uses `mockProposals` (see `apps/habitat-staging/app/page.tsx`).
   - Later, should query `proposal_record` (e.g. via a Supabase server helper) filtered by `lane_type = 'system'` and `proposal_state` / `status`.

3. **Before/after preview**
   - Side-by-side boxes:
     - **Left:** current Public Habitat (mock text / future live embed or screenshot).
     - **Right:** staged proposal preview (title, rationale, preview route).
   - In V1 the right-hand side uses the first entry in `mockProposals`.
   - Later, you can:
     - Select proposals from the list to drive this preview.
     - Render actual components or iframes for `/staging/preview/:proposalId`.

### Public Habitat

- Continues to show only curated, **published** outputs (e.g. current `apps/public-site/app/page.tsx` and related routes).
- Does not query proposals directly; instead it reads from:
  - Published artifacts.
  - Published habitat layouts / visual system records.

## Minimal UI implementation (what’s already in code)

File: `apps/habitat-staging/app/page.tsx`

Implemented sections:

1. **BuildStatePanel**
   - Uses a `BuildState` type that includes:
     - `environment`
     - `git_branch`
     - `commit_sha`
     - `last_commit_message`
     - `last_deploy_time`
     - `app_version`
     - `product_version`
     - `staging_in_sync_with_main`
   - Currently powered by `mockBuildState`.

2. **ChangeProposalsSection**
   - Uses a `ChangeProposal` type matching the requested shape.
   - Renders:
     - Title
     - Target surface
     - Proposal type
     - Status pill
     - Rationale
     - Artifact / idea thread ids
     - Preview URL
     - Created / updated dates
   - Uses `mockProposals` with a few representative examples:
     - Navigation change for Staging sidebar.
     - Layout experiment for Public Habitat hero section.
     - Workflow change for Studio review UI.

3. **BeforeAfterPreview**
   - Shows a mock “Current public habitat” panel and a “Staged proposal preview” panel.
   - Uses the first mock proposal as the staged example.
   - Mentions that in production this should render:
     - Live public layout (or screenshot) on the left.
     - Proposal preview (layout/component) on the right.

All of this is **read-only** and confined to the Staging app; it does not write to Studio or Public.

## Sample seed data for proposals

The mock proposals in `apps/habitat-staging/app/page.tsx` can be mirrored as seed records in `proposal_record` for dev/staging:

```jsonc
[
  {
    "title": "Add Change Proposals section to Staging sidebar",
    "lane_type": "system",
    "target_type": "ui_navigation",
    "target_surface": "staging_habitat",
    "proposal_type": "navigation",
    "summary": "Give Twin and Harvey a clear entry point to review UI and system proposals without touching Studio or Public directly.",
    "status": "under_review",
    "preview_uri": "/staging/preview/ui-nav-001"
  },
  {
    "title": "Public habitat hero layout experiment",
    "lane_type": "system",
    "target_type": "public_layout",
    "target_surface": "public_habitat",
    "proposal_type": "layout",
    "summary": "Test a more narrative hero layout that foregrounds the Twin’s philosophy and recent artifacts before publishing to the real public surface.",
    "status": "proposed",
    "artifact_id": "artifact-hero-sketch-01",
    "preview_uri": "/staging/preview/pub-layout-002"
  },
  {
    "title": "Studio review workflow tweaks",
    "lane_type": "system",
    "target_type": "studio_workflow",
    "target_surface": "studio",
    "proposal_type": "workflow",
    "summary": "Group system, surface, and habitat proposals in a single Studio review lane so Harvey has one place to approve changes before they reach staging.",
    "status": "approved",
    "idea_thread_id": "thread-governance-02"
  }
]
```

These are illustrative only; real seed scripts should set `proposal_state`, `created_by`, and timestamps.

## Notes for wiring git/build metadata safely

1. **Prefer environment variables in production**
   - On Vercel and similar platforms you often have:
     - `VERCEL_GIT_COMMIT_SHA`
     - `VERCEL_GIT_COMMIT_MESSAGE`
     - `VERCEL_GIT_COMMIT_REF` (branch)
     - `VERCEL_URL` / `VERCEL_ENV`
   - Map these directly into `/api/system/context` without shelling out to git.
   - Keep any app/product version in a single source of truth (e.g. `package.json` or `APP_VERSION` env var).

2. **Use git commands only in trusted environments**
   - For local dev (or self-hosted servers) you can derive more details:
     - `git rev-parse HEAD`
     - `git branch --show-current`
     - `git log -1 --pretty=%B`
     - `git diff --name-only origin/main...HEAD`
   - Run these in a backend-only context (API route or server helper), never in client code.
   - Handle failures gracefully and return `null`/\"Unknown\" if git is not available.

3. **Do not entangle approval with deployment**
   - `/api/system/context` should be read-only and informational.
   - Approval actions (e.g. `/api/proposals/[id]/approve`) should never trigger deploys directly.
   - Deployments stay in your CI/CD (e.g. GitHub Actions + Vercel).

4. **Future: runtime-state endpoint**
   - You can later add `/api/system/runtime-state` that returns:
     - deployed staging version
     - deployed public version
     - database schema version
     - artifact counts
     - proposal counts / pending approvals
   - Staging Habitat can combine `/api/system/context` (git/build) and `/api/system/runtime-state` (DB/runtime) for richer awareness.

This gives you a clean V1: proposals and review live in Studio + `proposal_record`, Staging previews them with mock data (today) and real data (later), and Public only sees curated published results. The agent reads from git + runtime context via a dedicated System Awareness API before proposing changes.

