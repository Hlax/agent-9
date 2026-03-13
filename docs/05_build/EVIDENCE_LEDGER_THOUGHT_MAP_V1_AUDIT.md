# Evidence Ledger / Thought Map V1 — Closure Audit

**Date:** 2026-03-13  
**Context:** Post–Governance V1 sealed. Audit of the Evidence Ledger / Thought Map layer for closure.  
**Scope:** What structured evidence exists, what is persisted vs computed vs free text, reconstructability from stored trace data, blind spots, minimum fields for Evidence Ledger V1, and whether the Thought Map leaks into control. No redesign; focus on making evidence inspectable and usable for later control-loop work.

---

## 1. Structured evidence inventory by subsystem

### 1.1 Selection (mode, drive, focus, thread/idea)

| Evidence | Location | Persisted? | Exposed on read path? |
|----------|----------|------------|------------------------|
| **Selection source** | `creative_session.trace.selection_evidence.selection_source` | Yes | Yes (SessionTimelineRow.selection_evidence) |
| **Signals present/used** | `trace.selection_evidence.signals` (v2: backlog_pressure, recurrence_signal, archive_return, reflection_need, governance_flags, etc.) | Yes | Yes (signals_present, signals_used on timeline) |
| **Selected thread/mode/drive** | `trace.selection_evidence.selected_thread_id`, `selected_mode`, `selected_drive` | Yes | Yes |
| **Decision summary** | `trace.selection_evidence.decision_summary`; `creative_session.decision_summary` (next_action, rejected_alternatives, confidence) | Yes | Yes (decision_summary / next_action) |
| **Selection reason** | `deliberation_trace.hypotheses_json.selection_reason` (e.g. archive_return_due_to_mode, project_thread_default) | Yes (artifact sessions only) | Via getRuntimeDeliberationPayload (latest only) |

**Verdict (selection):** Pass. Structured selection evidence is persisted and exposed on the continuity timeline. Reconstructing “why the selector chose this lane/thread” is possible from `selection_evidence` + `decision_summary` + deliberation (when present).

---

### 1.2 Proposal creation

| Evidence | Location | Persisted? | Exposed on read path? |
|----------|----------|------------|------------------------|
| **Proposal outcome** | `creative_session.trace.proposal_outcome` (created \| updated \| skipped_cap \| skipped_ineligible \| skipped_rejected_archived \| skipped_governance) | Yes | **No** — not in mapSessionTraceRow or SessionTimelineRow |
| **Proposal id/type** | `trace.proposal_id`, `trace.proposal_type` | Yes | Yes (timeline has proposal_created boolean from proposal_id; trace payload has proposal_id/type) |
| **Governance evidence** | `trace.governance_evidence`: lane_type, classification_reason, actor_authority, reason_codes | Yes | **No** — not in mapSessionTraceRow or SessionTimelineRow |
| **Eligibility / cap / rejected** | Encoded in proposal_outcome + decision_summary.next_action (free text) | Partially (outcome enum + narrative) | decision_summary visible; proposal_outcome/governance_evidence not on API |

**Verdict (proposal creation):** Fail for observability. Data exists in `creative_session.trace` but is not exposed on the timeline or trace payload APIs. Operators cannot see “why was this proposal created/blocked” without reading raw trace JSON.

---

### 1.3 Governance decisions

| Evidence | Location | Persisted? | Exposed on read path? |
|----------|----------|------------|------------------------|
| **Lane classification** | `trace.governance_evidence.lane_type`, `classification_reason` | Yes | No (same read-path gap as above) |
| **Block reason codes** | `trace.governance_evidence.reason_codes` | Yes | No |
| **Actor authority** | `trace.governance_evidence.actor_authority` | Yes | No |

**Verdict (governance decisions):** Fail. Persisted in trace only; not on any operator-facing API (timeline or trace payload).

---

### 1.4 Trajectory review (narrative, action kind, outcome)

