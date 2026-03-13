# Staging Pivot — Minimal Architectural Framework Spec

**Date:** 2026-03-13  
**Context:** Proposal Policy V1, Governance V1, Evidence Ledger V1 sealed. This spec defines the **minimal architectural framework** for pivoting staging from a human-gated holding area to the **agent’s live working environment**, with **public habitat** remaining human-approved.

**Scope:** No agent redesign. No new subsystems unless necessary. Consistent with existing governance, traceability, and proposal lifecycle.

**Related:** When the agent should actually propose a publish (eligibility, diff, coherence, stability, cadence) is defined in **Publish Snapshot Proposal Policy V1** (`docs/05_build/PUBLISH_SNAPSHOT_PROPOSAL_POLICY_V1.md`).

---

## 1. Conceptual Model

### Current (pre-pivot)

| Concept | Current behavior |
|--------|------------------|
| **Artifacts** | Runner generates; stored in `artifact`. |
| **Proposals** | Runner (or human) creates `proposal_record` (surface: habitat_layout, avatar_candidate; medium: extension; system: human-only). |
| **Staging** | Runner does **not** write to staging. Staging is populated only when a human approves a proposal (`approve_for_staging` → `mergeHabitatProposalIntoStaging`). |
| **Public** | Human approves proposal → single-proposal write to `public_habitat_content`, or human runs POST `/api/staging/promote` to copy current staging → public. |
| **System** | System proposals are human-initiated and human-approved; runner cannot create them. |

### Target (post-pivot)

| Concept | Target behavior |
|--------|------------------|
| **Staging** | **Agent-owned working state.** The agent may directly update staging for: avatar, habitat layout, presentation refinements, bounded medium usage (extensions). Staging = agent’s current best build. Humans do **not** approve every staging change. |
| **Public** | **Human-approved snapshot.** The agent proposes a **snapshot of the current staging state** for promotion to public. Human approval is required for that promotion. Proposal meaning: “please publish this staging build” (not “please allow this change”). |
| **System** | Unchanged. System proposals remain human-initiated and human-approved; runner must not mutate system state. |

### Proposal meaning shift

- **Before:** “Please allow this change” (per-artifact or per-proposal approval, then merge into staging or public).
- **After (staging):** Agent updates staging directly; no proposal required for each staging mutation.
- **After (public):** “Please publish this staging build” — one **publish-snapshot** proposal that captures current staging; human approves → promote staging → public.

---

## 2. Staging Working State

### 2.1 Data structures representing staging

| Store | Purpose | Existing? |
|-------|---------|-----------|
| **staging_habitat_content** | Current staging habitat composition (one row per page/slug). Columns: slug, title, body, payload_json, source_proposal_id (provenance), updated_at. | Yes. |
| **Staging avatar / presentation** | Agent’s current staging avatar and presentation refinements. Option A: extend `identity` with staging-only columns (e.g. `staging_avatar_artifact_id`, `staging_embodiment_direction`). Option B: single-row table `staging_identity` or `staging_avatar`. | No; minimal addition. |
| **Staging medium state (optional)** | Bounded extension usage in staging (e.g. which extensions are “active” in staging). If needed, a small allowlist or a single JSONB/config row; otherwise keep medium as proposal-only for now. | No; only if required for “bounded medium usage” in staging. |

**Recommendation:**  
- **Habitat:** Keep `staging_habitat_content` as the single source of truth for staging layout; agent gains direct write (upsert by slug).  
- **Avatar:** Add minimal staging avatar state. Prefer **identity-level columns** (e.g. `staging_avatar_artifact_id`, `staging_embodiment_direction`) scoped to active identity so “current staging avatar” is first-class; publish snapshot copies these to `active_avatar_artifact_id` / embodiment on approval.  
- **Presentation refinements:** Treat as part of habitat payload (theme, blocks) or a small staging-only metadata blob; no new subsystem.  
- **Medium in staging:** Govern by extension caps, type allowlists, and moderation; new medium families still require a (medium-lane) proposal. No separate “staging medium” store unless a concrete use case appears.

### 2.2 Mutations the agent may perform directly (runner authority)

