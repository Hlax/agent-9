# Trajectory Feedback V1 — Closure Audit

**Date:** 2026-03-13  
**Context:** Post–Governance V1 and Evidence Ledger V1 sealed. Audit of the trajectory-feedback layer for closure.  
**Goal:** Determine whether trajectory/review influences control in a safe, explicit, inspectable way and identify minimum work to seal Trajectory Feedback V1.

---

## 1. What trajectory data is currently computed

| Data | Source / computation | Persisted? | Exposed on read path? | Consumed by control? |
|------|----------------------|------------|------------------------|----------------------|
| **Mode (runtime trajectory)** | `deriveRuntimeTrajectory()` in runtime-state-api.ts; inputs: seed, style profile, repeated titles, backlog, synthesis pressure, relationship summary, concept family | No | Yes (getRuntimeStatePayload.trajectory; buildContexts injects into prompt) | **Indirect:** trajectory is prompt text only; synthesis pressure (which feeds trajectory) is used in selectModeAndDrive |
| **Reinforcement / consolidation / diversification** | Same: RuntimeTrajectory.mode (explore/reinforce/consolidate/diversify/reflect), style_direction, focus_bias | No | Same | Prompt only; no direct branch in mode/focus |
| **Reflection signals** | (1) trajectory_feedback_adapter: `gently_reduce_repetition` → reflection_need nudge. (2) synthesis pressure: return_success_trend, repetition_without_movement_penalty → reflection_need bias. (3) activeIntent (reflect) → +0.06 reflection_need | (1) Recorded in deliberation (trajectory_advisory_applied). (2) synthesis inputs from trajectory_review, not stored at selection time in trace | (1) hypotheses_json. (2) synthesis_pressure in payload | **Yes:** both (1) and (2) feed selectModeAndDrive → reflection_need → computeSessionMode |
| **Thread continuity / streak / transition** | getSessionContinuityTimeline → attachThreadTransitionAndStreak; computeSessionClusteringSummary (thread_repeat_rate, longest_same_thread_streak, interpretation) | No (derived from trace) | Timeline rows, clustering_summary, thought map on runtime page | **Yes:** thought map → trajectory feedback adapter → gently_reduce_repetition when sticky/long streak |
| **Proposal repetition / relationship** | runtime-trajectory: relationshipSummary (duplicates, refinements, etc.), conceptFamilySummary; style repeated titles | No | In getRuntimeStatePayload; trajectory.reason in prompt | Prompt only; no direct proposal-pressure or lane control |
| **Trajectory review (per-session)** | trajectory-review.ts: narrative_state, action_kind, outcome_kind, scores (trajectory_quality, alignment, movement, novelty, governance, confidence_calibration), issues_json, strengths_json, recommended_next_action_kind | **Yes** (trajectory_review table) | Timeline (outcome_kind, narrative_state, action_kind); full row in DB | **Yes:** getSynthesisPressure reads trajectory_review → return_success_trend, repetition_without_movement_penalty → selectModeAndDrive. getTasteBiasMap reads trajectory_review → return candidate scoring (focus) |
| **Thought map** | runtime-thought-map: deriveThoughtMapSummary(timeline rows, clustering_summary) → session_posture, thread_repeat_rate, trajectory_shape, exploration_vs_consolidation, etc. | No | Runtime page (from timeline); deriveTrajectoryAdvisoryDryRun | **Yes:** only via trajectory feedback adapter → gently_reduce_repetition |
| **Trajectory feedback adapter output** | getTrajectoryFeedback(context) → gently_reduce_repetition, favor_consolidation, proposal_pressure_adjustment, reason | Only “applied” flag/reason in deliberation (hypotheses_json) | Dry-run log on debug panel; trajectory_advisory_applied/reason in latest deliberation | **Only gently_reduce_repetition** is control-active; others are observability-only |

---

## 2. Which trajectory outputs are persisted vs transient vs exposed vs control-consumed

| Output | Persisted | Transient only | Read-path exposed | Control-consumed |
|--------|-----------|----------------|-------------------|------------------|
| **trajectory_review** (per-session row) | ✅ Table | — | ✅ Timeline + DB | ✅ Synthesis pressure, taste bias |
| **Runtime trajectory** (mode, style_direction, proposal_pressure, focus_bias, reason) | ❌ | ✅ | ✅ In payload + prompt | ❌ Prompt only |
| **Thought map summary** | ❌ | ✅ | ✅ Runtime page | ✅ Only via adapter → one signal |
| **Trajectory advisory** (gently_reduce_repetition etc.) | Partial (applied/reason in deliberation) | State during run | ✅ Deliberation; dry-run on panel | ✅ gently_reduce_repetition → reflection_need |
| **Synthesis pressure** (band, components) | ❌ | ✅ | ✅ In getRuntimeStatePayload | ✅ Components → reflection_need in selectModeAndDrive |
| **recommended_next_action_kind** | ✅ In trajectory_review | — | In DB / could be on timeline | ❌ **Not consumed** by any selector |

