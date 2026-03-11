# Session orchestrator (canon v2)

This document describes the **actual** staged runtime in `apps/studio/lib/session-runner.ts`: the single top-level orchestrator, shared execution state, and the purpose of each stage.

---

## 1. Overview

- **Entry points**: `runSessionInternal(options)` is used by both POST /api/session/run and the cron session route.
- **State**: All stages operate on a single `SessionExecutionState` object. Stages are pure (take state, return updated state) except for I/O (Supabase, OpenAI, storage).
- **Early exit**: If there is no primary artifact or no pipeline result after `runGeneration`, the runner skips persistence and goes directly to `finalizeResult`. Otherwise it runs persist stages only when `state.supabase` is non-null.

---

## 2. Staged flow

```
initializeExecutionState
    → loadCreativeStateAndBacklog
    → selectModeAndDrive
    → selectFocus
    → buildContexts
    → runGeneration
    → [if no primaryArtifact/pipelineResult] → finalizeResult
    → runCritiqueAndEvaluation
    → [if supabase] persistCoreOutputs
    → [if supabase] persistDerivedState
    → [if supabase] manageProposals
    → [if supabase] writeTraceAndDeliberation
    → finalizeResult
```

---

## 3. Stage purposes

| Stage | Purpose |
|-------|--------|
| **initializeExecutionState** | Build initial `SessionExecutionState` from options and Supabase client (or null). Sets defaults: `executionMode: "auto"`, `humanGateReason: null`, `sessionMode: "explore"`, empty decision summary, no artifact/critique/evaluation. |
| **loadCreativeStateAndBacklog** | Load latest creative state (from last snapshot or default) and compute live proposal backlog count. Feeds mode/drive and caps. |
| **selectModeAndDrive** | Compute `sessionMode` (e.g. explore/return) and `selectedDrive` from creative state + backlog. No DB writes. |
| **selectFocus** | Choose project/thread/idea. In "return" mode, may pick from archive_entry (weighted by recurrence, pull, recency). Otherwise uses project/thread selection. Sets `selectionSource` and `archiveCandidateAvailable`. |
| **buildContexts** | Fetch brain context, identity voice context, and optional project/thread/idea context. Produces `workingContext` and `sourceContext` for the pipeline. |
| **runGeneration** | Call `runSessionPipeline` (mode, drive, project/thread/idea, contexts, preferMedium). Enforce token limit; optionally upload image to storage and set primary artifact. Produces `pipelineResult`, `primaryArtifact`, `tokensUsed`, `derivedPreferMedium`. |
| **runCritiqueAndEvaluation** | Run critique on primary artifact; compute evaluation signals. Produces `critique` and `evaluation`. |
| **persistCoreOutputs** | Insert creative_session, artifact, critique_record, evaluation_signal; update artifact with scores; insert generation_run. Order is fixed (see 01_foundation/data_model.md and persistence section below). approval_record is not written by the runner; it is written only by POST /api/artifacts/[id]/approve. |
| **persistDerivedState** | Insert archive_entry (when critique_outcome is archive_candidate), creative_state_snapshot, memory_record; recurrence writeback to idea/idea_thread. |
| **manageProposals** | Create or refresh proposal_record only when eligible (habitat layout for concept, avatar candidate for image), subject to caps. Does not transition or apply proposals. Sets `proposalCreated`, `traceProposalId`, `traceProposalType`, `decisionSummary`. |
| **writeTraceAndDeliberation** | Update creative_session with `trace` and `decision_summary`; call `writeDeliberationTrace` with data from state (observations, evidence_checked, hypotheses, execution_mode, human_gate_reason, etc.). |
| **finalizeResult** | Map state to `SessionRunSuccessPayload` (session_id, artifact_count, persisted, flags, warnings). No DB writes. |

---

## 4. SessionExecutionState (summary)

The type is defined in `session-runner.ts`. Key groups:

- **Supabase / options**: `supabase`, `createdBy`, `isCron`, `preferMedium`, `promptContext`
- **Creative state / backlog**: `previousState`, `liveBacklog`
- **Mode / drive / focus**: `sessionMode`, `selectedDrive`, `selectionSource`, `selectedProjectId`, `selectedThreadId`, `selectedIdeaId`, `archiveCandidateAvailable`
- **Context**: `brainContext`, `workingContext`, `sourceContext`
- **Pipeline output**: `pipelineResult`, `primaryArtifact`, `derivedPreferMedium`, `tokensUsed`, `critique`, `evaluation`
- **Flags**: `repetitionDetected`, `archiveEntryCreated`, `recurrenceUpdated`, `proposalCreated`, `memoryRecordCreated`
- **Proposal trace**: `traceProposalId`, `traceProposalType`, `decisionSummary`
- **Governance / operator**: `executionMode`, `humanGateReason`, `metabolismMode`
- **Misc**: `warnings`, recurrence attempt/success flags

When `supabase` is null, persist stages no-op and the API returns `persisted: false`.

---

## 5. Execution classification

- **ExecutionMode**: `"auto"` | `"proposal_only"` | `"human_required"`. Currently the runner initializes to `"auto"` and does not set `proposal_only` or `human_required` in code; classification is reserved for future use (e.g. operator-style boundaries).
- **HumanGateReason**: Optional string; null by default. Set only when a human gate is explicitly recorded (implementation-defined where this is set in current code).
- **Effect**: The Twin never self-approves or self-publishes. Proposals are created in `manageProposals`; transitions and application are human-gated via API routes. Deliberation trace records `execution_mode` and `human_gate_reason` for future reasoning.

---

## 6. Write ordering (persistence)

Within a successful run (supabase non-null, artifact + critique + evaluation present):

1. **persistCoreOutputs**: creative_session → artifact → critique_record → evaluation_signal → artifact score update → generation_run.
2. **persistDerivedState**: archive_entry (if archive_candidate) → creative_state_snapshot → memory_record → recurrence writeback to idea/idea_thread.
3. **manageProposals**: proposal_record inserts only (no state transitions).
4. **writeTraceAndDeliberation**: creative_session trace/decision_summary update → deliberation_trace insert.

Token usage is updated (e.g. in cron) after the run; the exact call-site is implementation-defined.

---

## 7. Errors

- **SessionRunError**: Thrown on token limit exceeded, session insert failure, artifact insert failure, and other handled failures. Callers map to HTTP status and body.
- **Warnings**: Non-fatal issues (e.g. trace update failure, deliberation insert failure, proposal insert failure) are appended to `state.warnings` and returned in the payload.
