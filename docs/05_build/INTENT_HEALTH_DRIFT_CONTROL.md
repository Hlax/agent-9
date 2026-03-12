# Intent Health / Drift Control — Build Map (Next Layer)

**Goal:** Answer *“Is the current intent still healthy, or is continuity becoming drag?”*

**Principle:** Now that intent exists, the runtime needs a way to know when continuity has become inertia. This is a small **evaluative** layer, not a new intelligence system.

---

## 1. Why This Next

Intent Continuity gives the runtime:

- a working agenda across sessions  
- soft bias toward a thread/project  
- continue / fulfill / abandon / supersede  

The biggest risk is **intent stickiness**: the same intent reinforcing itself after the underlying thread has cooled, or focus boost keeping the runtime on a thread that should have been abandoned.

So the next step is not more “intent logic” but **intent health**: a tiny layer that scores whether the current intent is still productive or has become drag. That lets the runtime not just have continuity, but **know when continuity has become inertia**.

---

## 2. What This Layer Would Do

It would **score** the current active intent on signals such as:

| Signal | Meaning |
|--------|--------|
| **Sessions since reinforcement** | How many sessions since `last_reinforced_session_id`? High count → intent may be stale. |
| **Repetition without movement** | From trajectory/synthesis: repetition_without_movement_penalty, low_signal_continuation. High → intent may be stuck. |
| **Confidence decay** | Trend of session confidence on the intent’s target thread. Declining → consider abandon/supersede. |
| **Competing thread strength** | Another project/thread with clearly higher recurrence + pull (or return success). Strong competitor → supersede candidate. |
| **Fulfillment rate by intent kind** | Historical: how often did “refine” or “return” intents actually fulfill vs drag? Calibrate thresholds. |

Output: a small **health payload** (e.g. `healthy` | `stale` | `over_reinforced` | `misaligned`) and optional scalar scores, **without** changing intent by itself. The existing intent outcome logic (continue / fulfill / abandon / supersede) would **consume** this payload to:

- make abandon/supersede more likely when health is stale or misaligned  
- avoid over-reinforcing when health is over_reinforced  
- leave “continue” as default when health is healthy  

So Intent Health is **input** to the same decision point that already exists.

---

## 3. Where It Would Sit

- **Read:** After loading active intent and synthesis pressure (and optionally a small window of trajectory_review / creative_session for “sessions since reinforcement” and “confidence on this thread”).  
- **Compute:** Pure function or small module: `computeIntentHealth(activeIntent, context) → IntentHealthPayload`. Context = session count since last reinforcement, repetition penalty, confidence trend, competing thread metrics.  
- **Feed into:** `deriveIntentOutcome(currentIntent, input)` in `session-intent.ts`. Today `input` is session-only; it could accept an optional `intentHealth` and the outcome rules could use it to nudge toward abandon/supersede when health is bad, or soften “continue” when over_reinforced.

No new persistence is strictly required for v1: health can be computed on the fly from existing data (runtime_intent, trajectory_review, creative_state_snapshot, idea/idea_thread recurrence). Optionally, a single **intent_health_snapshot** row per session (or per active intent update) could store the computed health for observability and tuning.

---

## 4. Minimal v1 Scope

- **Signals to implement first:**  
  - Sessions since reinforcement (from `last_reinforced_session_id` vs current session list).  
  - Repetition without movement (already in synthesis pressure).  
  - Optional: simple “confidence on this thread” from recent trajectory_review rows that match intent target.  
- **Output:**  
  - `health: 'healthy' | 'stale' | 'over_reinforced' | 'misaligned'` (or similar).  
  - Optional: numeric scores for observability.  
- **Integration:**  
  - Pass health into `deriveIntentOutcome`; in outcome rules, e.g. if `health === 'stale'` and same-thread reinforcement didn’t happen this session → prefer abandon or supersede over continue.  
  - Keep changes small so the current intent flow remains the single source of truth; health only **influences** the outcome.

---

## 5. Observability

- Runtime page (or API): show **intent health** next to active intent (e.g. “Intent health: healthy | stale | …”).  
- If storing health snapshots: show trend over last N sessions so operators can tune thresholds.

---

## 6. What This Is Not

- Not a new “intent engine” or strategic planner.  
- Not a replacement for continue/fulfill/abandon/supersede — it informs them.  
- Not a large new table or ETL; prefer compute-from-existing-data first.

---

## 7. Resulting Behavior

With Intent Health in place:

- A thread that has **cooled** (no reinforcement for several sessions, repetition without movement) gets a **stale** health; outcome logic can abandon or supersede more readily.  
- An intent that has been **reinforced many times** without fulfillment can be tagged **over_reinforced** and outcome logic can avoid “continue” by default and favor fulfill/supersede when evidence allows.  
- A **stronger competing thread** can be reflected in **misaligned** health and make supersede more likely.  
- **Reflect** intents can be given a health check so they don’t self-sustain forever (e.g. after N reflect sessions without improvement, health → stale and next session can move on).

That way the runtime doesn’t just have continuity — it can **let go** when continuity is no longer serving it.

---

**Status:** Design only. Implement when live behavior checks on Intent Continuity (persistence of good thread, dead-end abandonment, reflect recovery, competing strong thread) are in place and tuning is needed.

---

## 8. After Intent Health: Boundary Pressure

Once intent health is live, the next **observability** layer is **Boundary Pressure** — detecting repeated conceptual pressure that current mediums or runtime lanes do not adequately satisfy. See [BOUNDARY_PRESSURE_BUILD_MAP.md](./BOUNDARY_PRESSURE_BUILD_MAP.md). Boundary-pressure detection should consume intent health so it does not conflate “stale intent” with “wrong medium.”