| Evidence | Location | Persisted? | Exposed on read path? |
|----------|----------|------------|------------------------|
| **Narrative state / action kind / outcome** | `trajectory_review.narrative_state`, `action_kind`, `outcome_kind` | Yes | Yes (getSessionContinuityTimeline merges into SessionTimelineRow) |
| **Scores (quality, alignment, movement, etc.)** | `trajectory_review` (trajectory_quality, alignment_score, movement_score, novelty_score, governance_score, confidence_calibration_score, issues_json, strengths_json) | Yes | Not on timeline (timeline only narrative_state, action_kind, outcome_kind); available from DB |

**Verdict (trajectory review):** Pass. Core narrative/action/outcome is persisted and on timeline. Full scores are persisted for audit/debug but not required for minimal “why did the session do this” reconstruction.

---

### 1.5 Mode / focus / drive decisions

| Evidence | Location | Persisted? | Exposed on read path? |
|----------|----------|------------|------------------------|
| **Session mode / drive** | `trace.session_mode`, `trace.drive`; `deliberation_trace.observations_json` | Yes | Yes (timeline mode, drive; selection_evidence.selected_mode, selected_drive) |
| **Observations** | `deliberation_trace.observations_json` (session_mode, selected_drive, selection_source, metabolism_mode, narrative_state) | Yes (artifact sessions) | Via getRuntimeDeliberationPayload (latest only) |
| **Tensions / hypotheses** | `deliberation_trace.tensions_json`, `hypotheses_json` (selection_reason, action_kind, confidence_band, trajectory_advisory_applied) | Yes (artifact sessions) | Deliberation payload (latest) |
| **Evidence checked** | `deliberation_trace.evidence_checked_json` | Yes (artifact sessions) | Deliberation payload |

**Verdict (mode/focus/drive):** Pass. Mode/drive and selection evidence are persisted and exposed. Deliberation is artifact-only; no-artifact sessions have minimal trace only (no deliberation_trace row).

---

## 2. Persisted vs computed vs free text

| Category | Examples |
|----------|----------|
| **Persisted** | `creative_session.trace` (selection_evidence, proposal_outcome, governance_evidence, session_mode, drive, project/thread/idea, artifact_id, proposal_id, proposal_type, tokens_used, medium/resolution/capability fields, trace_kind). `creative_session.decision_summary`. `deliberation_trace` (all JSON + chosen_action, confidence, outcome_summary). `trajectory_review` (narrative_state, action_kind, outcome_kind, scores, issues/strengths). |
| **Computed transiently** | **Per-session trajectory mode** (explore / reinforce / consolidate / diversify / reflect) — computed in `getRuntimeStatePayload()` / `deriveRuntimeTrajectory()` for the current moment only; **not** stored in trace. Thought map summary (session_posture, trajectory_shape, exploration_vs_consolidation, etc.) — derived from timeline + clustering on each request. Clustering summary (thread_repeat_rate, interpretation) — derived from timeline. |
| **Free text only** | `decision_summary.next_action`, `outcome_summary`, `state_summary`, `chosen_action`, `human_gate_reason` — narrative only; not structured for programmatic “why” answers. |

---

## 3. Reconstructability from stored trace data alone

| Question | From DB (trace + deliberation + trajectory_review)? | From current API (timeline + trace payload + deliberation)? |
|----------|---------------------------------------------------|-------------------------------------------------------------|
| **Why was a proposal created?** | Yes: `trace.proposal_outcome` (created/updated) + `trace.governance_evidence` (lane, reason) + decision_summary.next_action. | Partially: next_action and proposal_created; **not** proposal_outcome or governance_evidence. |
| **Why was a proposal blocked?** | Yes: `trace.proposal_outcome` (skipped_*) + `trace.governance_evidence.reason_codes` + next_action. | **No**: proposal_outcome and governance_evidence are not returned on timeline or trace payload. |
| **Why did the selector choose one lane over another?** | Yes: `trace.selection_evidence` (selection_source, signals_used, decision_summary) + deliberation hypotheses_json.selection_reason. | Yes: selection_evidence and narrative are on the timeline. |
| **Why did the session take its next action?** | Yes: decision_summary (next_action, rejected_alternatives), deliberation (chosen_action, hypotheses_json), selection_evidence. | Yes: timeline has selection_evidence and narrative; latest deliberation available. |

