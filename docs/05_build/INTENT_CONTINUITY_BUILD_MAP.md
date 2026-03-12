# Session Intent / Continuity Layer — Build Map

**Goal:** A thin layer above the closed runtime loop that answers: *“Given what just happened across recent sessions, what is this system trying to do next?”*

**Principle:** The runtime can complete a thought. This layer makes multiple thoughts feel like they belong to the same mind — pressure plus continuity of purpose.

---

## 1. What It Is

A small **persistent structure** between:

- trajectory / state history  
- and the next session’s mode, drive, and focus selection  

It holds:

- **current active intention** (explore, refine, consolidate, reflect, return)
- **why** that intention exists
- **evidence** supporting continuing it
- **exit conditions** (when to end, shift, or escalate)
- **what kind of session** should happen next  

So instead of every session only inheriting pressure, it also inherits a **working agenda**.

---

## 2. Flow Change

**Before:**  
`previous state + pressures → choose next session behavior`

**After:**  
`previous state + pressures + active intention → choose next session behavior`

Intent acts as a **soft bias** only — never a hard lock. The runtime can continue, downgrade, fulfill, abandon, or replace intent each session.

---

## 3. Implementation Summary

| Phase | Description | Location |
|-------|-------------|----------|
| **1 — Read path** | Load latest active intent in session-runner; expose to mode/drive/focus | `loadCreativeStateAndBacklog` → `state.activeIntent`; `getActiveIntent` in `session-intent.ts` |
| **2 — Soft influence** | Small bias on mode/drive/focus; never hard override | `selectModeAndDrive` (reflection_need / recent_exploration_rate); `selectProjectAndThread(supabase, intentBias)` |
| **3 — Write path** | After trajectory review, update intent: continue / fulfill / abandon / supersede / create | `updateSessionIntent` after `persistTrajectoryReview` (artifact and no-artifact paths) |
| **4 — Observability** | Show active intent on runtime page; show why it was kept or changed | `getRuntimeStatePayload` → `active_intent`; Runtime page “Active session intent” section |

---

## 4. Data Model: `runtime_intent`

**Migration:** `supabase/migrations/20260318000001_runtime_intent.sql`

| Field | Type | Notes |
|-------|------|--------|
| intent_id | UUID | PK |
| created_at, updated_at | TIMESTAMPTZ | |
| status | active \| fulfilled \| abandoned \| superseded | |
| intent_kind | explore \| refine \| consolidate \| reflect \| return | |
| target_project_id | UUID (nullable, FK project) | |
| target_thread_id | UUID (nullable, FK idea_thread) | |
| target_artifact_family | TEXT (nullable) | |
| reason_summary | TEXT | |
| evidence_json | JSONB | |
| confidence | REAL | |
| exit_conditions_json | JSONB | |
| source_session_id | UUID (nullable, FK creative_session) | |
| last_reinforced_session_id | UUID (nullable, FK creative_session) | |

At most **one** row with `status = 'active'` is used; the latest by `created_at` is loaded.

---

## 5. Session Runner Integration

**Load (Phase 1):**  
In `loadCreativeStateAndBacklog`, call `getActiveIntent(state.supabase)` and set `state.activeIntent`.

**Mode / drive bias (Phase 2):**  
In `selectModeAndDrive`:

- If `activeIntent.intent_kind === 'reflect'`: nudge `reflection_need` up slightly (+0.06).
- If `activeIntent.intent_kind === 'refine' | 'consolidate'`: nudge `recent_exploration_rate` down slightly (−0.05).

**Focus bias (Phase 2):**  
When calling `selectProjectAndThread`, pass `intentBias: { projectId, threadId }` from `activeIntent` when present; `selectProjectAndThread` applies a 1.4× weight boost to the matching project and thread.

**Write (Phase 3):**  
After `persistTrajectoryReview` (both artifact and no-artifact paths), call `updateSessionIntent(supabase, buildIntentUpdateInput(state), state.activeIntent)`.  
This:

- Derives outcome: **continue** | **fulfill** | **abandon** | **supersede** | **create**
- Updates existing intent (status, `last_reinforced_session_id`) or closes it and inserts a new active intent

---

## 6. Intent Outcome Rules (v1)

| Outcome | When |
|---------|------|
| **Continue** | Same thread reinforced (session project/thread match intent target), confidence ≥ 0.5, no repetition |
| **Fulfill** | Proposal created or recurrence updated, confidence ≥ 0.6, return_success_trend ≥ 0.5 |
| **Abandon** | Confidence &lt; 0.4 or (repetition detected and repetition_penalty &gt; 0.5) |
| **Supersede** | Session selected a different project/thread and confidence ≥ 0.5 |
| **Create** | No current active intent |

After **fulfill**, **abandon**, or **supersede**, a **new** active intent is created from the current session’s mode and focus so the next session always has an intent to read (unless the DB insert fails).

---

