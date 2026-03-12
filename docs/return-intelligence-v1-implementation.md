# Return Intelligence V1 — Implementation Summary

## Overview

Return Intelligence V1 improves **archive candidate selection** when the session orchestrator is in **return mode** (`sessionMode === "return"`). It replaces the previous weighted (recurrence + pull + recency) selection with a canonical scoring model. **Mode selection, governance, and public mutation are unchanged.**

## Governance Semantics — Unchanged

- **Proposal creation, approval, publication:** No changes.
- **Identity mutation, habitat mutation:** No changes.
- **Runtime config behavior:** No changes.
- **Session mode selection:** Still determined by `computeSessionMode` / `selectModeAndDrive`. Return Intelligence runs only **after** mode is already `"return"`.
- This layer is **focus-selection only**: it chooses which archive entry (project/thread/idea) to resurface. It does not alter any proposal FSM, approval route, or public state.

---

## Insertion / Update Point (Focus Selection)

**File:** `apps/studio/lib/session-runner.ts`  
**Function:** `selectFocus`  
**Location:** The block `if (sessionMode === "return")` (lines ~328–430).

**Before:** Archive entries were loaded; weights were `(recurrence*0.6 + creative_pull*0.4) * recency`; a single random roulette-wheel selection chose the candidate.

**After:**

1. Load `archive_entry` rows including `artifact_id`.
2. For those `artifact_id`s: load `artifact.medium` (for tension alignment) and presence in `critique_record` (for critique weight).
3. Build current **tension kinds** via `deriveTensionKinds(ontologyStateForReturn)` (same ontology used elsewhere).
4. Call **Return Intelligence** `scoreReturnCandidates(candidates, context)` to get ranked list and `selectedIndex`.
5. Select the candidate at `selectedIndex`; set `returnSelectionDebug` and log a debug-friendly breakdown.

No other runtime stages (mode selection, buildContexts, runGeneration, manageProposals, trajectory review, etc.) are refactored or behavior-changed.

---

## Scoring Model

```
return_score =
  tension_alignment
  + recurrence_weight
  + critique_weight
  + age_weight
  + exploration_noise
```

- **tension_alignment:** Strongest signal. Candidate relevance to current tension kinds (e.g. `identity_pressure` → boost image/avatar artifacts; `backlog_pressure`/`surface_pressure` → boost writing/surface). Uses `artifact.medium` and `deriveTensionKinds(state)`.
- **recurrence_weight:** Reuses existing recurrence and creative_pull (same 0.6/0.4 blend), scaled to a max.
- **critique_weight:** Bonus when the candidate’s artifact has a row in `critique_record` (unresolved/improvement signal).
- **age_weight:** Small bonus for older candidates (days since creation, capped) so recent-only resurfacing doesn’t dominate.
- **exploration_noise:** Bounded random `[0, explorationNoiseMax]` (default 0.05) for variation.

The candidate with the **highest** `return_score` is selected (argmax).

---

## Files Changed / Added

| Path | Description |
|------|-------------|
| `apps/studio/lib/return-intelligence.ts` | **New.** `scoreReturnCandidates`, `buildReturnSelectionDebug`, types and constants. |
| `apps/studio/lib/session-runner.ts` | Return-mode branch in `selectFocus` updated to use Return Intelligence; added `returnSelectionDebug` on state; `artifact_id` and artifact/critique lookups added. |
| `apps/studio/lib/__tests__/return-intelligence.test.ts` | **New.** Tests for tension-aligned win, recurrence vs tension, critique boost, age tiebreaker, exploration noise bounded. |
| `docs/return-intelligence-v1-implementation.md` | This summary. |

---

## Debug-Friendly Score Breakdown

The selected candidate and top candidates are exposed in:

- **State:** `state.returnSelectionDebug` (optional), with `selected`, `topCandidates`, and `tensionKinds`.
- **Log:** `console.log("[session] selection: return_from_archive", { ..., return_intelligence: { ... } })` with selected score, full breakdown, and top-score summaries.

**Example debug payload (candidate ranking):**

```json
{
  "archive_project": "uuid-project",
  "archive_thread": "uuid-thread",
  "archive_idea": "uuid-idea",
  "return_intelligence": {
    "tensionKinds": ["identity_pressure", "recurrence_pull"],
    "selected_score": 0.52,
    "selected_breakdown": {
      "tension_alignment": 0.18,
      "recurrence_weight": 0.21,
      "critique_weight": 0.15,
      "age_weight": 0.04,
      "exploration_noise": 0.02,
      "return_score": 0.52
    },
    "top_scores": [
      {
        "index": 2,
        "return_score": 0.52,
        "tension_alignment": 0.18,
        "recurrence_weight": 0.21,
        "critique_weight": 0.15,
        "age_weight": 0.04,
        "exploration_noise": 0.02
      },
      {
        "index": 0,
        "return_score": 0.48,
        "tension_alignment": 0.0675,
        "recurrence_weight": 0.28,
        "critique_weight": 0,
        "age_weight": 0.03,
        "exploration_noise": 0.01
      }
    ]
  }
}
```

---

## Tests

- **Tension-aligned candidate wins** when tensions (e.g. `identity_pressure`) and artifact medium (e.g. `image`) align.
- **Recurrence alone does not always dominate:** with moderate recurrence, the tension-aligned candidate can win.
- **Critique boosts selection:** candidate with a critique_record gets a bonus and is selected when otherwise similar.
- **Age acts as small tiebreaker:** older candidate gets higher `age_weight` and can win when other components are equal.
- **Exploration noise is bounded:** `exploration_noise` in each breakdown is in `[0, explorationNoiseMax]` (default 0.05).

Run: `pnpm test` from `apps/studio` (includes return-intelligence tests). Full build: `pnpm build` from repo root.

---

## Behavior Summary

- **Interpretable:** Each candidate has a numeric breakdown; selection is argmax of a sum of five terms.
- **Lightweight:** One extra query for artifact mediums and one for critique presence; scoring is in-memory.
- **Focus-selection only:** No new subsystems; only the existing return-mode branch in `selectFocus` was upgraded.