The runner may **directly** (no human approval per change):

| Mutation | Target | Guardrails |
|----------|--------|------------|
| **Upsert staging habitat page** | `staging_habitat_content` (by slug) | Valid `habitat_payload` only (existing `validateHabitatPayload`). Optional: slug allowlist or max pages. |
| **Set staging avatar** | Staging avatar store (see above) | Only artifact_id that exists and is image medium; optional approval_state check (e.g. at least approved_for_staging). |
| **Update staging presentation/theme** | Within habitat payload or staging metadata | Same as habitat: validated payload; no arbitrary code. |
| **Bounded medium usage** | If a staging medium store is added | Extension caps, type allowlists, moderation rules; no new medium families without proposal. |

The runner must **not**:

- Write to `public_habitat_content` or set `identity.active_avatar_artifact_id` (public avatar).
- Create or mutate system-lane proposals or system state.
- Bypass validation (e.g. must use `validateHabitatPayload` for any habitat payload written to staging).

### 2.3 Guardrails

- **Validation:** All staging writes must use existing validators (`validateHabitatPayload`, artifact existence, medium type).  
- **Provenance:** Retain `source_proposal_id` on `staging_habitat_content` for traceability; when the runner writes directly, this can be null or a special sentinel (e.g. “runner_direct”) plus optional `session_id` or `creative_session_id` for evidence.  
- **Versioning / archive:** “Previous versions may be archived automatically.” Implement as: on upsert of a staging page, optionally copy current row to an `staging_habitat_archive` (slug, version or updated_at, payload_json, source) before overwriting; or rely on session trace + updated_at for reconstructability. Minimal V1: no new archive table; document that future iteration can add automatic archiving.  
- **Caps:** Existing backlog caps (habitat_layout, avatar, extension) apply to **proposal creation**, not to direct staging writes. For staging, optional guardrails: max staging pages (env), max staging avatar updates per session (if needed).

### 2.4 Which proposal lanes can write directly to staging

| Lane | Direct staging write? | Note |
|------|------------------------|------|
| **Surface (habitat_layout)** | Yes | Runner may upsert `staging_habitat_content` in addition to (or instead of) creating a habitat_layout proposal. |
| **Surface (avatar_candidate)** | Yes | Runner may set staging avatar store; no requirement to create an avatar proposal for every change. |
| **Medium (extension)** | Bounded | If “bounded medium usage” in staging is implemented, runner may enable allowed extension types in staging within caps; new medium families still require a proposal. |
| **System** | No | Runner must never write to staging for system purposes; system state is human-only. |

So: **surface lane** (and optionally bounded medium) can write directly to staging; **system lane** cannot.

---

## 3. Publish Snapshot Proposal

### 3.1 Purpose

A **publish-snapshot proposal** means: “Please publish this staging build to public.” It is the only path from staging → public. Human approval is required.

### 3.2 Snapshots are immutable

Every snapshot, once created, is **never modified**. This makes the system auditable, reproducible, safe, and rollback trivial.

**Snapshot shape (immutable record):**

- `snapshot_id` — unique id (e.g. UUID).
- `habitat_pages[]` — array of page/slug + payload at capture time.
- `avatar_state` — avatar_artifact_id, embodiment_direction (if any).
- `extensions` — bounded extension state at capture time (if applicable).
- `timestamp` — snapshot_created_at.
- `source_session_ids[]` — creative_session ids that contributed to this build.

Snapshots are stored in a dedicated store (e.g. `habitat_snapshot` or equivalent); proposal and promotion reference `snapshot_id`. No in-place edits; new state = new snapshot.

### 3.3 Every publish references the previous public snapshot

Every publish decision is evaluated as **candidate vs current public**. The agent (and human) must see what is changing.

**Required references on each publish proposal:**

- `public_snapshot_id_current` — the snapshot id that currently backs public (e.g. from last promotion or from current `public_habitat_content` exported as a snapshot).
- `candidate_snapshot_id` — the immutable snapshot being proposed for release.

**Diff (computed at proposal creation and stored with the proposal):**

A diff is computed **candidate_snapshot vs current_public_snapshot** and stored as part of the proposal / evidence. Example shape:

