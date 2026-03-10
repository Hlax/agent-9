# Avatar V1 (canon)

The minimum embodiment layer for the Twin's public habitat: one active public avatar, one public identity block, one public habitat that renders the avatar block plus published works. Approval-gated; no silent avatar changes.

Canon: constitution (public display curated by Harvey), glossary (Identity, Artifact), approval_state_machine, public_habitat.

---

## 1. Definition

**Avatar V1** = one active public avatar = **one approved image artifact** designated as the Twin's current embodiment.

- The avatar **begins life as an artifact** (generated in session, e.g. `medium: image`).
- It is **not** a separate entity type: it is an artifact that identity points to via `identity.active_avatar_artifact_id`.
- Only **one** active public avatar at a time (single FK on active identity).
- The public habitat shows this avatar in a **dedicated identity/hero block**, distinct from the works feed.

---

## 2. Publication and display rules

**Works (artifacts in the feed)**

- Must be `approved_for_publication` **and** `published` to appear in the public habitat works section.
- Approval state and publication state remain **distinct**; publishing is a separate action after approval.

**Avatar**

- Must be **explicitly approved** (e.g. `approved` or `approved_for_publication`) and **marked as the active avatar** by Harvey before it appears publicly.
- Only **image** artifacts may be set as the active avatar in V1.
- The Twin **must not** silently switch the public avatar; only Harvey can set or change it (approval-gated).
- The active avatar artifact **does not** appear again in the works list; it is shown only in the identity/avatar block.

---

## 3. Governance

- **Harvey** sets the active avatar (e.g. from Artifact review: "Set as active avatar" on an approved image artifact).
- Each time the active avatar is set or changed, a **change_record** is written (`change_type: embodiment_update`, target: artifact).
- Identity fields (name, summary, embodiment_direction) remain as-is; avatar is the designated artifact reference. Future expansion may add richer embodiment or habitat proposals without changing this V1 rule.

---

## 4. Public habitat layout (V1)

1. **Identity/avatar block** — Twin name (or "Twin"), active avatar image (when set), short summary or embodiment line.
2. **Works section** — Published artifacts only (approved_for_publication + published), excluding the active avatar artifact so it is not duplicated.

The habitat is a **curated surface**; Harvey decides what becomes public. Staging remains distinct from public release.

---

## 5. Scope boundary (V1)

- **In scope:** one active avatar (image artifact), public identity block, works feed, Harvey-only avatar selection, change_record on set.
- **Out of scope for V1:** automated Twin-originated avatar proposals, animation/stateful avatar, 3D or mixed-media avatar rendering, visitor-informed identity. The system may be extended later (e.g. concept-driven habitat layout, mixed media, richer embodiment) without breaking this definition.