**Gap:** Reconstructability for **proposal creation/blocking** is possible from stored data but **not** from the current operator-facing APIs, because `proposal_outcome` and `governance_evidence` are never mapped into the timeline or trace payload responses.

---

## 4. Blind spots in observability

1. **Proposal outcome and governance evidence not on read path**  
   Written in `writeTraceAndDeliberation` to `creative_session.trace` but not included in `mapSessionTraceRow` (getRuntimeTracePayload) or in `getSessionContinuityTimeline` (SessionTimelineRow). So “why was this proposal created/blocked” is not visible in the runtime UI or timeline API.

2. **Per-session trajectory mode not persisted**  
   SESSION_THOUGHT_TRAJECTORY_ANALYSIS §5.1 recommended storing `trajectory_mode`, `trajectory_style_direction`, `trajectory_proposal_pressure`, `trajectory_reason` in trace. These are **not** implemented. So we cannot reconstruct “session N was in explore mode” from stored data; only the current trajectory can be computed.

3. **No-artifact sessions: no deliberation row**  
   `writeTraceAndDeliberation` only runs when artifact + critique exist. No-artifact sessions get `persistMinimalSessionTrace` (selection_evidence, trace_kind: minimal) but no `deliberation_trace` row. So “what the agent was thinking” for reflection-only or no-output sessions is only in trace (mode, drive, selection_evidence), not in structured deliberation.

4. **getRuntimeTracePayload**  
   Returns last 10 sessions via `mapSessionTraceRow`, which omits `proposal_outcome`, `governance_evidence`, and `selection_evidence` (and any future trajectory_* fields). So the “trace” API is incomplete for evidence-ledger use.

---

## 5. Minimum fields for Evidence Ledger V1

**Sufficient for:** debugging, governance audit, later trajectory feedback, medium/surface proposal tuning.

**Already stored (and sufficient if exposed):**

- **Selection:** `trace.selection_evidence` (v2: signals, selection_source, selected_*, decision_summary) — already exposed on timeline.
- **Proposal:** `trace.proposal_outcome`, `trace.governance_evidence` — **must be added to read path** (timeline and/or trace payload).
- **Session identity:** session_mode, drive, project/thread/idea, artifact_id, proposal_id, proposal_type, trace_kind — already on timeline/trace.
- **Deliberation (artifact sessions):** observations, tensions, hypotheses, evidence_checked, chosen_action, confidence, outcome_summary — available via getRuntimeDeliberationPayload (latest); continuity joins by session_id for last N.
- **Trajectory review:** narrative_state, action_kind, outcome_kind — on timeline.

**Missing structured fields for full closure:**

- **On read path:** `proposal_outcome`, `governance_evidence` in the timeline and in the trace payload mapping.
- **Optional but recommended (SESSION_THOUGHT_TRAJECTORY_ANALYSIS):** Per-session trajectory snapshot in trace: `trajectory_mode` (explore | reinforce | consolidate | diversify | reflect); optionally `trajectory_style_direction`, `trajectory_proposal_pressure`, `trajectory_reason` (short). Without these, “what trajectory mode steered this session” is not reconstructable.

**Conclusion:** Minimum for Evidence Ledger V1 closure is to **expose existing** `proposal_outcome` and `governance_evidence` on the timeline and trace payload. Per-session trajectory fields in trace are the next step for trajectory/thought-map reconstruction but are not strictly required to “seal” the evidence ledger for proposal governance and selection debugging.

---

## 6. Thought Map: advisory only or leaking into control?

- **Thought map module (`runtime-thought-map.ts`):**  
  Explicitly **does not** feed any selector (mode, drive, focus, proposal eligibility, selection source). Used only to build `ThoughtMapSummary` for the runtime debug page and as input to the trajectory feedback adapter. **Advisory/interpretive only.**

- **Trajectory feedback adapter (`trajectory-feedback-adapter.ts`):**  
  One **sanctioned** control binding (Stage-2): `gently_reduce_repetition` → stored in `state.trajectoryAdvisory` → read in `selectModeAndDrive` as a bounded +0.06 nudge to `reflection_need`. This is documented and recorded in deliberation (`hypotheses_json.trajectory_advisory_applied`, `trajectory_advisory_reason`). All other adapter outputs (e.g. favor_consolidation, proposal_pressure_adjustment) are dry-run / observability only and must not reach selectors.