```text
avatar_changed: boolean
layout_changed: boolean
blocks_added: number
blocks_removed: number
blocks_updated: number
extensions_changed: boolean
significance: "none" | "minor" | "major"
```

Without this diff, the agent cannot know if the release is meaningful (vs churn). Publish-readiness policy uses it to block when `significance === "none"` (see Publish Snapshot Proposal Policy V1).

### 3.4 Snapshot data captured (candidate)

The **candidate** snapshot (immutable) includes:

- **Habitat:** All slugs and payloads from `staging_habitat_content` at capture time → `habitat_pages[]`.
- **Avatar:** Staging avatar artifact id and embodiment direction → `avatar_state`.
- **Extensions:** Bounded extension state in staging (if any) → `extensions`.
- **Provenance:** `source_session_ids[]`, `snapshot_created_at`.

**Recommendation:** Eager snapshot only. On proposal creation, create an immutable snapshot record, then attach `candidate_snapshot_id` and `public_snapshot_id_current` to the proposal; store `diff_summary` (and optionally full diff) in proposal payload or evidence. Human reviews exact snapshot; on approval, apply that snapshot to public.

### 3.5 Evidence included

- **Provenance:** `source_session_ids[]`, snapshot_id, public_snapshot_id_current.  
- **Diff:** `diff_summary` (avatar_changed, layout_changed, blocks_added/removed/updated, extensions_changed, significance) so agent and human can see “what changed.”  
- **Governance evidence:** Same as today: lane_type (surface), actor_authority (runner), reason_codes; for publish-snapshot, add a clear proposal_role (e.g. `publish_snapshot` or `staging_publication`) so the gate and trace are explicit.  
- **Trace:** Session trace already records proposal_outcome and governance_evidence; publish-snapshot creation should set traceProposalType (e.g. `publish_snapshot`) and persist evidence (including diff_summary and snapshot ids). See **Publish Snapshot Proposal Policy V1** for full evidence shape.

### 3.6 Human review step

- Human sees one proposal: “Publish this staging build” with summary, snapshot summary (slugs, avatar if any), and **diff vs current public** (avatar_changed, layout_changed, blocks added/removed/updated, significance).  
- Actions: **Approve** → apply immutable snapshot to public; **Reject** / **Archive** → no change to public.  
- No change to FSM semantics: approve_for_publication (or a dedicated “approve_publish_snapshot”) transitions to published and triggers promotion.

### 3.7 After approval

- Apply **the immutable snapshot** to public: write snapshot’s habitat_pages to `public_habitat_content`; set `identity.active_avatar_artifact_id` (and embodiment) from snapshot.avatar_state if present.  
- Record promotion in `habitat_promotion_record` (promoted_by = human, snapshot_id = candidate_snapshot_id, previous_public_snapshot_id = public_snapshot_id_current).  
- Advance proposal state to `published`.  
- Staging remains unchanged (still the agent’s working state); only public was updated. The newly applied snapshot becomes the new “current public snapshot” for the next publish evaluation.

---

## 4. System Proposal Boundary

### 4.1 Strict boundary

| Domain | Who can mutate | Runner allowed |
|--------|-----------------|----------------|
| **Staging (surface)** | Agent (runner) + optional human edits | Yes: direct writes to staging_habitat_content and staging avatar within guardrails. |
| **Staging (medium, bounded)** | Agent within caps/allowlists | Yes, only if bounded medium in staging is implemented and governed. |
| **Public** | Human only (via approve publish-snapshot or legacy approve_for_publication) | No. Runner must not write to public_habitat_content or set public avatar. |
| **System (rules, tools, governance, routing)** | Human only | No. Runner must not create system proposals or mutate system state. |

### 4.2 Runner guarantees

- **Runner must NOT:**  
  - Create or update proposals with `lane_type === "system"`.  
  - Call APIs or DB writes that change system configuration, governance rules, tool enablement, or routing.  
  - Write to `public_habitat_content` or set `identity.active_avatar_artifact_id` (except indirectly by creating a publish-snapshot proposal that a human approves).  

