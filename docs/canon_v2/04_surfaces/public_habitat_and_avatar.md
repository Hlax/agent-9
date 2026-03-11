# Public habitat and avatar (canon v2)

This document describes the **actual** governance of public-facing surfaces: the difference between artifacts, proposals, avatar selection, and habitat content, and why the Twin creates proposals instead of mutating public state directly.

---

## 1. Concepts

### Artifacts

- **Definition**: Creative outputs (writing, concept, image) stored in the `artifact` table. They have approval and publication state but are **not** by themselves "public" until they are used in a governed way (e.g. published, or referenced by approved habitat/avatar).
- **Session runner**: Creates artifacts and optionally **proposals** that reference them. It does not set artifact approval state, publish artifacts, update identity, or write public_habitat_content.

### Proposals

- **Definition**: Suggested changes recorded in `proposal_record`. Types include habitat layout (concept → public page), avatar candidate (image → public avatar), identity name, and system/canon.
- **Lifecycle**: Created by the session runner with initial state (e.g. pending_review). State transitions and **application** (side effects) are human-gated via PATCH /api/proposals/[id] and POST /api/proposals/[id]/approve.
- **Purpose**: Decouple "Twin suggests" from "Harvey applies." The Twin never mutates identity, public_habitat_content, or active_avatar_artifact_id directly.

### Avatar (public)

- **Definition**: The single "face" of the Twin shown publicly. Stored as `identity.active_avatar_artifact_id` pointing to an image artifact.
- **Who can set it**: Only through approval path: POST /api/proposals/[id]/approve with action `approve_for_publication` or `approve_publication` for a proposal with target_type `avatar_candidate` and a valid `artifact_id`. The referenced artifact must be image and in approval state approved or approved_for_publication.
- **Session runner**: May create an **avatar_candidate** proposal (image artifact + caps); it does not set active_avatar_artifact_id.

### Habitat content (public)

- **Definition**: Per-slug content in `public_habitat_content` (e.g. title, body, payload_json). Slugs are constrained (e.g. home, works, about, installation).
- **Who can write**: (1) POST /api/proposals/[id]/approve when applying a habitat/concept proposal (validated payload, artifact references must be published or active avatar). (2) POST /api/habitat-content/clear — clears one slug (title, body, payload_json set to null); always writes a change_record (habitat_update, reason: manual_habitat_clear).
- **Session runner**: May create a **habitat layout** proposal (concept artifact + eligibility + caps); it does not upsert public_habitat_content.

---

## 2. Why proposals instead of direct mutation

- **Governance**: Identity, avatar, and public habitat are **human-gated**. The code enforces this by:
  - Allowing only API routes (with auth) to update identity, public_habitat_content, and to set active_avatar_artifact_id.
  - Requiring legal proposal state transitions before any side effects in the approve route.
  - Recording each such change in change_record.
- **Intent**: The Twin proposes; Harvey (or an authenticated operator) approves and applies. This keeps a clear audit trail and prevents the agent from self-publishing or self-clearing public surfaces.

---

## 3. Flow summary

| Actor | Artifacts | Proposals | Avatar | Habitat |
|-------|-----------|-----------|--------|---------|
| **Session runner** | Creates artifact (and critique, evaluation); may create proposal_record (habitat_layout, avatar_candidate) | Creates rows only; state = e.g. pending_review | No | No |
| **Human (via API)** | Approve (POST .../artifacts/[id]/approve); Publish (POST .../artifacts/[id]/publish) | PATCH state; POST approve (apply name, avatar, habitat, etc.) | Set via approve_publication on avatar_candidate | Set via approve_publication on habitat proposal; clear via habitat-content/clear |

---

## 4. Identity and avatar API

- **PATCH /api/identity**: Can update identity fields (e.g. name, embodiment_direction, active_avatar_artifact_id). Implementation-defined which fields are writable and whether change_record is written for each.
- **Avatar selection**: The only path documented here that **sets** active_avatar_artifact_id is the proposal approve route for avatar_candidate. Other identity updates may be possible via PATCH /api/identity; see code for full behavior.

---

## 5. Habitat clear

- **POST /api/habitat-content/clear**: Body `{ slug }`. Slug must be one of the allowed slugs. On success: updates public_habitat_content for that slug (title, body, payload_json = null) and **always** writes a change_record (change_type: habitat_update, reason: manual_habitat_clear). No coupling to proposal lifecycle.

---

## 6. Summary

- **Artifacts**: Internal creative outputs; approval and publication are separate and human-gated.
- **Proposals**: Twin-created suggestions; application is human-gated and enforced by the proposal FSM and approve route.
- **Avatar**: Set only via approval of an avatar_candidate proposal (or implementation-defined identity PATCH).
- **Habitat**: Set only via approval of a habitat/concept proposal or via manual clear (with change_record). The Twin never writes public_habitat_content or identity directly.