**Verdict:** The Thought Map itself is advisory only. One bounded trajectory-derived signal is intentionally wired into mode selection and is recorded in evidence. So the Thought Map is **not** “leaking into control where it should not yet” — the single binding is by design and auditable.

---

## 7. Pass/fail by subsystem

| Subsystem | Pass/Fail | Notes |
|-----------|-----------|--------|
| **Selection evidence** | Pass | Persisted and exposed on timeline (selection_evidence v2, decision_summary). |
| **Proposal creation evidence** | Fail | proposal_outcome and governance_evidence persisted but not on timeline or trace payload API. |
| **Governance decisions evidence** | Fail | Same read-path gap. |
| **Trajectory review** | Pass | narrative_state, action_kind, outcome_kind persisted and on timeline. |
| **Mode/focus/drive evidence** | Pass | Trace + deliberation (artifact path) + selection_evidence; no-artifact has minimal trace only. |
| **Thought Map / control** | Pass | Thought map is advisory; one documented trajectory nudge; no inappropriate leakage. |

---

## 8. Exact files involved

| Concern | Files |
|---------|--------|
| **Trace write (evidence)** | `apps/studio/lib/session-runner.ts`: buildSelectionEvidence, buildMinimalTrace, writeTraceAndDeliberation (trace object with selection_evidence, proposal_outcome, governance_evidence), persistSessionTrace, persistMinimalSessionTrace. |
| **Deliberation write** | `apps/studio/lib/deliberation-trace.ts`: writeDeliberationTrace. Called from session-runner writeTraceAndDeliberation. |
| **Trajectory review write** | `apps/studio/lib/session-runner.ts`: persistTrajectoryReview. `apps/studio/lib/trajectory-review.ts`: compute scores and insert. |
| **Trace/timeline read** | `apps/studio/lib/runtime-state-api.ts`: mapSessionTraceRow (no proposal_outcome, governance_evidence), getRuntimeTracePayload, getSessionContinuityTimeline (builds SessionTimelineRow from trace; includes selection_evidence, not proposal_outcome/governance_evidence), getRuntimeDeliberationPayload. |
| **Continuity row build** | `apps/studio/lib/runtime-continuity.ts`: buildContinuityRows (uses trace + deliberation; does not surface proposal_outcome/governance_evidence in ContinuitySessionRow). |
| **Thought map (advisory)** | `apps/studio/lib/runtime-thought-map.ts`: deriveThoughtMapSummary. `apps/studio/lib/trajectory-feedback-adapter.ts`: getTrajectoryFeedback. |
| **Governance evidence set** | `apps/studio/lib/session-runner.ts`: manageProposals (governanceEvidence = { lane_type, classification_reason, actor_authority, reason_codes } for concept and extension paths). |
| **DB schema** | `supabase/migrations/20250310000005_creative_session_trace.sql`, `20250311000001_missing_columns.sql` (trace, decision_summary); `20260311000002_deliberation_trace.sql`; `20260312000001_trajectory_review.sql`. |

---

## 9. Current evidence schema inventory

**creative_session.trace (JSONB):**

- session_mode, metabolism_mode, drive, project_id, project_name, idea_thread_id, thread_name, idea_id, idea_summary  
- artifact_id, proposal_id, proposal_type, tokens_used, generation_model, start_time, end_time  
- requested_medium, executed_medium, fallback_reason, resolution_source, medium_fit, missing_capability, extension_classification, confidence_truth  
- **proposal_outcome**, **governance_evidence** (lane_type, classification_reason, actor_authority, reason_codes)  
- **selection_evidence** (v2: version, signals, decision_summary, selection_source, selected_thread_id, selected_mode, selected_drive, signals_present, signals_used)  
- trace_kind ("full" | "minimal")  
- Not present: trajectory_mode, trajectory_style_direction, trajectory_proposal_pressure, trajectory_reason  

**creative_session.decision_summary (JSONB):** next_action, rejected_alternatives, confidence (and any other keys used by the runner).

