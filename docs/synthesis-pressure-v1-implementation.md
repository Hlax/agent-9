# Synthesis Pressure V1 — Implementation Summary

## Overview

**synthesis_pressure** is a computed, operator-facing runtime observability metric that estimates whether the Twin is in the sweet spot for synthesis: not too empty, not too overwhelmed, not too random, not too stalled. **V1 is diagnostic only:** it does not change runtime behavior, mode selection, focus selection, proposal behavior, governance, or public mutation.

## Runtime / Governance Behavior — Unchanged

- **Runtime behavior:** Unchanged. No code paths branch on synthesis_pressure.
- **Mode selection:** Unchanged. Session mode is still determined by existing logic (e.g. `computeSessionMode`).
- **Focus selection:** Unchanged. Return Intelligence and project/thread selection are unaffected.
- **Proposal creation / approval / publication:** Unchanged.
- **Governance and public mutation:** Unchanged.
- The metric is **read-only observability**: it is computed from existing tables and exposed in the runtime state API for operator dashboards and debugging.

---

## Formula

```
synthesis_pressure =
  0.25 * recurrence_pull_signal
+ 0.25 * unfinished_pull_signal
+ 0.20 * archive_candidate_pressure
+ 0.20 * return_success_trend
- 0.20 * repetition_without_movement_penalty
```

**Momentum gate:** If `momentum < 0.35`, then `synthesis_pressure = synthesis_pressure * 0.6`.

**Bands:**

| Band         | Range        |
|-------------|--------------|
| low         | &lt; 0.30     |
| rising      | 0.30 – 0.54  |
| high        | 0.55 – 0.74  |
| convert_now | ≥ 0.75       |

---

## Component Sources (Exact Fields / Signals)

| Component | Source | Notes |
|-----------|--------|--------|
| **recurrence_pull_signal** | `creative_state_snapshot.idea_recurrence` | Latest snapshot by `created_at`; normalized 0–1; default 0.5 if null. |
| **unfinished_pull_signal** | `archive_entry` count + `creative_state_snapshot.unfinished_projects` | Heuristic: `archNorm = min(1, count/25)`, `unf = unfinished_projects`; combined `archNorm*0.7 + unf*0.3`, clamped 0–1. |
| **archive_candidate_pressure** | `archive_entry` count | 0 when count 0; 1 when count ≥ 25; linear in between (`count/25`). |
| **return_success_trend** | `trajectory_review` (last 10 rows by `created_at`) | Rows where `narrative_state = 'return'` OR `action_kind = 'resurface_archive'` OR `outcome_kind = 'productive_return'`. Proxy: average of `(movement_score + trajectory_quality) / 2` for those rows; 0.5 when none. |
| **repetition_without_movement_penalty** | `trajectory_review` (same last 10 rows) | Rate of rows with `outcome_kind` in `('repetition_without_movement', 'low_signal_continuation')` OR `issues_json.items` containing `'repetition_risk'`. Rate = count / window size, 0–1. |
| **momentum** | `creative_state_snapshot.recent_exploration_rate` | Latest snapshot; 0–1; default 0.5 if null. Used for momentum gate only. |

---

## Files Changed / Added

| Path | Description |
|------|-------------|
| `apps/studio/lib/synthesis-pressure.ts` | **New.** `computeSynthesisPressure`, `getSynthesisPressure`, derive helpers, types. |
| `apps/studio/lib/__tests__/synthesis-pressure.test.ts` | **New.** Unit tests: low/rising/high/convert_now bands, momentum gate, debug payload, derive helpers. |
| `apps/studio/app/api/runtime/state/route.ts` | Calls `getSynthesisPressure(supabase)` and includes `synthesis_pressure` in JSON response. |
| `docs/synthesis-pressure-v1-implementation.md` | This summary. |

---

## Debug-Friendly Payload

The API and helper return a payload with:

- **raw_score:** Weighted sum before momentum gate.
- **synthesis_pressure:** Final score (after gate and clamp to 0–1).
- **band:** `"low"` | `"rising"` | `"high"` | `"convert_now"`.
- **components:** Each of the five inputs (recurrence_pull_signal, unfinished_pull_signal, archive_candidate_pressure, return_success_trend, repetition_without_movement_penalty).
- **momentum_gate_applied:** `true` if `momentum < 0.35`.
- **momentum:** Value used for the gate.

**Example debug payload:**

```json
{
  "raw_score": 0.62,
  "synthesis_pressure": 0.372,
  "band": "rising",
  "components": {
    "recurrence_pull_signal": 0.5,
    "unfinished_pull_signal": 0.45,
    "archive_candidate_pressure": 0.4,
    "return_success_trend": 0.55,
    "repetition_without_movement_penalty": 0.2
  },
  "momentum_gate_applied": true,
  "momentum": 0.32
}
```

---

## Exposure

- **GET /api/runtime/state** includes `synthesis_pressure` with the full payload above.
- The helper `getSynthesisPressure(supabase)` can be used by other observability or dashboard code.

---

## Tests

- **Band low:** Score &lt; 0.30 → band `"low"`.
- **Band rising:** Score in [0.30, 0.54] → band `"rising"`.
- **Band high:** Score in [0.55, 0.74] → band `"high"`.
- **Band convert_now:** Score ≥ 0.75 → band `"convert_now"`.
- **Momentum gate:** When `momentum < 0.35`, `momentum_gate_applied` is true and final score is reduced (raw_score * 0.6).
- **Debug payload:** Contains components, gate, score, band.
- **Derive helpers:** Recurrence, unfinished, archive pressure, return trend, repetition penalty, momentum.

Run: `pnpm test` from `apps/studio` (includes synthesis-pressure tests). Full build: `pnpm build` from repo root.