- **Runner may:**  
  - Create surface and medium proposals (as today).  
  - Write directly to staging (habitat, staging avatar) per this spec.  
  - Create **publish-snapshot** proposals (surface lane, role e.g. `publish_snapshot`).  

### 4.3 Enforcement

- **proposal-governance:** `canCreateProposal("system", "runner")` already returns block; no change.  
- **Staging APIs:** Any new or updated “runner write to staging” path must validate actor (runner context) and target (staging only); no write to public or system tables.  
- **Promotion path:** POST `/api/staging/promote` and approve_for_publication must remain human-only (auth + actor_authority check).

---

## 5. Proposal Lifecycle Impact

### 5.1 Proposal aging

- **Existing:** Proposals can age; policy can close or archive old pending_review.  
- **Pivot:** Staging is no longer “pending proposals”; it’s live state. Aging applies to:  
  - **Pending publish-snapshot proposals:** Still age like other proposals; if multiple are created, “latest” or “supersedes previous” can be defined.  
  - **Legacy habitat_layout/avatar proposals:** If we keep them as optional (e.g. for “suggest a change” in addition to direct staging writes), they continue to age.  

No change to general aging policy; only the mix of proposal types may include more “publish_snapshot” and fewer per-artifact habitat proposals if the agent prefers direct staging updates.

### 5.2 Supersession

- **Staging:** Direct overwrite by slug (and staging avatar) is implicit supersession; no proposal chain.  
- **Publish-snapshot:** If the agent creates a new publish-snapshot while a previous one is pending_review, policy can: (a) allow multiple pending (human picks one), (b) supersede previous (archive or mark superseded), or (c) cap at one pending publish-snapshot. Minimal: allow one pending publish-snapshot per “build” or time window; new one supersedes previous (archive or update).  

Document supersession rule in proposal-governance or stop-limits (e.g. max pending publish_snapshot = 1; new create archives previous).

### 5.3 Duplicate handling

- **Structural duplicate:** Same artifact + role already has pending proposal — still applies to extension and (if we keep them) per-artifact habitat/avatar proposals.  
- **Publish-snapshot:** “Duplicate” could mean “same staging content already proposed.” Optional: hash of snapshot and skip or warn if identical to a recent publish-snapshot. Minimal V1: no dedupe by content; optional later.

### 5.4 Proposal caps

- **Existing caps:** `getMaxPendingHabitatLayoutProposals`, `getMaxPendingAvatarProposals`, `getMaxPendingExtensionProposals` limit **proposal** creation.  
- **Pivot:** Direct staging writes are **not** proposals; they don’t consume these caps. Caps still apply when the runner creates proposals (e.g. extension proposals, or optional habitat/avatar proposals if both paths exist).  
- **New cap:** If publish-snapshot is a distinct proposal role, add `getMaxPendingPublishSnapshotProposals()` (e.g. 1) to avoid a long queue of “publish this build” proposals.

---

## 6. Minimal Code Changes

### 6.1 Session runner (`apps/studio/lib/session-runner.ts`)

- **Direct staging writes (habitat):** In or after `manageProposals`, when the runner would create or update a habitat_layout proposal, **additionally** (or instead) call a small helper that upserts into `staging_habitat_content` with the same validated payload. Keep proposal path optional or phased: e.g. “always write to staging; optionally also create/update a proposal for human awareness.”  
- **Staging avatar:** When the runner would create an avatar_candidate proposal, optionally write to staging avatar store (new columns or table) so staging reflects current avatar; proposal creation can remain for “suggest avatar” or be reduced in favor of direct staging.  
- **Publish-snapshot proposal:** New branch in `manageProposals` (or a separate step): **when** to propose is governed by **Publish Snapshot Proposal Policy V1** (snapshot capture, diff vs current public, meaningful_change, coherence, stability, cadence). When policy returns allow: create immutable snapshot, compute diff vs current public snapshot, create proposal with role `publish_snapshot`, attach candidate_snapshot_id and public_snapshot_id_current; store diff_summary and publish_snapshot_evidence in trace. Use existing gate with lane surface and actor runner; add proposal_role to classifyProposalLane / gate if needed.  
- **Trace:** Extend trace with `staging_direct_write` (e.g. slugs updated, staging_avatar_updated) and `publish_snapshot_proposal_id` when created. No change to governance evidence shape; add reason_codes for publish_snapshot if desired.