## 7. Key Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260318000001_runtime_intent.sql` | Table and indexes for `runtime_intent` |
| `apps/studio/lib/session-intent.ts` | `getActiveIntent`, `updateSessionIntent`, `deriveIntentOutcome`, `intentKindFromSessionMode`, types |
| `apps/studio/lib/session-runner.ts` | Load intent in `loadCreativeStateAndBacklog`; bias in `selectModeAndDrive`; intent bias in `selectFocus`; `buildIntentUpdateInput`; call `updateSessionIntent` after `persistTrajectoryReview` |
| `apps/studio/lib/project-thread-selection.ts` | `selectProjectAndThread(supabase, intentBias?)` with optional weight boost for intent target project/thread |
| `apps/studio/lib/runtime-state-api.ts` | `getActiveIntent(supabase)` in payload; `getRuntimeStatePayload` returns `active_intent` |
| `apps/studio/app/runtime/page.tsx` | “Active session intent” section (kind, reason, confidence, target, last reinforced) |

---

## 8. What This Layer Is Not

- Long-horizon strategic planning  
- Task decomposition  
- Multi-agent coordinator  
- Full goal engine  
- A giant memory graph  

It is a **short-lived operating intention**: “What are we in the middle of?”

---

## 9. Resulting Session Lifecycle (with Intent)

1. Load state — creative state + backlog + **synthesis pressure** + **active intent**
2. Evaluate pressures — merge trajectory + **intent** bias into state for mode/drive
3. Choose mode — `computeSessionMode(sessionState)` (state includes intent-driven nudge)
4. Choose drive — `computeDriveWeights(sessionState)`, `selectDrive(weights)`
5. Select focus — return path (archive + taste) or project/thread/idea with **intent bias** (boost for target project/thread)
6. Generate or reflect — unchanged
7. Evaluate artifact — unchanged
8. Handle proposal — unchanged
9. Persist snapshot — unchanged
10. Record trajectory review — unchanged
11. **Update intent** — `updateSessionIntent` (continue / fulfill / abandon / supersede / create)
12. End session — `finalizeResult`

---

## 10. Verification

| Check | How |
|------|-----|
| Active intent loads | Run a session; before first intent exists, `getActiveIntent` returns null; after at least one session with persistence, an active intent row exists and next session has `state.activeIntent` set. |
| Mode/drive bias | With active intent `intent_kind = 'reflect'`, state passed to `computeSessionMode` has higher `reflection_need`; with `refine`/`consolidate`, lower `recent_exploration_rate`. |
| Focus bias | With active intent targeting a project/thread, `selectProjectAndThread(supabase, intentBias)` gives higher weight to that project/thread (stochastic; can assert in tests with fixed RNG or many samples). |
| Intent update | After session, `runtime_intent` has either updated `last_reinforced_session_id` (continue) or status fulfilled/abandoned/superseded and a new active row (create). |
| Observability | Runtime debug page shows “Active session intent” with kind, reason, confidence, target, last reinforced. |

---

## 11. Risks and Live Behavior Checks

This is the first layer that can make the runtime feel *committed*. Behavioral tuning matters here. Watch for these failure modes:

| Risk | What to watch |
|------|----------------|
| **Intent stickiness** | Intent keeps reinforcing itself after the underlying thread has cooled. |
| **Focus boost over-commitment** | Focus boost causes the runtime to keep returning to a thread that should have been abandoned. |
| **Artificial certainty** | “New active intent always created” makes the system feel artificially certain every session. |
| **Reflect self-sustaining** | Reflect intents become too self-sustaining after weak periods and don’t release. |

None of that means the architecture is wrong — it means this is the first place where **behavioral tuning** really matters.

### Four live behavior checks

1. **Persistence of a good thread**  
   A thread performs well across 2–4 sessions.  
   - *Want:* intent remains active; focus slightly prefers the same thread/project; no hard lock; eventual fulfill or supersede when appropriate.

2. **Dead-end abandonment**  
   A thread gets repeated weak outcomes.  
   - *Want:* intent confidence degrades; abandon or supersede in a reasonable number of sessions; no stale thread clinging.

3. **Reflect recovery**  
   A weak run causes a reflect intent.  
   - *Want:* reflection bias increases a bit; reflect doesn’t dominate forever; next stronger session moves the runtime back out cleanly.

4. **Competing strong thread**  
   A new thread becomes clearly stronger than the current one.  
   - *Want:* supersede triggers correctly; new intent created cleanly; focus shifts without feeling erratic.

If those four work, the layer is not just implemented — it’s **alive**.

---

## 12. Where This Puts the Build

You are no longer at “basic agent runtime.” You are at:

- **closed single-session cognition**  
- **plus**  
- **cross-session continuity**

That is the point where the runtime starts to resemble an actual operating mind.

---

## 13. Natural Next Layer

The next thing to build is not another big intelligence system. It’s a smaller **control** layer:

**Intent Health / Drift Control**

Now that intent exists, you need a way to measure whether it is:

- still productive  
- stale  
- over-reinforced  
- misaligned with current evidence  

That layer answers: *“Is the current intent still healthy, or is continuity becoming drag?”*

See **Intent Health / Drift Control** build map: [INTENT_HEALTH_DRIFT_CONTROL.md](./INTENT_HEALTH_DRIFT_CONTROL.md). After Intent Health, the next observability layer is **Boundary Pressure** (repeated pressure for new mediums/surfaces/capabilities): [BOUNDARY_PRESSURE_BUILD_MAP.md](./BOUNDARY_PRESSURE_BUILD_MAP.md).

---

**Scope:** Session Intent / Continuity only. No change to proposal governance, artifact lifecycle, or multi-session swarm behavior.
