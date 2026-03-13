# Session Thought Trajectory — Runtime Capability Analysis

**Goal:** Determine whether the runtime can reconstruct a session's "thought trajectory" and build a **session thought map** that explains:
- what thread the agent was pursuing
- when it switched threads
- what type of generation mode it was in
- whether the trajectory was exploratory or consolidating
- whether ideas are clustering or diversifying

**Scope:** Inspection of existing runtime trajectory generation, session continuity timeline, thread transition detection, clustering summary, deliberation payloads, and proposal generation trace.

---

## Build decision (verdict)

**Yes, add a session thought map now.**

- Implement it as a **dedicated derivation module**, exposed through **runtime-state-api**.
- Persist the per-session trajectory snapshot into **`creative_session.trace`** at session end.
- **Do not create a new table** unless later analytics needs (indexing, analytics queries, or multiple trajectory snapshots per session) justify it. Extending the existing trace is the correct "close the loop fast" path.
- Treat **no-artifact deliberation** as a later enhancement (Phase 2), not a blocker for minimum closure.

**The most important thing:** Most of the thought map can be **derived** from existing data (timeline, thread transitions, clustering summary, trajectory_review). Only the **per-session trajectory snapshot** needs persistence. That is the hallmark of good system design: add the smallest missing fact instead of building a new subsystem.

---

## 1. What Parts of This System Already Exist

### 1.1 Runtime trajectory generation

| Aspect | Status | Location |
|--------|--------|----------|
| **Trajectory derivation** | Exists | `apps/studio/lib/runtime-trajectory.ts` — `deriveRuntimeTrajectory()` |
| **Output shape** | `RuntimeTrajectory`: `mode` (explore \| reinforce \| consolidate \| diversify \| reflect), `horizon_sessions`, `reason`, `focus_bias`, `style_direction`, `proposal_pressure` | Same file |
| **Inputs** | Seed, style profile, repeated titles, backlog counts, synthesis pressure, relationship summary, concept family summary | `getRuntimeStatePayload()` in runtime-state-api.ts |
| **Persistence** | **Not persisted per session.** Trajectory is computed **once** from current aggregate state and used only as prompt context in `buildContexts()`. | session-runner.ts (buildContexts), runtime-state-api.ts |

So: we have a **current** trajectory (what the system thinks the direction should be *now*), but no historical record of "what trajectory mode session N was given."

### 1.2 Session continuity timeline

| Aspect | Status | Location |
|--------|--------|----------|
| **Timeline API** | Exists | `getSessionContinuityTimeline(supabase, limit)` in runtime-state-api.ts |
| **Per-session fields** | `session_id`, `created_at`, `project_id/name`, `thread_id/name`, `mode`, `drive`, `confidence`, `outcome_kind`, `narrative_state`, `action_kind`, `proposal_created`, `has_artifact` | `SessionTimelineRow` |
| **Source tables** | `creative_session` (trace, decision_summary), `trajectory_review` (outcome_kind, narrative_state, action_kind) | Same |
| **Exposure** | Runtime debug page fetches timeline + clustering_summary and renders session table with thread transition badges | apps/studio/app/runtime/page.tsx |

So: we have a **session-by-session timeline** with thread, mode, drive, confidence, outcome, and narrative/action labels. No explicit "generation mode" or "thought posture" field.

### 1.3 Thread transition detection

| Aspect | Status | Location |
|--------|--------|----------|
| **Transition derivation** | Exists | `attachThreadTransitionAndStreak()` in runtime-state-api.ts |
| **Values** | `thread_transition`: `"same-thread"` \| `"thread-switch"` \| `"no-thread"`; `thread_streak_length`: consecutive same-thread count | Same |
| **Semantics** | For each row (newest-first), compare `thread_id` to the next (older) row; streak is length of run including current row in older direction | Same |

So: we **can** see when the agent switched threads (per row: same vs switch) and how long it stayed on a thread (streak). No separate "switch event" list, but derivable from the timeline.

### 1.4 Clustering summary

| Aspect | Status | Location |
|--------|--------|----------|
| **Summary derivation** | Exists | `computeSessionClusteringSummary(rows)` in runtime-state-api.ts |
| **Fields** | `thread_repeat_rate`, `unique_thread_count`, `longest_same_thread_streak`, `mode_mix`, `interpretation`, `comparable_pairs` | `SessionClusteringSummary` |
| **Interpretation** | Heuristic: `thread_repeat_rate` → "chaotic exploration" \| "light exploration" \| "healthy clustering" \| "possible stickiness" | Same |

