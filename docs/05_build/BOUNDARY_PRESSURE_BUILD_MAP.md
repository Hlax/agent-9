# Boundary Pressure Detection — Build Map (After Intent Health)

**Goal:** Detect *repeated conceptual pressure that current mediums, surfaces, artifact types, or runtime lanes do not adequately satisfy* — without building a proposal engine, planner, or new runtime loop.

**Principle:** Read/score/observe first. No hard automation that creates new mediums or systems. Advisory only until governance and intent health are aligned.

---

## 1. What “Boundary Pressure” Means

A **repeated pattern across sessions** where the runtime appears to be pushing against the limits of its current:

- mediums (writing, concept, image, …)  
- surfaces (static vs interactive, stateful)  
- artifact types  
- runtime lanes (proposal flow, return path, refinement)  

**Examples:**

- Recurring concepts that do not fit existing artifact outputs well  
- Repeated proposal-worthy sessions pointing at the same missing capability  
- Repeated refine/return cycles on the same thread with weak resolution **inside** existing mediums  
- Critiques or trajectory patterns suggesting the **thread is healthy** but the **current expression path** is inadequate  

This is **not** the same as:

- A **bad or stale thread** (weak outcomes because the thread should be abandoned)  
- **Over-reinforced intent** (continuity clinging to a thread that has cooled)  
- **Misaligned intent** (a stronger competing thread should supersede)  

Intent Health / Drift Control is what distinguishes those. Boundary pressure is about **medium/capability inadequacy** given a thread or concept that is still worth pursuing.

---

## 2. Evidence Readiness (Current State)

Existing signals that can support boundary-pressure detection **without** major new infrastructure:

| Source | Signal | Use for boundary pressure |
|--------|--------|----------------------------|
| **Session trace** (creative_session.trace) | medium_fit (supported \| partial \| unsupported), missing_capability (interactive_ui, stateful_surface, image_generation, …) | Per-session: “this artifact didn’t fit the medium.” |
| **Trajectory review** | outcome_kind (low_signal_continuation, repetition_without_movement), issues_json (repetition_risk, reflection_without_resolution) | Per-session: weak resolution, repetition without movement. |
| **Proposal record** | proposal_role (e.g. system_capability_extension), target_type, lane_type | Sessions that produced extension/capability proposals. |
| **Recurrence / evaluation** | idea.recurrence_score, idea_thread.recurrence_score, creative_pull; evaluation on artifact | Thread/idea strength vs outcome. |
| **Intent continuity** | active intent target_project_id, target_thread_id, intent_kind (refine, return, …) | Whether pressure is on the intent’s target thread. |

**Gap:** All of the above are **per-session**. “Repeated” pressure requires **aggregation** over a window of sessions (e.g. last N). That aggregation does **not** require new tables — it can be a **derived score** computed from:

- creative_session (trace: medium_fit, missing_capability, project_id, thread_id)  
- trajectory_review (outcome_kind, issues_json, session_id)  
- proposal_record (proposal_role, created_at) joined by session  
- runtime_intent (target_thread_id, target_project_id) for “on intent thread” filter  

So **evidence readiness: yes**, provided we define the aggregation (window size, thresholds, and how to combine signals).

---

## 3. Control Readiness: Why Intent Health First

Boundary-pressure detection **should wait** until Intent Health / Drift Control is implemented and live-tuned, so the system can first distinguish:

- **Stale intent** → abandon/supersede; don’t treat as “need new medium.”  
- **Over-reinforced intent** → reduce continue; don’t treat as “capability gap.”  
- **Misaligned continuity** → supersede to stronger thread; don’t treat as “wrong medium.”  

from

- **True unmet medium/capability demand** → repeated partial/unsupported + same missing_capability or repeated weak resolution on a thread that intent health says is still healthy.  

If we add boundary-pressure scoring **before** intent health:

- “Repeated weak outcomes on same thread” could be either (1) stale intent or (2) wrong medium.  
- We risk false escalation (e.g. “high boundary pressure” when the correct response is abandon intent).  
- We also lack a clear rule for when to treat boundary pressure as **advisory** (observability, operator awareness) vs **input** to proposal or escalation (which the build map constrains: no hard automation at first).  

So the **correct order** is: Intent Health live and tuned → then add boundary-pressure read/score/observe.

---

## 4. Minimal Implementation Shape (When Ready)

