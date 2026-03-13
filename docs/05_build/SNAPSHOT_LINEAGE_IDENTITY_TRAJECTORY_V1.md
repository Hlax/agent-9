# Snapshot Lineage + Identity Trajectory V1 — Framework Spec

**Date:** 2026-03-13  
**Context:** Governance V1, Proposal Policy V1, Staging Pivot Framework, and Publish Snapshot Proposal Policy V1 are in place. This spec defines the **minimal** subsystem that makes snapshot history usable as identity-memory and continuity, without a large ontology or agent redesign.

**Scope:** Architectural only. No agent redesign. No broad semantic ontology. Minimal, inspectable, consistent with current architecture.

---

## Conceptual Purpose

**Current state:** The system has agent-owned staging, immutable snapshots, human-approved publish-snapshot proposals, candidate-vs-current-public diff, and evidence-backed publish readiness. That is **good release infrastructure**.

**Goal:** Move toward **persistent evolving agent identity** by:

- Making each snapshot know where it came from (lineage).
- Enabling comparison across a **sequence** of snapshots, not just one diff.
- Detecting recurring traits and directions.
- Allowing lineage-derived signals to later influence publish stability and identity continuity.

**V1 constraint:** The purpose is to **design the smallest architecture** that supports the above. Implementation of full “identity memory” behavior is out of scope; we only define the data model, derived summaries, and a very small set of policy consumers.

---

## 1. Snapshot Lineage Model

### 1.1 Minimal lineage fields

Every immutable snapshot record carries:

| Field | Type | Purpose |
|-------|------|---------|
| **snapshot_id** | UUID | Unique id (already in scope). |
| **identity_id** | UUID, NOT NULL | Identity this snapshot belongs to. Required for multi-twin / multi-habitat / multi-identity. Today use the active identity (e.g. single "default" or current identity_id); add to schema now—future migration without it is painful. |
| **parent_snapshot_id** | UUID, nullable | The snapshot this one was derived from or follows. |
| **snapshot_kind** | enum | `staging` \| `public`. |
| **created_at** | timestamptz | Capture time (already in scope). |
| **source_session_ids** | UUID[] | Sessions that contributed (already in scope). |
| **lineage_metadata** | JSONB, optional | V1: optional free-form; reserve for future (e.g. capture_trigger, branch_hint). Keep null or empty in V1. |

All lineage and trajectory operations are **scoped by identity_id**. `getTrajectorySummary(identityId, lastN)` returns trajectory for that identity only; snapshot queries filter by identity_id. No extra lineage fields in V1. No "child_ids" or "branch_id" unless required for a single consumer; prefer recomputing from parent links on read.

### 1.2 How parent linkage works

- **Public snapshots:** Form a **linear chain**. When a snapshot is promoted to public, its `parent_snapshot_id` = the **previous** public snapshot (the one that was "current public" before this promotion). The first public snapshot has `parent_snapshot_id = null`.
- **Staging snapshots:** Each staging snapshot is created when the runner captures "current staging" (e.g. for a publish proposal or for a periodic capture). Its `parent_snapshot_id` = the **public snapshot that was current at capture time** (i.e. the "base" we are diffing against). So staging snapshots do not form a chain among themselves; they each point to the public snapshot they were staged relative to.

Result:

- **Public lineage** = single chain: P0 → P1 → P2 → … (each Pi is an approved snapshot).
- **Staging snapshots** = each points to some Pk; multiple staging snapshots can point to the same Pk. So we have a **chain for public** and **staging nodes that reference that chain**, not a tree of staging branches.

Optional future: if "staging chain" is needed (e.g. "staging S2 was captured after S1"), add a second field like `previous_staging_snapshot_id` later. V1 does not add it.

### 1.3 Chain vs tree

- **V1: chain for public, staging references public.** Public is a chain; staging snapshots reference "current public at capture time." No tree, no branching ontology.
- **Later:** If staging branches are introduced, lineage can be extended (e.g. optional `previous_staging_snapshot_id` or `branch_id`). Not in V1.

### 1.4 How public and staging snapshots relate

- **Public snapshot:** Created at promotion time; `snapshot_kind = 'public'`; `parent_snapshot_id` = previous public snapshot.
- **Staging snapshot:** Created at capture time (e.g. when evaluating a publish proposal); `snapshot_kind = 'staging'`; `parent_snapshot_id` = the public snapshot that was current when this staging state was captured (i.e. `public_snapshot_id_current` at that moment).