**deliberation_trace:** session_id, observations_json, state_summary, tensions_json, hypotheses_json, evidence_checked_json, rejected_alternatives_json, chosen_action, confidence, execution_mode, human_gate_reason, outcome_summary, created_at, updated_at.

**trajectory_review:** session_id, deliberation_trace_id, review_version, narrative_state, action_kind, outcome_kind, trajectory_quality, alignment_score, movement_score, novelty_score, governance_score, confidence_calibration_score, issues_json, strengths_json, learning_signal, recommended_next_action_kind, created_at.

---

## 10. Missing structured fields (summary)

1. **Read path:** Add `proposal_outcome` and `governance_evidence` to:
   - Timeline: when building SessionTimelineRow from trace in getSessionContinuityTimeline (and to the type/interface).
   - Trace payload: in mapSessionTraceRow (and to the returned session shape) so getRuntimeTracePayload exposes them.
2. **Optional for trajectory reconstruction:** Add to trace at session end (in writeTraceAndDeliberation / minimal path): `trajectory_mode`, and optionally `trajectory_style_direction`, `trajectory_proposal_pressure`, `trajectory_reason` (from the trajectory used to steer the session, carried in state from buildContexts). Not required to seal Evidence Ledger V1 for proposal/selection audit.

---

## 11. Recommended minimal closure plan

1. **Expose proposal_outcome and governance_evidence (no new persistence)**  
   - In `apps/studio/lib/runtime-state-api.ts`:  
     - Extend the timeline row type and the logic in `getSessionContinuityTimeline` so each SessionTimelineRow includes `proposal_outcome: string | null` and `governance_evidence: { lane_type, classification_reason, actor_authority, reason_codes } | null` from `trace`.  
     - In `mapSessionTraceRow`, add `proposal_outcome` and `governance_evidence` from the trace object to the returned session object.  
   - Optionally surface these in the runtime UI (e.g. continuity history or session detail) so operators can see why a proposal was created or blocked.

2. **Optional (trajectory reconstruction):**  
   - Carry the trajectory used in buildContexts through session state and, in writeTraceAndDeliberation (and in the no-artifact path before persistTrajectoryReview), write `trajectory_mode` (and optionally the other §5.1 fields) into `creative_session.trace`.  
   - Update getSessionContinuityTimeline and thought map derivation to read these when building the per-session view.  

Do **not** add new tables or redesign the architecture; only expose existing trace fields and, if desired, add the minimal trajectory snapshot to trace.

---

## 13. Implementation summary (2026-03-13 closure)

- **mapSessionTraceRow:** Now returns `proposal_outcome` (string | null) and `governance_evidence` (GovernanceEvidenceDisplay | null). Parser `parseGovernanceEvidence` normalizes trace.governance_evidence to the display shape.
- **SessionTimelineRow:** Added `proposal_outcome` and `governance_evidence`.
- **getSessionContinuityTimeline:** Each row now includes `proposal_outcome` and `governance_evidence` from trace.
- **Runtime UI (page.tsx):** Selection evidence cards show Proposal outcome and Governance (lane_type, reason_codes) when present; continuity table has a "Proposal" column with proposal_outcome.
- **Optional trajectory snapshot:** Not added (would require carrying trajectory in session state and writing at session end; out of scope for read-path-only closure).

---

## 12. Final verdict

**Evidence Ledger V1: not yet sealed.** *(Audit baseline.)*

**Sealed 2026-03-13:** Read-path closure implemented: `proposal_outcome` and `governance_evidence` are now exposed on the timeline and trace payload (see implementation summary below).

**Reason:** Proposal and governance evidence are persisted but not exposed on any operator-facing API (timeline or trace payload). Reconstructing “why was this proposal created/blocked” and “what governance said” is possible only from raw DB trace, not from the current evidence/observability surface.

**To seal Evidence Ledger V1:** Implement the minimal closure plan §11.1 (expose `proposal_outcome` and `governance_evidence` on the timeline and trace payload). After that, Evidence Ledger V1 can be declared sealed for debugging, governance audit, and later trajectory/control-loop work. Adding per-session trajectory fields to trace (§11.2) remains recommended for thought-map/trajectory reconstruction but is not a prerequisite for sealing the ledger.
