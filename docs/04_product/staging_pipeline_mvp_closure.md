# Staging Pipeline MVP – Architecture Closure

**Status:** MVP Complete  
**Scope:** Habitat staging, review, preview, and promotion pipeline  
**Applies to:** Studio (`apps/studio`), Public site (`apps/public-site`)

**Before changing this pipeline:** run `docs/05_build/IMPLEMENTATION_CHECKLIST.md`.

This document closes the initial implementation of the Staging → Publish pipeline for habitat content and related proposals.

The goal of this phase was to deliver a reviewable, governed publishing pipeline with clear boundaries between:

- runtime proposals
- staging composition
- human review
- immutable public snapshots

The pipeline is now operational and covered by tests.

---

## 1. Canonical Content Flow

The system now follows this canonical lifecycle.

```
runtime generation
      │
      ▼
proposal_record
      │
      ▼
staging review surface
      │
      ▼
staging composition
(staging_habitat_content)
      │
      ▼
publish readiness review
(diff vs public snapshot)
      │
      ▼
promote staging
      │
      ▼
create immutable snapshot
(habitat_snapshot)
      │
      ▼
public twin reads snapshot
```

### Stage Breakdown

| Stage    | Table / Component              | Purpose                                      |
| -------- | ------------------------------ | -------------------------------------------- |
| Proposal | `proposal_record`              | Stores candidate system proposals            |
| Staging  | `staging_habitat_content`      | Mutable composition of candidate habitat pages |
| Review   | `/review/staging`              | Human governance and review                  |
| Promotion| `/api/staging/promote`         | Converts staging → immutable snapshot        |
| Snapshot | `habitat_snapshot`             | Canonical public state                       |
| Public render | `/api/public/habitat-content` | Snapshot-backed habitat payload              |

---

## 2. Current Routes

### Staging Review

**GET /api/staging/review**

Returns the grouped staging review model.

Includes:

- `habitat_groups: HabitatGroup[]`
- `buckets: ProposalBucket[]`
- `allowed_actions: string[]`
- `review_note?: string`

Responsibilities:

- groups proposals by habitat page
- classifies proposals by lane
- computes legal reviewer actions
- powers `/review/staging`

**PATCH /api/staging/proposal/note?id=...**

Updates reviewer notes.

Input: `{ review_note?: string | null }`

Updates: `proposal_record.review_note`, `proposal_record.updated_at`

No state transitions occur.

**POST /api/staging/proposal/action?id=...**

Proxy route for governed proposal actions.

Supported actions: `approve_for_staging`, `approve_for_publication`, `needs_revision`, `reject`, `ignore`, `archived`

Internally forwards to `POST /api/proposals/[id]/approve`, `PATCH /api/proposals/[id]`. All legality enforced by `canTransitionProposalState`, `PROPOSAL_STATE_TRANSITIONS`.

### Publish Review

**GET /api/staging/publish-review**

Returns the candidate vs public snapshot diff.

Includes: `candidate_snapshot_like`, `public_snapshot`, `diff`, `advisories`, `recommendation`

Used by `/review/staging` to determine whether promotion is safe.

### Promotion

**POST /api/staging/promote**

Promotes staging to public.

Steps:

1. reads `staging_habitat_content`
2. generates new snapshot payload
3. inserts into `habitat_snapshot`
4. advances related proposals to published
5. updates `public_habitat_content` projection

This is the only supported promotion path.

### Public Content

**GET /api/public/habitat-content**

Public twin page data source.

Steps:

1. determine active identity
2. select latest snapshot: `habitat_snapshot` WHERE `snapshot_kind = 'public'`
3. resolve page payload
4. validate payload schema

Returns: `{ slug, payload }`

Public rendering never reads staging tables.

---

## 3. Review Surfaces

### Staging Review Page

**Route:** `/review/staging`

Features: grouped habitat proposals, bucketed non-habitat proposals, inline reviewer notes, inline legal actions, publish readiness panel, promote staging button.

Habitat groups appear as collapsible sections per page.

### Staging Preview

**Route:** `/review/staging/preview?page=<slug>`

Preview sources: `staging_habitat_content`

Supported pages: `home`, `works`, `about`, `installation`

Preview rendering uses the same Habitat block schema as the public site.

Supported preview blocks: `hero`, `text`, `quote`, `divider`, `featured_artifact`, `artifact_grid`, `concept_cluster`, `timeline`, `marquee`, `story_card`

Unsupported blocks render as explicit placeholders.

Artifacts are resolved from published artifacts only.

---

## 4. Known Limitations

The MVP intentionally excludes several capabilities.

**No Staged Artifact Layer**

Preview resolves artifacts only from `artifact` WHERE `current_publication_state = 'published'`. There is no `staged_artifact` or `artifact_draft`. Unresolved artifact IDs are surfaced in preview.

**Preview is Not Fully Identical to Public**

Differences: artifact-dependent blocks may be simplified; identity/avatar context not injected; decorative blocks may render as placeholders. The payload schema remains identical.

**No Batch Review Actions**

Review currently operates per proposal row. No bulk approve, bulk archive, or batch promotion. These were intentionally deferred.

**Limited Filtering in Review UI**

The staging page currently lacks filtering by state, filtering by page, search, and sorting controls. These are expected ergonomics improvements.

---

## 5. Projection Tables

**public_habitat_content**

- **Purpose:** projection / compatibility
- **Written by:** `promoteStagingToPublic`, legacy approve route
- **Not** used as the canonical source for the public twin. The authoritative source is `habitat_snapshot`.

---

## 6. Snapshot Model

Public state is defined by immutable snapshots.

**habitat_snapshot:** `snapshot_id`, `identity_id`, `payload_json`, `snapshot_kind`, `created_at`

Snapshots are append-only, immutable, and identity-scoped. The public twin always resolves from the latest public snapshot.

---

## 7. Testing Coverage

Current tests verify:

- **Governance:** proposal-governance, governance-rules, proposal-transitions
- **Staging:** staging-read-model, staging-proposal-inline-actions
- **Preview:** preview-artifacts, staging-preview-normalize
- **Snapshot Resolution:** public-habitat-selector, publish-flow-happy-path

Test suite: 41 test files, ~488 tests. All tests pass.

---

## 8. Future Work (Post-MVP)

The following are deliberately deferred improvements.

- **Reviewer Ergonomics:** filtering, sorting, search, batch actions, show actionable proposals only
- **Staged Artifact Model:** e.g. `artifact_draft` / `artifact_staging` for preview of unpublished artifacts
- **Full Preview Parity:** shared renderer between Studio and public, identity-aware preview, artifact metadata parity
- **Editorial Workflow:** proposal labels, review assignments, approval audit trails

---

## 9. MVP Completion Statement

The Staging Pipeline MVP delivers:

- governed proposal lifecycle
- human review surface
- artifact-aware preview
- publish readiness diff
- immutable snapshot publishing
- snapshot-backed public twin

The architecture now supports a stable editorial workflow for habitat content.