---

## 3. Does trajectory influence control? Where exactly?

| Influence | Yes/No | Exact location | Type (hard / soft / advisory / accidental) |
|----------|--------|----------------|-------------------------------------------|
| **Session mode** | Yes | session-runner.ts: selectModeAndDrive. (1) synthesisPressure.components → reflection_need bias (formula). (2) state.trajectoryAdvisory?.feedback.gently_reduce_repetition (and confidence !== "low") → reflection_need +0.06. Then computeSessionMode(sessionState) uses reflection_need. | **Soft:** bounded nudge on reflection_need; no branch replacement. Explicit and logged. |
| **Focus selection** | Yes | session-runner.ts: selectFocus (return path). getTasteBiasMap(supabase) reads trajectory_review; taste by action_kind biases return candidate scoring. | **Soft:** scoring weight; no hard override. |
| **Proposal pressure** | No (direct) | deriveRuntimeTrajectory.proposal_pressure and adapter proposal_pressure_adjustment are **not** read by manageProposals or any proposal logic. | Advisory (prompt only for trajectory); adapter signal is dry-run. |
| **Next action recommendation** | No | decision_summary.next_action is set from eligibility/governance/narrative, not from trajectory_review.recommended_next_action_kind. | recommended_next_action_kind is persisted but **not consumed**. |
| **Lane selection** | No | Lane comes from classifyProposalLane / governance; no trajectory input. | — |
| **Reflection pressure** | Yes | Same as session mode: reflection_need is nudged by synthesis pressure and by trajectory advisory (gently_reduce_repetition). | Soft, bounded, explicit. |

**Exact files/functions:**

- **session-runner.ts**
  - `loadCreativeStateAndBacklog`: fetches timeline, derives thought map, calls getTrajectoryFeedback, sets state.trajectoryAdvisory.
  - `selectModeAndDrive`: applies synthesis pressure bias to reflection_need; reads state.trajectoryAdvisory and applies TRAJECTORY_REFLECTION_NUDGE (0.06) when gently_reduce_repetition && interpretation_confidence !== "low"; logs application/skip.
  - `buildContexts`: gets getRuntimeStatePayload, injects trajectory (mode, style_direction, proposal_pressure, focus_bias) into workingContext as **text only**.
  - `selectFocus` (return path): getTasteBiasMap(supabase), scoreReturnCandidates with taste bias.
  - `writeTraceAndDeliberation`: writes hypotheses_json.trajectory_advisory_applied, trajectory_advisory_reason from state.trajectoryAdvisory.
- **synthesis-pressure.ts**: getSynthesisPressure reads trajectory_review; deriveReturnSuccessTrend, deriveRepetitionPenalty. Used by runtime-state-api and session-runner (loadCreativeStateAndBacklog → state.synthesisPressure; selectModeAndDrive uses state.synthesisPressure.components).
- **trajectory-feedback-adapter.ts**: getTrajectoryFeedback(context) → gently_reduce_repetition, favor_consolidation, proposal_pressure_adjustment. Only gently_reduce_repetition is wired; others are dry-run.
- **runtime-state-api.ts**: getRuntimeStatePayload calls getSynthesisPressure and deriveRuntimeTrajectory; returns trajectory (and synthesis_pressure) for API and buildContexts.
- **trajectory-taste-bias.ts**: getTasteBiasMap reads trajectory_review; used in selectFocus return scoring.

---

## 4. Stage 1 contract compatibility

| Contract requirement | Status |
|---------------------|--------|
| **Thought map must not directly determine mode/drive/focus/proposal eligibility** | **Met.** Thought map is not the direct decider. It feeds the trajectory feedback adapter; the only control output wired is gently_reduce_repetition → +0.06 reflection_need. Mode is determined by computeSessionMode(reflection_need, …). So thought map has a **bounded soft bias** on an input, not direct determination. |
| **Soft bias only, no branch replacement** | **Met.** Reflection nudge is additive and capped; no “if thought map says X then set mode = Y”. Taste bias is a scoring weight. |
| **Source-of-truth hierarchy intact** | **Met.** Raw facts (trace, proposal outcomes, governance_evidence) and trajectory_review sit above thought-map interpretation. The adapter’s influence is explicitly documented and recorded (hypotheses_json). |