When moving from documentation to implementation, keep it to **read / score / observability** first:

| Element | Description |
|---------|-------------|
| **Read** | Last N sessions: creative_session (trace), trajectory_review (outcome_kind, issues_json), optionally proposal_record and runtime_intent. No new persistence. |
| **Derive** | A single **boundary pressure** score or classification (e.g. `low` \| `rising` \| `high`) and optional breakdown (e.g. count of sessions with medium_fit in (partial, unsupported); count with same missing_capability; count of “intent-thread sessions with weak outcome”). Pure function or small module: `computeBoundaryPressure(context) → BoundaryPressurePayload`. |
| **Display** | Expose in runtime state API and runtime debug page (e.g. “Boundary pressure: rising” and a short reason). Advisory only. |
| **Optional later** | Pass payload into proposal handling as **advisory** (e.g. in trace or as a flag for operator UI); **no** hard behavior change that creates new mediums or systems automatically. |

**Likely files:**

- **New:** `apps/studio/lib/boundary-pressure.ts` — input type, `computeBoundaryPressure(supabase, windowSize?)`, payload type.  
- **Change:** `apps/studio/lib/runtime-state-api.ts` — call `computeBoundaryPressure`, add `boundary_pressure` to payload.  
- **Change:** `apps/studio/app/runtime/page.tsx` — show boundary pressure section (score + brief explanation).  

**Data flow (minimal):**

1. **Read:** Query creative_session (trace with medium_fit, missing_capability) + trajectory_review (outcome_kind, issues) for last N sessions; optionally active intent and proposal_record.  
2. **Derive:** Count/combine into scalar or band (e.g. “sessions with medium_fit partial/unsupported in window,” “sessions with same missing_capability,” “sessions on intent thread with outcome_kind in (low_signal_continuation, repetition_without_movement)”). Optionally gate or weight by intent health when that exists (e.g. only count boundary pressure when intent health ≠ stale).  
3. **Display:** Return in getRuntimeStatePayload and render on runtime page.  
4. **Remain advisory:** No change to session-runner mode/drive/focus, no change to proposal creation logic, no new lanes or automation.

---

## 5. Concepts to Clarify Before Code

Before implementation, these should be explicit in docs or build maps:

| Concept | Clarification needed |
|---------|----------------------|
| **Boundary-pressure signals** | Exact list: e.g. (1) count of sessions with medium_fit in (partial, unsupported), (2) count of sessions with same missing_capability in window, (3) count of intent-thread sessions with outcome_kind in (low_signal_continuation, repetition_without_movement) or issues containing reflection_without_resolution. |
| **Bad-thread vs wrong-medium** | Rule: boundary pressure is only asserted when we have evidence the **thread or concept** is still worth pursuing (e.g. recurrence/pull acceptable, or intent health not stale). Otherwise treat as intent-health / abandon. |
| **Interaction with proposal governance** | Extension proposals already exist (system_capability_extension). Boundary pressure does not create them; it can be “evidence for prioritizing or surfacing” in UI or for operator decisions. No automatic escalation. |
| **Thresholds** | How many sessions in window (e.g. 10)? How many “partial/unsupported” or “same missing_capability” to move from low → rising → high? Define as tunable constants; no magic numbers in narrative. |

---

## 6. Decision Rule: When to Implement

Move from **documentation** to **implementation** when **all** of the following hold:

1. **Intent Health / Drift Control** is implemented and live (computeIntentHealth, fed into deriveIntentOutcome, visible on runtime page).  
2. **Intent Continuity** live behavior checks are satisfactory (persistence of good thread, dead-end abandonment, reflect recovery, competing strong thread).  
3. **Boundary-pressure signals and thresholds** are defined in this build map (or a companion) so the minimal scorer has a clear spec.  
4. **Product/operator** need is clear: e.g. “we need to see when the runtime is repeatedly hitting medium limits” before any use of the score in proposal or escalation logic.

Until then: **documentation only** — this build map and the clarifications in §5 are the next boundary-pressure layer definition.

---

## 7. What This Is Not

- Not a proposal engine, planner, or new runtime loop.  
- Not automatic creation of new mediums or system capabilities.  
- Not a replacement for intent health (stale/over-reinforced/misaligned).  
- Not a large new schema or ETL; prefer compute-from-existing-data.

---

**Status:** Design and documentation. Implement after Intent Health is live and decision rule (§6) is satisfied.