### 6.2 Proposal governance (`apps/studio/lib/proposal-governance.ts`)

- **Lane classification:** Ensure `publish_snapshot` (or chosen role name) is classified as **surface** and has a clear classification_reason.  
- **Create authority:** Runner may create surface proposals (already true); no change for system (runner still blocked).  
- **Transition:** approve_for_publication → published for publish_snapshot same as other surface proposals.  
- No new subsystems; only role and possibly a small branch in classification.

### 6.3 Staging APIs

- **Write path for runner:** New or updated API used **only by the session runner** (server-side, no public HTTP for writes): e.g. `mergeStagingFromRunner(supabase, payload)` that upserts `staging_habitat_content` and optionally updates staging avatar. Alternatively, the runner calls the same `mergeHabitatProposalIntoStaging` with a synthetic “runner_direct” proposal id or null source_proposal_id and a validated payload. Prefer reusing `mergeHabitatProposalIntoStaging` with a lightweight “runner direct” mode (no proposal_record id) to avoid duplicate logic.  
- **Read path:** GET `/api/staging/composition` unchanged. If staging avatar is added, extend response or add GET `/api/staging/avatar` (or include in composition).

### 6.4 Staging composition (`apps/studio/lib/staging-composition.ts`)

- **mergeHabitatProposalIntoStaging:** Allow `source_proposal_id` to be null or optional when caller is runner (direct write). Signature already takes proposalRecordId; add overload or optional param for “runner direct” (source_proposal_id = null).  
- **promoteStagingToPublic:** Unchanged for human-triggered promote. When a publish-snapshot proposal is approved, either: (a) call this with current staging (lazy snapshot), or (b) apply snapshot from proposal payload (eager snapshot). Prefer (b) for deterministic review.

### 6.5 Proposal records (schema / types)

- **proposal_record:** Add or reuse a role for publish-snapshot (e.g. `proposal_role = 'publish_snapshot'`). Optionally add `publish_snapshot_json` or use existing `habitat_payload_json` for multi-page snapshot; for single-page or reference, existing fields may suffice.  
- **Evidence and trace:** Reuse governance_evidence and proposal_outcome; add `publish_snapshot` to traceProposalType enum or string set.

### 6.6 Approve route (`apps/studio/app/api/proposals/[id]/approve/route.ts`)

- When proposal is `publish_snapshot` and action is approve_for_publication: load snapshot from proposal (eager) or current staging (lazy), then write to `public_habitat_content` and update identity for avatar; insert `habitat_promotion_record`; set proposal state to published.  
- No change to system or medium approval paths.

### 6.7 Stop-limits / caps (`apps/studio/lib/stop-limits.ts`)

- Add `getMaxPendingPublishSnapshotProposals()` (e.g. default 1) and use in session-runner before creating a publish-snapshot proposal.

---

## Summary Table

| Area | Change |
|------|--------|
| **Staging** | Agent may write directly to staging_habitat_content (and minimal staging avatar); staging = agent working state. |
| **Public** | Only via human-approved publish-snapshot (or legacy single-proposal approve_for_publication). |
| **Proposal meaning** | Staging: no “approve this change” per artifact; Public: “publish this staging build.” |
| **System** | Unchanged; runner never creates system proposals or mutates system state. |
| **Code** | Session-runner: direct staging upsert + publish-snapshot proposal branch (gated by Publish Snapshot Proposal Policy V1). Governance: classify publish_snapshot as surface. Staging-composition: optional runner-direct merge. Approve route: handle publish_snapshot → promote. Caps: optional max pending publish_snapshot. Snapshots: immutable; every publish references public_snapshot_id_current + candidate_snapshot_id + diff_summary. |

This framework keeps the existing agent, governance, and traceability model, and introduces only the minimal staging write path, immutable snapshots, diff-based publish comparison, publish-snapshot proposal type, and approval semantics needed for the pivot. **When** to propose a publish is defined in Publish Snapshot Proposal Policy V1.
