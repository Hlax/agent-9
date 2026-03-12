# Trajectory Taste Bias V1 — Implementation Summary

## Overview

**Trajectory Taste Bias V1** is a soft action-scoring preference layer that slightly biases candidate action selection toward action kinds that have recently produced stronger trajectory_review outcomes. It does **not** introduce new candidate actions, alter governance, proposal/publication/identity/habitat mutation, runtime config, mode selection, or return focus selection. The effect is bounded and interpretable.

## Governance / Runtime Boundaries — Unchanged

- **Governance:** Unchanged. Taste does not modify proposal state, trigger proposal creation, publish artifacts, or alter avatar/habitat identity.
- **Mode selection:** Unchanged. Taste does not override explore vs return.
- **Return focus selection:** Unchanged. Return Intelligence still drives archive candidate scoring; taste adds a bounded adjustment to the same candidates (all with action_kind `resurface_archive`).
- **Execution mode / human gates:** Unchanged.
- Taste only **adjusts scores** of existing candidates; it never adds or removes candidates.

---

## Formula and Guardrails

**Per action_kind (from recent trajectory_review rows):**

```
taste_score[action_kind] =
  average(trajectory_quality) for that action_kind
  + 0.05 per strength kind (from strengths_json.items)
  - 0.07 per issue kind (from issues_json.items)
```

- **Cap:** taste_score is clamped to **[-0.5, 0.5]** so the additive term `0.15 * taste_score` never dominates (≤ 20% influence).
- **Sparse fallback:** When an action_kind has fewer than **3** reviews in the window, its taste is **0** (neutral).
- **Apply:** `candidate_score = base_runtime_score + 0.15 * taste_score[action_kind]`.

**Window:** Last **15** trajectory_review rows (by `created_at` desc).

---

## Insertion Point

**File:** `apps/studio/lib/session-runner.ts`  
**Function:** `selectFocus`  
**Location:** Inside the `if (sessionMode === "return")` block, **after** `scoreReturnCandidates` and **before** choosing the selected archive entry.

1. Call `getTasteBiasMap(supabase)` to get `tasteByActionKind` and debug payload.
2. For each ranked candidate (all `resurface_archive`), compute `adjustedScore = return_score + 0.15 * taste_score["resurface_archive"]`.
3. Re-sort by `adjustedScore` descending and take the top candidate as selected.
4. Fill payload with `selected_action_kind: "resurface_archive"` and `applied_bias_for_selected`; attach to `state.tasteBiasDebug` and log.

---

## Files Changed / Added

| Path | Description |
|------|-------------|
| `apps/studio/lib/trajectory-taste-bias.ts` | **New.** `computeTasteByActionKind`, `getTasteBiasMap`, `getTasteForAction`, `applyTasteBias`, `fillTastePayloadSelected`, types. |
| `apps/studio/lib/session-runner.ts` | Return-mode path: fetch taste map, apply taste to return scores, re-rank, set `tasteBiasDebug`, log taste_bias. |
| `apps/studio/lib/__tests__/trajectory-taste-bias.test.ts` | **New.** Tests: positive bias (strong outcomes), negative bias (weak + issues), sparse neutral, bounded effect, apply/fill. |
| `docs/trajectory-taste-bias-v1-implementation.md` | This summary. |

---

## Debug Payload

**State:** `state.tasteBiasDebug` (optional) after return-mode focus selection.

**Example:**

```json
{
  "recent_window_size": 15,
  "taste_by_action_kind": {
    "resurface_archive": 0.18,
    "continue_thread": -0.05,
    "generate_habitat_candidate": 0.08,
    "generate_avatar_candidate": 0.12
  },
  "applied_bias_for_selected": 0.027,
  "selected_action_kind": "resurface_archive",
  "sparse_fallback_used": false
}
```

- **recent_window_size:** Number of trajectory_review rows used.
- **taste_by_action_kind:** Taste score per action_kind (bounded).
- **applied_bias_for_selected:** `0.15 * taste_score[selected_action_kind]`.
- **sparse_fallback_used:** true when window had &lt; 3 reviews (neutral taste used).

---

## Tests

- **Positive bias:** Action kind with high trajectory_quality and strength items gets taste &gt; 0.
- **Negative bias:** Action kind with low quality and issue items gets taste &lt; 0.
- **Sparse-history neutral:** When fewer than minReviewsForTaste for an action_kind, taste = 0.
- **Bounded effect:** Taste score magnitude ≤ 0.5 (no runaway dominance).
- **Apply / fill:** `applyTasteBias` and `fillTastePayloadSelected` behave as specified.

Run: `pnpm test` from `apps/studio`. Full build: `pnpm build` from repo root.