So: we have an **aggregate** view over the timeline window (clustering vs diversifying at the window level). We do **not** have a per-session "this session was clustering" vs "this session was diversifying" label.

### 1.5 Deliberation payloads

| Aspect | Status | Location |
|--------|--------|----------|
| **Write path** | Exists | `writeTraceAndDeliberation()` → `writeDeliberationTrace()` in session-runner.ts, deliberation-trace.ts |
| **When written** | Only when **artifact + critique** exist. No-artifact sessions do **not** get a `deliberation_trace` row. | session-runner.ts guard: `if (!supabase \|\| !result \|\| !artifact \|\| !critique) return state` |
| **Stored shape** | `observations_json` (session_mode, selected_drive, selection_source, narrative_state), `state_summary`, `tensions_json`, `hypotheses_json` (action_kind, confidence_band), `evidence_checked_json`, `rejected_alternatives_json`, `chosen_action`, `confidence`, `execution_mode`, `outcome_summary` | deliberation-trace.ts, session-runner.ts |
| **Read path** | `getRuntimeDeliberationPayload()` returns **latest single** deliberation_trace row; `getRuntimeContinuityPayload()` joins sessions with deliberation for last 20 sessions | runtime-state-api.ts |

So: for **artifact sessions** we have rich per-session deliberation (narrative state, action kind, tensions, evidence, chosen action). For **no-artifact sessions** we have **no** deliberation row — thought trajectory for those sessions cannot be reconstructed from deliberation.

### 1.6 Proposal generation trace

| Aspect | Status | Location |
|--------|--------|----------|
| **Trace fields** | `creative_session.trace`: `proposal_id`, `proposal_type`, `proposal_outcome` | session-runner.ts (writeTraceAndDeliberation updates creative_session.trace) |
| **Semantics** | Whether a proposal was created this session, its type (e.g. surface/avatar/extension), and outcome label | Same |
| **Full "trace"** | No step-by-step "how we decided to create this proposal" — only the final outcome. | — |

So: we have **proposal outcome** per session (created or not, type, outcome), not a full proposal-generation **trace** (e.g. reasoning steps).

---

## 2. What Data Is Missing to Reconstruct a Thought Trajectory

To build a **session thought map** that explains the five goals, the following are missing or partial:

| Goal | Existing data | Missing or partial |
|------|----------------|---------------------|
| **What thread the agent was pursuing** | ✅ `SessionTimelineRow`: thread_id, thread_name, project_id/name | — |
| **When it switched threads** | ✅ `thread_transition` and `thread_streak_length` per row | Optional: explicit "switch events" list (derivable from timeline). |
| **What type of generation mode it was in** | ⚠️ Session **mode** (return/reflect/…) and **narrative_state** / **action_kind** in trajectory_review and deliberation | **Per-session trajectory mode** (explore / reinforce / consolidate / diversify / reflect) is **not** stored. It is computed only for the *current* moment in `getRuntimeStatePayload()` and injected into the prompt. So we cannot say "session 5 was in explore mode, session 6 in consolidate mode" from persisted data. |
| **Exploratory vs consolidating** | ⚠️ Can infer from `mode` + `narrative_state` + `action_kind` + clustering interpretation | No first-class per-session **thought posture** (exploratory vs consolidating). Clustering summary is window-level only. |
| **Ideas clustering vs diversifying** | ✅ Window-level: `SessionClusteringSummary.interpretation` and `thread_repeat_rate` | Per-session "this session was clustering" vs "diversifying" is not stored; could be derived from thread_transition + streak + outcome_kind. |

**Critical gaps:**

1. **Runtime trajectory mode is not persisted per session.** So we cannot reconstruct "what trajectory mode the agent was steered with" for past sessions — only what it would be *now* for the same aggregate state.
2. **Deliberation is absent for no-artifact sessions.** So for reflection-only or no-output sessions we have no structured "what the agent was thinking" beyond what’s in `creative_session.trace` and `trajectory_review`.
3. **No single "session thought map" structure.** Timeline, clustering, deliberation, and trace are exposed separately; no API or view that assembles them into one narrative (thread → transitions → mode/posture → clustering/diversifying).

---

## 3. Whether a "Session Thought Map" Layer Should Be Added

**Recommendation: Yes, as a thin **observability and interpretation** layer.**

Reasons:

- **Interpretability:** Operators and product need to answer "what was the agent doing over the last N sessions?" in one place (thread, switches, mode, posture, clustering/diversifying).
- **Intent health / drift:** The existing Intent Health design (INTENT_HEALTH_DRIFT_CONTROL.md) and trajectory feedback (SINGLE_SESSION_RUNTIME_BUILD_MAP.md) assume we can reason about trajectory over time; a thought map makes that explicit and queryable.
- **Minimal new persistence:** Most of the map can be **derived** from existing data (timeline + trajectory_review + optional per-session trajectory snapshot). The only net-new persistence that would fill the biggest gap is **per-session trajectory mode** (and optionally posture) at session end.

So: add a **session thought map** that:
- Consumes existing timeline, clustering, deliberation, and trace.
- Optionally adds a **per-session trajectory snapshot** (mode + optional posture) written at session end so we can reconstruct "what mode this session was in" later.

---

## 4. Where It Should Live (runtime-state-api vs trajectory vs deliberation)

| Option | Pros | Cons |
|--------|------|------|
| **runtime-state-api** | Already aggregates state, timeline, synthesis, trajectory; single place for "current + recent session view." | File is already large; thought map is a distinct *narrative* over sessions. |
| **New module (e.g. session-thought-map.ts)** | Clear responsibility: "build thought map from timeline + review + (optional) trajectory snapshot." Keeps runtime-state-api as data fetcher. | One more module and API surface. |
| **trajectory (runtime-trajectory.ts)** | Trajectory semantics (explore/consolidate/etc.) live here. | That module is about *deriving* current trajectory, not about *persisting* or *reconstructing* a multi-session map. |
| **deliberation** | Deliberation is "what the agent thought." | Deliberation is per-session and missing for no-artifact; thought map is cross-session and should use timeline + clustering as first-class. |

**Recommendation:**

- **Build the thought map in a dedicated module** (e.g. `session-thought-map.ts` or `runtime-thought-map.ts`) that:
  - **Reads** from: `getSessionContinuityTimeline()`, existing clustering summary, and (if added) per-session trajectory snapshot.
  - **Optionally reads** deliberation for artifact sessions to enrich "what the agent was thinking."
- **Expose it via runtime-state-api** (or a dedicated GET route) so the runtime debug page and future UIs can call one endpoint for "session thought map for last N sessions."
- **Persist only what’s missing:** per-session trajectory snapshot at session end **in `creative_session.trace`** (see §5.1 for exact fields). Do **not** add a new table for v1; a new table is only worth it later if you need indexing, analytics, or multiple trajectory snapshots per session.


---

## 5. Minimal Architecture Required to Implement It

### 5.1 Persist per-session trajectory in `creative_session.trace`

**Storage:** Extend **`creative_session.trace`** only. No new table for minimum closure. A new table becomes worth it only if you later need indexing, analytics, or multiple trajectory snapshots per session.

**Exact minimum persisted fields** (store just enough to reconstruct posture and explain steering; do not persist the full derived trajectory object unless there is a clear debug need):

| Field | Type | Purpose |
|-------|------|---------|
| `trajectory_mode` | string | explore \| reinforce \| consolidate \| diversify \| reflect |
| `trajectory_style_direction` | string \| null | reinforce_dominant \| explore_emerging \| reduce_repetition \| open |
| `trajectory_proposal_pressure` | string | low \| normal \| high |
| `trajectory_reason` | string \| null | Optional: only if kept short (e.g. truncate to ~200 chars). Omit if long; keeps trace stable and cheap. |

This keeps the persisted shape stable and cheap. The thought map derives **posture** from `trajectory_mode` alone (see §5.2).

**Semantic (prevents misuse):** The persisted trajectory snapshot represents the **steering mode used for the session**, not a recomputation from historical state. Do not recompute trajectory for past sessions — that would produce different answers.

**When to capture, where to write:** Persist the trajectory **used to steer the session**, not a new computation after the session. The system already computes trajectory during `buildContexts`; the ideal implementation is: during the session, trajectory is derived once (e.g. in `buildContexts` via `getRuntimeStatePayload().trajectory`); at session end, when updating `creative_session.trace` (e.g. in or alongside `writeTraceAndDeliberation` for the artifact path, and in the no-artifact branch before `persistTrajectoryReview`), write the four fields from **that same trajectory** (carry it in state from buildContexts), rather than calling `deriveRuntimeTrajectory(...)` again.

**No-artifact path:** Capture and persist the same four fields from the trajectory that was used when the session ran (e.g. from state), so the thought map is complete for every session.

