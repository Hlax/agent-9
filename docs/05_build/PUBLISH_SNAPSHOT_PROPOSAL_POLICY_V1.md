# Publish Snapshot Proposal Policy V1

**Date:** 2026-03-13  
**Context:** Staging Pivot Framework Spec defines staging as the agent’s working state and public as human-approved release. This policy defines **when** the agent may create a publish-snapshot proposal. It plugs directly into that architecture.

**Scope:** Policy only. No agent redesign. Integrates with Evidence Ledger V1 and proposal governance.

---

## 1. Purpose

The publish-snapshot proposal allows the agent to request promotion of its **current staging build** to the public habitat.

The proposal represents:

> “The current staging state is coherent, stable, and meaningfully improved relative to the current public state.”

Human approval remains required. This policy governs **whether** the runner is allowed to create such a proposal (allow / defer / block).

---

## 2. Inputs

The evaluation consumes:

| Input | Description |
|-------|-------------|
| **candidate_snapshot** | Immutable snapshot of current staging (habitat_pages, avatar_state, extensions, timestamp, source_sessions). |
| **current_public_snapshot** | The snapshot that currently backs public (reference for diff). |
| **staging_metadata** | staging_last_changed_at, session counts, etc. |
| **recent_session_trace** | For coherence and stability signals. |
| **publish_history** | Recent publish proposals and promotions (for cadence guard). |

---

## 3. Snapshot Creation

Before evaluation, the runner captures a snapshot. Snapshots are **immutable** (see Staging Pivot Framework Spec §3.2).

**candidate_snapshot_id** — Snapshot includes:

- `habitat_pages[]` — slugs and payloads from staging_habitat_content at capture time.
- `avatar_artifact_id` — staging avatar (if any).
- `embodiment_direction` — staging embodiment text (if any).
- `extensions[]` — bounded extension state (if applicable).
- `snapshot_created_at` — timestamp.
- `source_sessions[]` — creative_session ids that contributed.

If snapshot creation fails, the runner must not create a publish proposal; evaluation is skipped with `decision = block`, `reason_code = SNAPSHOT_CAPTURE_FAILED`.

---

## 4. Hard Eligibility Requirements

A publish proposal may **only** be created if **all** hard conditions pass.

### 4.1 Snapshot capture success

- `snapshot_created == true`.

If snapshot creation fails:

- **decision** = block  
- **reason_code** = `SNAPSHOT_CAPTURE_FAILED`

### 4.2 Structural validity

The snapshot must render as a valid public habitat.

Checks include:

- Valid habitat payload (existing `validateHabitatPayload`).
- Required public slugs exist (if a required set is defined).
- Avatar artifact exists if specified (and is image medium).
- No invalid extensions (within allowlist).
- No schema violations.

If any fail:

- **decision** = block  
- **reason_code** = `STRUCTURE_INVALID`

### 4.3 Guardrail compliance

Snapshot must pass:

- Moderation checks (if applicable).
- Extension allowlists.
- Governance constraints (no forbidden content or types).

If violated:

- **decision** = block  
- **reason_code** = `POLICY_GUARDRAIL_FAILURE`

---

## 5. Diff Against Current Public

Compute a diff summary:

**candidate_snapshot** vs **current_public_snapshot** (or current public state exported as snapshot).

```ts
diff_summary = {
  avatar_changed: boolean,
  layout_changed: boolean,
  blocks_added: number,
  blocks_removed: number,
  blocks_updated: number,
  extensions_changed: boolean,
}
```

### 5.1 Significance scoring (heuristic)

Significance is computed from the diff summary. The rule is **explicit** so implementations and debugging are unambiguous. Evaluate in order; first match wins.

**→ major** (substantive change):

- `avatar_changed === true`
- `layout_changed === true`
- `(blocks_added + blocks_removed) >= 2`
- `blocks_updated >= 3`

**→ minor** (small tweak), if not major:

- `blocks_updated >= 1`
- `blocks_added === 1`
- `blocks_removed === 1`

**→ none** (no meaningful change):

- Else (no conditions above met).

Example (pseudocode):

```ts
function computeSignificance(diff: DiffSummary): "none" | "minor" | "major" {
  if (diff.avatar_changed || diff.layout_changed) return "major";
  if (diff.blocks_added + diff.blocks_removed >= 2) return "major";
  if (diff.blocks_updated >= 3) return "major";
  if (diff.blocks_updated >= 1 || diff.blocks_added === 1 || diff.blocks_removed === 1) return "minor";
  return "none";
}
```

The exact thresholds (e.g. 2, 3) can be tuned later via config or env; the **structure** of the heuristic (avatar/layout → major, block deltas → major/minor/none) remains canonical for V1.

**Meaningful change rule:**

Publish requires:

```ts
diff.significance >= minor
```

If `significance === "none"`:

- **decision** = block  
- **reason_code** = `NO_MEANINGFUL_CHANGE`

