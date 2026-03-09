# Surface Release Model

This document defines how staging habitat and public habitat releases should work.

It exists to prevent habitat/site evolution from being confused with ordinary artifact publication.

---

## 1. Core Principle

Artifact publication and habitat release are different things.

- Artifact publication controls whether a creative output may appear publicly.
- Surface release controls whether a staging-site experience, layout, or habitat change becomes public.

The two may relate, but they are not the same state transition.

---

## 2. Surface Objects

Examples of surface-level review objects:

- gallery layout proposal
- homepage structure proposal
- habitat navigation proposal
- collection arrangement proposal
- staging release candidate
- visual identity update for the public habitat

These should not be treated as ordinary media artifacts by default.

---

## 3. Recommended Surface States

### Proposal state
- `draft_proposal`
- `pending_staging_review`
- `approved_for_staging`
- `rejected_for_staging`
- `staging_revision_requested`

### Release state
- `staging_active`
- `pending_public_promotion`
- `approved_for_public_promotion`
- `public_live`
- `retired`

These can be implemented in simple form for V1.

---

## 4. Required Flow

Recommended flow:

1. Twin proposes a surface concept
2. Harvey reviews proposal in Studio
3. Harvey approves for staging or requests revision
4. Cursor or a human implements the proposal in `apps/habitat-staging`
5. Harvey reviews the staging result
6. Harvey marks the release candidate approved for public promotion
7. Human merge/deploy promotes it to `apps/public-site`

This keeps public habitat changes supervised.

---

## 5. Manual Implementation Rule

For V1, public habitat changes should require manual implementation or promotion.

Acceptable examples:
- human-triggered merge
- human-triggered Vercel promotion
- human-triggered deployment step

Do not allow the Twin to directly modify or publish the production habitat.

---

## 6. Relationship to Artifacts

Artifacts may feed a surface release.
For example:
- a concept artifact may define a homepage mood
- an image artifact may become part of a staging collection
- a writing artifact may become part of an about page

But a surface release candidate should still be reviewed as a surface object.

---

## 7. V1 Data Approach

For scaffold phase, surface release can be modeled lightly.

Acceptable V1 options:

### Option A
A `change_record` or `proposal_record` that stores:
- lane type = surface
- target surface
- proposal summary
- staging URL or preview reference
- review decision
- promotion status

### Option B
A dedicated `surface_release` table added once staging becomes active.

For the first scaffold, Option A is acceptable.

---

## 8. Studio Requirements

Studio should support:
- viewing surface proposals
- approving for staging
- linking staging preview URLs
- approving public promotion
- recording release notes
- preserving release history

---

## 9. Public Safety Rule

The following actions must remain separate:

- artifact approved_for_publication
- artifact published
- surface approved_for_staging
- surface approved_for_public_promotion
- surface public_live

No UI button or service should collapse them into one action.