So: "this staging build was captured relative to that public state." On promotion, that staging snapshot becomes a public snapshot (either we **re-tag** the same row to `snapshot_kind = 'public'` and set its `parent_snapshot_id` to the previous public, or we **copy** the payload into a new public snapshot row and keep the staging row immutable—prefer **new row** for public so staging row stays immutable and we have a clean "promoted" public chain).

---

## 2. Identity Trait Summary

### 2.1 Purpose

A small **derived** summary per snapshot so we can compare snapshots and detect recurrence/volatility without re-parsing full payloads. Not a content ontology—just operational, structural signals.

### 2.2 Lightweight trait fields (V1)

Stored once at snapshot creation; derived from the snapshot payload. Fixed schema; no open-ended taxonomy.

| Trait bucket | Content | Persisted? | Notes |
|--------------|---------|------------|--------|
| **avatar** | `avatar_artifact_id` (UUID or null), `embodiment_length` (0 = none, 1 = short, 2 = long or enum) | Yes, in snapshot record or trait_summary | No "avatar ontology"; just presence and size. |
| **layout_signature** | Ordered list of slugs (e.g. `["home","about"]`), optionally `slug_count` | Yes | Enables "same layout?" and layout_changed. |
| **block_profile** | Counts by **closed enum** of block types only (see §2.6). Not arbitrary block names—unknown types map to `other`. | Yes | Enables "block mix changed?" and diff; avoids implicit ontology. |
| **extension_profile** | List of extension type ids or names (from bounded extensions), or `[]` | Yes | Enables extensions_changed. |
| **theme_tone** | Optional: single enum or small set (e.g. `theme_density: "compact"|"normal"|"wide"`, or reserved for future). | Optional in V1 | Can be null; add only if already present in payload and trivial to extract. |

**No:** semantic tags, content categories, aesthetic scores, or open-ended key-value traits. **Yes:** only what is needed to compute diff_summary and simple recurrence (e.g. "same avatar_artifact_id appeared in last 3 public snapshots").

### 2.3 Persisted vs derived

- **Persisted:** Trait summary is **computed at snapshot creation** and stored with the snapshot (e.g. column `trait_summary` JSONB). Never recomputed; snapshot remains immutable.
- **Derived on read:** Trajectory summary (see §3) is computed from the last N snapshots' trait summaries and lineage; it is **not** stored as a first-class entity in V1 (or stored as a cache with TTL if needed for performance).

### 2.4 Inspectability

- Trait summary is part of the snapshot record (or a single JSONB column). Exposed via existing "get snapshot" or "get snapshot lineage" read path. No separate trait store.
- Operators can inspect: snapshot_id, parent_snapshot_id, snapshot_kind, created_at, trait_summary (avatar, layout_signature, block_profile, extension_profile, optional theme_tone).

### 2.5 Avoiding taxonomy bloat

- **Fixed keys only.** No dynamic trait types; no user-defined categories.
- **No expansion in V1.** New trait dimensions require a new spec (e.g. V2). V1 stays with the five buckets above (avatar, layout_signature, block_profile, extension_profile, optional theme_tone).

### 2.6 Block profile: closed enum only

**block_profile** must **not** count by arbitrary block name. Arbitrary types would create an implicit ontology. Use a **closed enum**; everything unknown → `other`.

**V1 canonical block types:** `hero`, `text`, `artifact_grid`, `artifact`, `extension`, `other`.

**Rule:** When deriving trait_summary from the payload, map each block's type to one of the above. If the payload contains a block type not in this list, count it as `other`. Do not add new keys to block_profile at runtime. Example shape: `{ hero: 1, text: 3, artifact_grid: 1, artifact: 0, extension: 0, other: 0 }`. Adding a new canonical type requires a spec change (e.g. V2).

---

## 3. Identity Trajectory Summary

### 3.1 Purpose

A small summary computed **across the last N snapshots** (e.g. N = 5 or 10, configurable) to support stability and continuity signals. Not a "memory system"—just a numeric/categorical summary.

### 3.2 What to compute in V1

| Signal | Description | Representation |
|--------|-------------|----------------|
| **volatility** | How often traits changed over the last N snapshots (e.g. share of consecutive pairs with different layout or avatar). | `volatility_index` in [0,1] or "low"/"medium"/"high". |
| **recurring_traits** | Traits that appear in more than one of the last N snapshots (e.g. same avatar_artifact_id, same layout_signature). | Small list: e.g. `recurring_avatar: boolean`, `recurring_layout: boolean`, optional `recurring_block_profile: boolean`. |
| **reversions** | Trait reverted to an earlier value (e.g. avatar A → B → A). | `reversion_detected: boolean` (or per-trait if trivial). |
| **last_publish_snapshot_id** | Snapshot id of the most recent public snapshot in the lineage. | UUID, for "distance from last publish." |
| **interval_since_last_publish** | Time (or "number of staging snapshots") since last public snapshot. | e.g. seconds or count; used for cadence/stability. |