This prevents publish spam and ensures the agent only proposes when there is something to release.

---

## 6. Coherence Evaluation

A snapshot is **coherent** when:

- Habitat pages belong to the same layout/theme.
- Avatar style matches presentation direction (if both present).
- No incomplete generation artifacts exist in the snapshot.
- Extensions are compatible with each other and the habitat.

If coherence is low:

- **decision** = warn (does **not** block publish).  
- **reason_code** = `LOW_BUILD_COHERENCE`

This informs the human reviewer; the agent may still propose.

---

## 7. Stability Evaluation

Publishing should not be encouraged during **rapid staging churn**.

Stability signals include:

- `staging_last_changed_at` — how recently staging was updated.
- `sessions_since_major_change` — whether recent sessions produced major changes.
- `repeated_trait_selection` — whether the agent is still iterating on the same traits.

**Rule (example):**

- If staging changed very recently **and** there are no recurrence/settling signals → `stability_ok = false`.

Result:

- **warn:** `VOLATILE_BUILD`

Not a hard block. Used to inform deferral or human awareness.

---

## 8. Publish Cadence Guard

Prevent proposal spam.

**Example rule:**

- If a publish proposal was created very recently (e.g. within last N hours or last K sessions), then **block** unless `diff.significance === "major"`.

Reason code:

- `PUBLISH_TOO_FREQUENT`

Configurable via env (e.g. `MIN_PUBLISH_PROPOSAL_INTERVAL_HOURS`, `ALLOW_MINOR_IF_RECENT_PUBLISH`).

---

## 9. Final Decision

Evaluation returns a structured result:

```ts
PublishSnapshotEvaluation {
  structurally_valid: boolean,
  meaningful_change: boolean,
  coherence_ok: boolean,
  stability_ok: boolean,
  cadence_ok: boolean,

  decision: "allow" | "defer" | "block",
  reason_codes: string[],
}
```

**Decision logic:**

1. If any **hard block** (snapshot failed, structure invalid, guardrail failure) → **block**.
2. Else if **meaningful_change === false** (significance === "none") → **block**.
3. Else if **cadence** violation → **block**.
4. Else → **allow**.

**defer** can be used when the policy wants to signal “not now” without a hard block (e.g. stability warn only); for V1, treat defer as allow for creation but attach warn reason_codes to evidence.

---

## 10. Proposal Creation

If **decision === allow**:

Create proposal:

- `proposal_role` = `publish_snapshot`
- `lane_type` = surface
- `actor_authority` = runner
- `snapshot_id` = candidate_snapshot_id (or proposal payload references it)
- `public_snapshot_id_current` = id of snapshot currently backing public

Proposal payload contains (or references) the immutable snapshot and the diff_summary.

---

## 11. Trace Evidence

Persist evaluation so operators can reconstruct “why this publish was proposed or blocked.”

```ts
publish_snapshot_evidence = {
  snapshot_id: string,
  public_snapshot_id: string,
  diff_summary: {
    avatar_changed, layout_changed,
    blocks_added, blocks_removed, blocks_updated,
    extensions_changed, significance,
  },
  structurally_valid: boolean,
  coherence_ok: boolean,
  stability_ok: boolean,
  cadence_ok: boolean,
  reason_codes: string[],
  decision: "allow" | "defer" | "block",
}
```

This integrates with the existing Evidence Ledger and session trace (e.g. `governance_evidence` or a dedicated `publish_snapshot_evidence` field).

---

## 12. Human Approval

On human **approve** (unchanged from Staging Pivot Framework Spec):

- `public_habitat_content` ← snapshot.habitat_pages
- `identity.active_avatar_artifact_id` (and embodiment) ← snapshot.avatar_state
- `habitat_promotion_record.insert(..., snapshot_id, previous_public_snapshot_id)`
- proposal_state = `published`

Staging remains unchanged. Only public is updated from the immutable snapshot.

---

## 13. Optional Future Signals (Not Required for V1)

These may improve decision quality in a later iteration:

- Identity convergence detection.
- Aesthetic reinforcement signals.
- Audience feedback signals.
- Staging dwell time.
- Human rejections history (e.g. avoid repeating recently rejected snapshot shape).

Not required for V1.

---

## 14. One-Sentence Summary

A publish-snapshot proposal may be created only when:

> The staging build is structurally valid, meaningfully different from current public, coherent enough to represent a single presentation state, and not in a rapid churn phase; and cadence allows a new proposal.

---

## Release Pipeline View

End-to-end flow:

```text
agent thinking
      ↓
staging evolution (direct writes)
      ↓
snapshot capture (immutable)
      ↓
publish readiness evaluation (this policy)
      ↓
publish-snapshot proposal (candidate vs current public + diff)
      ↓
human approval
      ↓
public release (apply snapshot)
```

This matches how software releases, art pipelines, and generative ecosystems operate: **release a build**, not approve every change.