**Conclusion:** Current trajectory influence is compatible with the Stage 1 contract: one bounded, explicit, logged control signal (gently_reduce_repetition → reflection_need); synthesis pressure (from trajectory_review) and taste bias are soft and from persisted review data, not from thought map as policy engine.

---

## 5. Pass/fail by sub-area

| Sub-area | Pass/Fail | Notes |
|----------|-----------|--------|
| **Trajectory data computed** | Pass | Mode, reinforcement/consolidation/diversification, reflection signals, thread continuity/streak, proposal relationship, trajectory review — all present and documented. |
| **Persistence** | Pass | trajectory_review persisted and read by synthesis + taste. Runtime trajectory and thought map correctly transient. Advisory “applied” recorded in deliberation. |
| **Read-path exposure** | Pass | Timeline has outcome/narrative/action; synthesis_pressure in payload; thought map and dry-run on runtime page; trajectory_advisory in deliberation. |
| **Control consumption** | Pass | Exactly one trajectory-advisory signal is control-active (gently_reduce_repetition); synthesis and taste paths are explicit and soft. No accidental or unbounded control. |
| **Boundary enforcement** | Pass | Docstrings and single wiring point; favor_consolidation and proposal_pressure_adjustment not wired. |
| **Inspectability** | Pass | trajectory_advisory_applied and reason in deliberation; console logs on apply/skip. Optional gap: synthesis_pressure at selection time not in trace (see closure gaps). |
| **recommended_next_action_kind** | Pass | Persisted but **reserved / not yet consumed**; documented in this audit and in code (trajectory-review.ts) so it is not assumed control-active. Not blocking seal. |

---

## 6. Current trajectory schema inventory

**Runtime trajectory (RuntimeTrajectory):**  
mode, horizon_sessions, reason, focus_bias?, style_direction?, proposal_pressure?. Computed in runtime-state-api via deriveRuntimeTrajectory. Not persisted. Exposed in getRuntimeStatePayload.trajectory and in buildContexts as prompt text.

**Thought map (ThoughtMapSummary):**  
session_posture, thread_repeat_rate, longest_thread_streak, trajectory_shape, exploration_vs_consolidation, interpretation_confidence, window_sessions, proposal_activity_summary. Derived in runtime-thought-map from timeline + clustering. Not persisted. Exposed on runtime page and as input to trajectory feedback adapter and deriveTrajectoryAdvisoryDryRun.

**Trajectory feedback (TrajectoryFeedbackResult):**  
gently_reduce_repetition, favor_consolidation, proposal_pressure_adjustment, reason. From getTrajectoryFeedback(TrajectoryFeedbackContext). Only “applied” state and reason persisted in deliberation (hypotheses_json). Dry-run full result on panel.

**Trajectory review (trajectory_review table):**  
session_id, deliberation_trace_id, review_version, narrative_state, action_kind, outcome_kind, trajectory_quality, alignment_score, movement_score, novelty_score, governance_score, confidence_calibration_score, issues_json, strengths_json, learning_signal, recommended_next_action_kind, created_at. Persisted. Read by getSynthesisPressure (return_success_trend, repetition_without_movement_penalty) and getTasteBiasMap (taste by action_kind).

**Synthesis pressure (SynthesisPressurePayload):**  
raw_score, synthesis_pressure, band, components (return_success_trend, repetition_without_movement_penalty, …), momentum. Computed from snapshot + archive count + trajectory_review. Not persisted. Exposed in getRuntimeStatePayload; consumed in selectModeAndDrive.

---

## 7. Advisory only vs control-active

| Item | Advisory only | Control-active |
|------|----------------|----------------|
| **Runtime trajectory** (mode, style_direction, proposal_pressure, focus_bias) | ✅ Prompt text in buildContexts | ❌ |
| **Thought map** (posture, shape, streak, etc.) | ✅ Display + adapter input | Only via adapter → gently_reduce_repetition |
| **getTrajectoryFeedback**: favor_consolidation | ✅ | ❌ |
| **getTrajectoryFeedback**: proposal_pressure_adjustment | ✅ | ❌ |
| **getTrajectoryFeedback**: gently_reduce_repetition | — | ✅ → reflection_need +0.06 (when confidence !== "low") |
| **Synthesis pressure** (return_success_trend, repetition penalty) | — | ✅ → reflection_need bias in selectModeAndDrive |
| **Trajectory review** (outcome, scores) | Read path / diagnostic | ✅ Via synthesis pressure + taste bias |
| **recommended_next_action_kind** | — | ❌ Not consumed |