### 5.2 Thought map derivation (read path)

- **Inputs:** Last N sessions from `getSessionContinuityTimeline()` (already includes thread_transition, thread_streak_length, mode, drive, outcome_kind, narrative_state, action_kind). Merge per-session trajectory fields from `creative_session.trace` (trajectory_mode, trajectory_style_direction, trajectory_proposal_pressure, trajectory_reason). Optionally join deliberation for artifact sessions (Phase 2).
- **Output:** A single structure, e.g. `SessionThoughtMap`:
  - `sessions: Array<{ session_id, created_at, thread, thread_transition, thread_streak_length, mode, drive, trajectory_mode?, narrative_state, action_kind, outcome_kind, posture?, proposal_created, has_artifact, confidence?, … }>`
  - `clustering_summary`: existing `SessionClusteringSummary` (thread_repeat_rate, interpretation, etc.)
  - Optional: `switch_events` derived from timeline.
- **Clustering vs diversifying:** Diversification vs clustering should remain a **window-level** interpretation (from clustering summary), not a per-session label. Do not add per-session "clustering" or "diversifying" fields.
- **Posture from trajectory_mode (explicit mapping):** Derive a simple **posture** field from `trajectory_mode` only — no second reasoning system. Use this mapping:
  - **explore** / **diversify** → **exploratory**
  - **reinforce** / **consolidate** → **consolidating**
  - **reflect** → **reflective**
  If `trajectory_mode` is missing (e.g. historical sessions before snapshot existed), leave posture null or infer from narrative_state + action_kind as fallback.

### 5.3 API and UI

- **API:** Add e.g. `getSessionThoughtMap(supabase, limit)` in the thought-map module; call it from runtime-state-api or from a GET route (e.g. `/api/runtime/thought-map`). Runtime debug page can then show a "Session thought map" section (timeline + clustering + optional trajectory mode and posture per row).
- **No change to mode/drive/selection:** Thought map is observability and future intent-health input only; it does not replace or bypass existing mode/drive/focus logic.

### 5.4 Implementation checklist

**Minimum closure (Phase 1):**

| Step | Action |
|------|--------|
| 1 | At session end (artifact and no-artifact), persist the trajectory **that was used to steer the session** (from state; do not recompute). Write **only** the four fields into `creative_session.trace`: `trajectory_mode`, `trajectory_style_direction`, `trajectory_proposal_pressure`, and optionally `trajectory_reason` (short). |
| 2 | Add `session-thought-map.ts` (or equivalent): function that takes timeline rows + clustering_summary + trajectory fields from trace, derives **posture** from trajectory_mode per the mapping above, and returns a `SessionThoughtMap`. |
| 3 | Expose `getSessionThoughtMap(supabase, limit)` via runtime-state-api (or dedicated route). Reuse `getSessionContinuityTimeline` and merge trajectory fields from each session's trace. |
| 4 | On the runtime debug page, add a "Session thought map" block (timeline + trajectory_mode + posture per session + clustering interpretation). |

That alone gets most of the value. No new table; no-artifact sessions still get a trajectory snapshot in trace.

**Phase 2 (later enhancement):** No-artifact deliberation — write a minimal deliberation row or extend trajectory_review for no-artifact sessions so "what the agent was thinking" can be enriched for those sessions. Not a blocker for closing the thought map loop.

---

## 6. Summary

| Question | Answer |
|----------|--------|
| **Can the runtime currently reconstruct a session's thought trajectory?** | **Partially.** Thread, thread switches, mode, narrative_state, action_kind, outcome_kind, and window-level clustering exist. Per-session **trajectory mode** is **not** stored; deliberation is **missing** for no-artifact sessions. |
| **What already exists?** | Runtime trajectory derivation (current only), session continuity timeline, thread transition and streak, clustering summary, deliberation payloads (artifact path only), proposal outcome in trace. |
| **What’s missing?** | Per-session trajectory snapshot in trace, and a single assembled "session thought map" view. No-artifact deliberation is a Phase 2 enhancement. |
| **Build decision** | **Yes**, add a session thought map. Dedicated derivation module, exposed via runtime-state-api. Persist **only** the four trajectory fields into **`creative_session.trace`** at session end; no new table unless analytics/indexing justify it later. Posture = derive from trajectory_mode (explore/diversify → exploratory; reinforce/consolidate → consolidating; reflect → reflective). No-artifact deliberation is Phase 2, not a blocker. |