**Out of scope for V1:** publish interval *patterns* (e.g. "every 2 weeks"), staging/public *drift* as a formal metric, convergence scores, or any ML-derived signal. Keep to: volatility, recurrence, reversion, last publish ref, interval.

### 3.3 Representation

- **Computed on read** from last N snapshot rows **for that identity** (filter by `identity_id`; then by created_at or lineage walk). Input: `identity_id` + N. Trajectory is always identity-scoped.
- **Output shape:** Single object, e.g.:

```ts
TrajectorySummaryV1 = {
  snapshot_ids_considered: UUID[],   // last N
  volatility_index: number,           // 0..1
  recurring_avatar: boolean,
  recurring_layout: boolean,
  reversion_detected: boolean,
  last_public_snapshot_id: UUID | null,
  interval_since_last_public_seconds: number | null,
}
```

- **Storage:** Do **not** store as a separate "trajectory" table in V1. Either compute on demand when a consumer needs it, or cache in memory/Redis with short TTL keyed by (identity_id, N). If persistence is required for trace, store a **copy** of the summary in the session trace or publish_snapshot_evidence, not as a global trajectory row.

### 3.4 What remains out of scope (V1)

- Deep semantic similarity between snapshots.
- "Identity convergence" as an autonomous decision input.
- Staging/public drift as a first-class metric.
- Publish interval pattern mining.
- Any new ontology (themes, moods, content types beyond the fixed trait buckets).

---

## 4. Policy Consumers

### 4.1 Minimal set of consumers (V1)

Only the following may **read** lineage and/or trajectory in V1:

| Consumer | What it reads | How it uses it |
|----------|----------------|----------------|
| **Publish snapshot stability check** | Trajectory: volatility_index, interval_since_last_public, optional reversion_detected. | Optional **soft** input to Publish Snapshot Proposal Policy V1 (e.g. "warn if volatility is high" or "defer if interval too short"). Does **not** replace existing stability/churn rules; it augments them. |
| **Identity continuity evidence in trace** | Lineage: parent_snapshot_id, snapshot_kind; optional trait_summary for candidate and current public. | Attach to session trace or publish_snapshot_evidence so operators can see "this proposal was built on top of snapshot X" and "trajectory summary at decision time." Inspectable only; no control flow change. |
| **Staging avatar refinement** | **Deferred.** Do **not** consume trajectory in staging avatar logic in V1. | Out of scope for V1 to avoid coupling. |
| **Candidate-vs-public publish review (advisory)** | Derived diff between candidate habitat payload and current public snapshot for the same identity, optionally combined with TrajectorySummaryV1. | Exposed as a **read-only advisory layer** (e.g. `/api/staging/publish-review`) that produces a structured PublishReadinessReviewV1 object. Compares candidate vs current public trait_summary (avatar, layout_signature, block_profile, extension_profile) and uses trajectory only as soft context. **Must not** be a hard gate in V1, must not change mode/drive/proposal logic, and must not write or persist any new trajectory tables or review rows. It does **not** replace human/operator review. |

So in V1 the only **behavioral** consumer is the publish stability check (optional soft signal). The only **observability** consumer is trace/evidence (lineage + optional trajectory copy).

### 4.2 What must NOT consume these signals yet

- **Mode selection / drive / focus:** No trajectory or lineage input. Governance and proposal policy remain as sealed.
- **Proposal creation gates** (habitat, avatar, extension): No lineage or trajectory. Only the publish-snapshot path may optionally use trajectory for stability.
- **Staging direct writes:** No lineage or trajectory. Snapshot creation records lineage; it does not read trajectory to decide what to write.
- **System / governance / routing:** No access to lineage or trajectory.

### 4.3 Preventing over-coupling

- **Trajectory is optional input.** Publish readiness policy already has stability (e.g. "staging changed recently"). Trajectory is at most an **additional** input (e.g. volatility_index). If trajectory is unavailable or not computed, policy behaves as today.
- **No new mandatory gates.** No "block if no lineage" or "block if trajectory says X." At most "warn" or "defer" with a new reason_code.
- **Single read path.** One function or module: e.g. `getTrajectorySummary(identityId, lastN)`. All consumers call that; no duplicated lineage logic. Snapshot queries and trajectory computation always filter by `identity_id`.