---

## 8. Closure gaps (priority order)

1. **recommended_next_action_kind (resolved)**  
   Persisted in trajectory_review but not read by any selector. Now explicitly marked as **reserved / not yet consumed** in trajectory-review.ts (interface and insert) and in this audit. Not required to seal V1.

2. **Synthesis pressure at selection time not in trace (low)**  
   We can reconstruct “why mode became reflect” from deliberation (observations, hypotheses) and from trajectory_advisory_applied. Recording synthesis_pressure (or the two components used for reflection bias) in trace/deliberation would make the “reflection_need” story fully reproducible from stored data. Evidence Ledger already exposes selection_evidence and governance; this would complete the reflection-pressure story. Optional for Trajectory Feedback V1.

3. **Per-session trajectory snapshot still not in trace (optional)**  
   Evidence Ledger audit already noted: trajectory_mode (and related fields) could be stored in creative_session.trace at session end for thought-map reconstruction. Out of scope for trajectory-feedback closure; aligns with SESSION_THOUGHT_TRAJECTORY_ANALYSIS.

4. **Tests**  
   trajectory-feedback-adapter: getTrajectoryFeedback is testable (pure). trajectory_review and synthesis-pressure have tests. No dedicated test that “trajectory advisory nudge is applied when conditions hold and not when confidence is low” in session-runner; could add a small integration test. Not blocking seal if behavior is documented and deliberation record is present.

---

## 9. Minimal implementation plan to seal Trajectory Feedback V1

1. **Document and optionally wire recommended_next_action_kind**  
   In trajectory-review.ts or a short doc: state that recommended_next_action_kind is for future use (e.g. next-action hint or analytics). Optionally: expose it on timeline or in a single “recommended next” read path without changing mode/focus logic. **Minimal:** doc only.

2. **Optional: persist synthesis-pressure components in deliberation**  
   In writeTraceAndDeliberation, add to observations_json or a small evidence blob: return_success_trend and repetition_without_movement_penalty (or band) at selection time, so “why reflection_need was biased” is fully reconstructable. **Minimal:** skip for V1 if deliberation + trajectory_advisory_applied is deemed sufficient.

3. **No change to control logic**  
   Keep single trajectory-advisory binding; no new wires for favor_consolidation or proposal_pressure_adjustment until explicitly staged.

4. **Optional test**  
   Add a test that, for a state with trajectoryAdvisory.gently_reduce_repetition true and interpretation_confidence !== "low", selectModeAndDrive increases reflection_need by the nudge amount (or that deliberation contains trajectory_advisory_applied). **Minimal:** doc + existing deliberation record is enough to seal.

**Reserved field (not control-active):** `trajectory_review.recommended_next_action_kind` is persisted and computed but **not consumed** by any selector. It is explicitly reserved for future use (e.g. next-action hint or analytics). Marked in code in `trajectory-review.ts` (interface and insert) so future readers do not assume it is control-active.

**Conclusion:** Trajectory Feedback V1 can be sealed with **documentation only** (recommended_next_action_kind reserved; synthesis-pressure optional in trace). No mandatory code changes if the above contract and evidence are accepted.

---

## 10. Final verdict

**Trajectory Feedback V1: sealed.**

**Rationale:**

- Trajectory/review influence on control is **explicit**: one bounded signal (gently_reduce_repetition → reflection_need nudge), synthesis pressure (from trajectory_review) and taste bias (from trajectory_review) for mode and return focus. No hidden or accidental control.
- Influence is **safe**: soft bias only, no branch replacement; Stage 1 contract and source-of-truth hierarchy are respected.
- Influence is **inspectable**: trajectory_advisory_applied and reason in deliberation; selection_evidence and timeline; dry-run on debug panel; console logs on apply/skip.
- **Closure:** trajectory_review is persisted and read by synthesis + taste; trajectory advisory is recorded in deliberation; read paths expose timeline, thought map, and synthesis pressure. Remaining gaps (recommended_next_action_kind unused, synthesis pressure not in trace) are minor and can be closed with documentation and optional small additions without redesigning the runtime.

**To formally seal:** Add a short note in docs (or in trajectory-review.ts) that recommended_next_action_kind is reserved for future use. Optionally add synthesis_pressure (or components) to deliberation/trace and/or one test for the advisory nudge. No architectural change required.