---

## 5. Minimal Schema / Code Changes

### 5.1 Snapshot record (schema)

- **Table (or equivalent):** e.g. `habitat_snapshot` or extend existing snapshot store.
- **New or extended columns:**
  - `identity_id` UUID NOT NULL REFERENCES identity(identity_id). **Required.** Even if today there is only one identity (e.g. "default"), add it now so multi-twin / multi-habitat / multi-identity does not require a painful migration later. All snapshot and trajectory reads are scoped by identity_id.
  - `parent_snapshot_id` UUID NULL REFERENCES snapshot(snapshot_id).
  - `snapshot_kind` TEXT NOT NULL CHECK (snapshot_kind IN ('staging', 'public')).
  - `created_at`, `source_session_ids` (already in scope).
  - `trait_summary` JSONB NULL — avatar, layout_signature, block_profile (closed enum only, §2.6), extension_profile, optional theme_tone.
  - Optional `lineage_metadata` JSONB NULL (reserved; keep null in V1).
- **Existing:** snapshot_id, payload (habitat_pages, avatar_state, extensions). No change to payload shape.

### 5.2 Snapshot creation path

- When creating a **staging** snapshot: set `identity_id` (active identity; e.g. current or "default"), `snapshot_kind = 'staging'`, `parent_snapshot_id = public_snapshot_id_current` (at capture time). Compute `trait_summary` from payload (block_profile using closed enum §2.6); write to snapshot record.
- When promoting to **public:** Create a **new** snapshot row with same payload (or reference), same `identity_id`, `snapshot_kind = 'public'`, `parent_snapshot_id` = previous public snapshot id for that identity; copy or recompute `trait_summary`. Optionally keep staging snapshot row unchanged (no re-tag).
- **Lineage metadata:** Leave null in V1.

### 5.3 Publish evaluation path

- When evaluating publish readiness, **optionally** call `getTrajectorySummary(identityId, N)` and pass volatility_index (and optionally interval_since_last_public, reversion_detected) into the existing stability step. If trajectory is missing, skip or treat as "no signal."
- No new hard block; at most new reason_codes for warn/defer (e.g. `HIGH_VOLATILITY`, `RECENT_PUBLISH_BY_TRAJECTORY`).

### 5.4 Trace / evidence payloads

- **publish_snapshot_evidence:** Add optional `lineage_snapshot`: { candidate_snapshot_id, public_snapshot_id_current, parent_snapshot_id for each }. Add optional `trajectory_summary`: copy of TrajectorySummaryV1 at decision time (so operators can inspect "what trajectory did the policy see?").
- **Session trace:** Optional field `identity_trajectory_snapshot` or similar when a publish proposal was considered (even if not created), for continuity debugging.

### 5.5 Read APIs

- **Get snapshot by id:** Return snapshot row including parent_snapshot_id, snapshot_kind, trait_summary (already implied by "get snapshot").
- **Get trajectory summary:** New internal helper or API: `getTrajectorySummary(identityId, lastN)` returning TrajectorySummaryV1. Snapshots are filtered by `identity_id`; trajectory is always identity-scoped. Used by publish stability and by trace/evidence. No public HTTP required in V1 if only session-runner and trace use it; optional GET for Studio for inspectability.

### 5.6 No broad rewrites

- No change to proposal FSM, governance rules, or artifact/proposal creation. No new tables beyond snapshot store extension (and optional cache for trajectory if needed). No change to staging direct-write path except that when we *create* a snapshot we now persist lineage + trait_summary.

---

## 6. Risks / Scope Boundaries

| Risk | Mitigation |
|------|-------------|
| **Ontology creep** | V1 trait summary has fixed keys only; no new dimensions without a new spec. Trajectory has fixed signals (volatility, recurrence, reversion, interval). |
| **Over-coupling** | Only one behavioral consumer (publish stability, optional soft). Trace is observability only. No consumer in mode/drive/proposal gates. |
| **Schema complexity** | One snapshot table with a few columns (parent_snapshot_id, snapshot_kind, trait_summary); no separate lineage or trajectory tables. |
| **Staging/public confusion** | snapshot_kind and parent_snapshot_id semantics are explicit: public = chain, staging = points to public at capture. |
| **Performance** | Trajectory computed on read over last N rows; N small (5–10). Optional cache if needed. No heavy graph walk. |
| **Governance boundary** | Lineage/trajectory do not touch system lane, proposal creation authority, or runner system restrictions. |

**Explicitly out of V1:**

- Staging avatar refinement using trajectory.
- Any "identity memory" that drives agent behavior beyond optional publish stability.
- Tree or branch lineage; semantic or content ontologies; ML or similarity models.
- New mandatory gates or policy blocks based on lineage/trajectory.

---

## Summary

- **Lineage:** Each snapshot has **identity_id** (NOT NULL; required for multi-identity future), parent_snapshot_id, snapshot_kind (staging | public), created_at, source_session_ids; public = chain per identity, staging = points to public at capture. All reads and trajectory are identity-scoped.
- **Traits:** Small fixed trait_summary per snapshot (avatar, layout_signature, **block_profile with closed enum only**: hero, text, artifact_grid, artifact, extension, other—unknown → other), extension_profile, optional theme_tone); persisted at creation; no taxonomy expansion.
- **Trajectory:** Computed on read from last N snapshots: volatility, recurring traits, reversion, last public snapshot, interval since last public; not stored as first-class table; optional copy in trace/evidence.
- **Consumers:** Publish stability (optional soft), trace/evidence (inspectable); no mode/drive/proposal-gate consumption; no staging avatar refinement in V1.
- **Code/schema:** Extend snapshot record with lineage + trait_summary; snapshot creation and promotion set them; publish evaluation optionally uses getTrajectorySummary; trace/evidence carry optional lineage and trajectory snapshot.

This keeps the architecture minimal, inspectable, and future-safe for a later "identity memory" layer without committing to it in V1.

---

## Architectural Risk Audit (Validation)

Review of the Snapshot Lineage + Identity Trajectory V1 framework against ontology bloat, coupling, governance, schema complexity, and V1 deferrals.

### Ontology bloat

- **Finding:** Trait summary defines five buckets (avatar, layout_signature, block_profile, extension_profile, theme_tone). Fixed keys only; no open-ended taxonomy. block_profile is now a closed enum in §2.6 (hero, text, artifact_grid, artifact, extension, other); unknown → other.
- **Recommendation:** **Accept.** No arbitrary block names; canonical list in §2.6. New block types require a spec change.

### Excessive coupling into control flow

- **Finding:** Only one behavioral consumer (publish stability) with optional soft signal; trajectory is optional input; “if trajectory unavailable, policy behaves as today.”
- **Recommendation:** **Accept.** To harden: in implementation, require that publish readiness **never** blocks solely on trajectory (only warn/defer). Add a single sentence to the policy doc: “Trajectory-derived signals may only add warnings or deferrals; they must not introduce new hard blocks.”

### Governance boundary violations

- **Finding:** Lineage and trajectory are not used for system lane, proposal creation authority, or runner system restrictions. Consumers are publish stability (surface) and trace/evidence.
- **Recommendation:** **Accept.** No changes. Keep explicit: “No consumer in mode/drive/proposal gates” and “System / governance / routing: No access to lineage or trajectory.”

### Unnecessary schema complexity

- **Finding:** One snapshot table extended with identity_id, parent_snapshot_id, snapshot_kind, trait_summary, optional lineage_metadata. No separate lineage or trajectory table; trajectory computed on read.
- **Recommendation:** **Accept.** One caveat: if “promotion” creates a **new** public snapshot row (recommended), ensure we do not duplicate large payloads—prefer payload reference (e.g. same blob/store key) or ensure payload copy is a documented, one-time cost. No extra tables for V1.

### Deferrals (should be out of V1)

- **Finding:** Staging avatar refinement is correctly deferred. “Identity memory” behavior, tree lineage, staging chain, drift/convergence metrics, and ML/similarity are out of scope.
- **Recommendation:** **Accept.** Add one explicit deferral: **do not** add a “trajectory_history” or “lineage_graph” table in V1. Trajectory is always derived from snapshot rows; no materialized trajectory table. That prevents schema and consistency drift.

### Summary of audit

| Check | Result | Action |
|-------|--------|--------|
| Ontology bloat | OK | Closed enum in §2.6; no arbitrary block names. |
| Coupling | OK | Codify: trajectory = warn/defer only, no new hard blocks. |
| Governance | OK | None. |
| Schema complexity | OK | Avoid payload duplication on promotion; no trajectory table. |
| Deferrals | OK | No trajectory_history table; trajectory derived only. |

**Verdict:** The framework is minimal and safe for V1. Apply the small doc/code clarifications above when implementing.
