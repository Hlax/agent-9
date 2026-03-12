# Phase 3: Extension proposal creation — technical implementation plan

Technical implementation plan only. No code in this document.

**Parent plan:** [Medium plugin refactor plan](./medium_plugin_refactor_plan.md) §5 (manageProposals evolution, extension proposal shape, caps).

**Context:** Phases 1 (medium registry, requested/executed/fallback/trace) and 2 (capability-fit, confidence, extension_classification, missing_capability in trace) are implemented. Phase 3 introduces **governed extension proposal creation**: when the runtime detects that an artifact cannot be adequately expressed with current mediums or toolchains, it may create a **proposal record** (no new execution, no auto-approval, no staging mutation).

---

## 1. Concise architecture description

- **Scope:** Add a single new branch inside the existing `manageProposals` flow that, when **eligibility conditions** are met, inserts an **extension proposal** row into `proposal_record`. All creation is gated by a strict predicate; no new execution authority. Extension proposals are not normalized into a separate table in this phase; `proposal_record` plus JSONB for extension-specific fields is the chosen approach.
- **Execution boundary:** Medium execution remains controlled solely by `registry.isExecutable()`. Extension proposals do not change registry behavior. No new medium-specific branching in the runner beyond one conditional: “if extension-eligible then create extension proposal.”
- **Coexistence:** Existing concept (habitat_layout) and image (avatar_candidate) proposal logic runs **unchanged** and **first**. Extension proposal creation is an **additional** path when capability-fit signals and artifact exist; it does not replace or short-circuit surface proposals.
- **Governance:** Extension proposals have no apply path in the runner. Operator review and approval (and any deploy/config change) remain out-of-band.

**Extension proposal roles (classification vocabulary):** See §3.4 for which field carries what; the vocabulary below is the **extension_type** (classification) set.

| extension_type | Meaning |
|----------------|---------|
| medium_extension | New artifact medium |
| toolchain_extension | External tool capability |
| workflow_extension | Multi-step generation pipeline |
| surface_environment_extension | Interactive habitat/surface environment |
| system_capability_extension | Runtime reasoning or system behavior |

---

### Phase 3 accepted contract (freeze before implementation)

- Extension proposals may be created **only** through conservative gating (eligibility + concrete support + cap + dedupe).
- **No new medium execution** is introduced.
- **No approval or apply behavior** changes; operator review and apply remain out-of-band.
- **Concept/image proposal behavior** remains unchanged.
- Extension proposal logic lives **in manageProposals only**, not scattered across the runner.
- **Plugin metadata** remains reserved, not authoritative, in Phase 3.

---

## 2. Pipeline insertion point

**Where:** Extension proposal creation happens **inside `manageProposals`**, after the existing concept and image branches, and only when the session has already run critique, capability-fit, and confidence.

**Current order (unchanged):**

1. runCritiqueAndEvaluation  
2. applyCapabilityFit  
3. applyConfidenceFromCritique  
4. persistCoreOutputs  
5. persistDerivedState  
6. **manageProposals** ← extension proposal creation is added here  
7. writeTraceAndDeliberation  
8. persistTrajectoryReview  

**Why inside manageProposals:**

- **Single place for all proposal creation:** Concept and image proposals are already created in `manageProposals`. Extension proposals are another proposal type; keeping them in the same function avoids scattering proposal logic and ensures caps/backlog are checked in one place.
- **Capability-fit and artifact are ready:** By the time `manageProposals` runs, state already has `medium_fit`, `missing_capability`, `extension_classification`, `primaryArtifact`, and `critique`. No need to run capability-fit again or to insert extension logic earlier.
- **No change to earlier pipeline steps:** Critique, capability-fit, confidence, and persistence remain exactly as in Phase 2. Only the **behavior inside manageProposals** gains one additional conditional branch that creates an extension proposal when eligible.
- **Trace after proposals:** `writeTraceAndDeliberation` runs after `manageProposals`, so trace can include “extension proposal created” (e.g. trace_extension_proposal_id) when applicable.

**What does not change:**

- Order of runCritiqueAndEvaluation → applyCapabilityFit → applyConfidenceFromCritique.
- persistCoreOutputs / persistDerivedState.
- The existing `if (artifact.medium === "concept")` and `if (artifact.medium === "image")` blocks; they run as today.

---

## 3. Proposal creation logic

### 3.1 Eligibility predicate: `shouldCreateExtensionProposal(state)`

**Returns true only when all of the following hold:**

| Condition | Source | Rationale |
|-----------|--------|-----------|
| `state.primaryArtifact` exists | state | We need a source artifact to link. |
| `state.primaryArtifact.artifact_id` is non-null | artifact | source_artifact_id must exist. |
| `state.medium_fit` is `"partial"` or `"unsupported"` | state (Phase 2) | Do not create for supported fit. |
| `state.extension_classification` is non-null | state (Phase 2) | Require a trustworthy classification; avoid weak evidence. |
| **Concrete support** (see below) | state + critique | At least one of: missing_capability non-null, medium_fit_note states insufficiency, or overall_summary supports extension. |
| Cap not exceeded | see §5 | e.g. pending extension proposals count < MAX_PENDING_EXTENSION_PROPOSALS. |
| `state.supabase` is non-null | state | Persistence required. |

**Concrete support (explicit definition):** At least one of:

- `missing_capability` is non-null, or
- `critique.medium_fit_note` clearly states that the current medium/body is insufficient, or
- `critique.overall_summary` clearly supports the extension rationale.

Implementers must not infer “concrete support” more loosely than this.

**Returns false (do not create) when:**

- Any of the above is false.
- `medium_fit === "supported"`.
- `extension_classification === null`.
- Concrete support is absent (missing_capability null and neither critique field clearly supports extension).
- Cap would be exceeded.
- A materially equivalent pending extension proposal already exists (see §3.5 dedupe).

### 3.2 Rationale extraction

- **Primary:** `critique.medium_fit_note` if non-empty; else `critique.overall_summary` (trimmed, length-capped e.g. 500 chars).
- **Fallback:** Concatenate artifact title + summary (short) and append “medium_fit: {medium_fit}, classification: {extension_classification}”.
- Store in the proposal row as `rationale` (or equivalent column; see §6).

### 3.3 Payload derivation (minimal fields for Phase 3)

| Contract field | Source |
|----------------|--------|
| proposal_role | Set from state.extension_classification for governance/filtering (e.g. surface_environment_extension). See §3.4. |
| extension_type | state.extension_classification (stored in payload/column). See §3.4. |
| proposed_medium | Inferred: e.g. from requested_medium if it was unregistered, or from extension_classification (e.g. surface_environment_extension → “interactive_surface” as label); or leave null if not inferrable. |
| missing_capability | `state.missing_capability` |
| required_capabilities | Optional; leave null or derive from missing_capability (e.g. [missing_capability] when non-null). |
| supporting_tools | Optional; null for Phase 3. |
| source_artifact_id | `state.primaryArtifact.artifact_id` |
| rationale | From §3.2 |
| affects_surface | Derive from extension_classification (e.g. surface_environment_extension → staging_habitat or similar). |
| affects_identity | false for Phase 3 unless classification implies it. |
| execution_risk | Optional; null or “low” for Phase 3. |
| lane_type | “extension” (if enum extended) or “system” |
| target_type | e.g. “extension” or “medium_extension” |
| title | Artifact title + “ (extension proposal)” or similar. |
| summary | Rationale or artifact summary, capped. |
| proposal_state | “pending_review” |

---

## 4. Interaction with manageProposals

- **Order of execution:** Run existing concept branch (artifact.medium === "concept"), then existing image branch (artifact.medium === "image"), **then** extension-eligibility check. If `shouldCreateExtensionProposal(state)` is true and cap allows, insert one extension proposal row.
- **No replacement:** Concept and image branches are unchanged. They do not check medium_fit or extension_classification. Extension path is additive.
- **Shared state:** All branches read the same `state` (artifact, critique, evaluation, medium_fit, extension_classification, missing_capability). Only the extension branch writes `proposal_record` with lane_type extension (or system) and proposal_role in the extension classification set.
- **Trace and proposalCreated:** If an extension proposal is created, set `state.traceProposalId` to the new proposal_record_id and set a distinct `traceProposalType` (e.g. “extension”) so trace/deliberation can show “extension proposal created.” Optionally set `proposalCreated` to true if not already set by a surface proposal.
- **Single artifact:** Current design has one primary artifact per session. Extension proposal is created at most once per session (one row per run when eligible). No loop over multiple artifacts.

---

## 5. Use of plugin metadata (Phase 3 vs Phase 1 legacy)

- **Phase 3 does not yet switch proposal routing to plugin metadata.** Existing behavior remains: concept → `artifact.medium === "concept"` and habitat_layout logic; image → `artifact.medium === "image"` and avatar_candidate logic. No change to how surface proposals are chosen.
- **Plugin metadata (proposalRole, proposalCapKey, targetSurface)** remains **reserved** for a later phase. Extension proposals are created from **state.extension_classification** and **state.medium_fit / missing_capability**, not from plugin.proposalRole. When we later replace runner branches with registry-driven routing, we will use plugin.proposalRole for **surface** proposals and keep extension_classification for **extension** proposals.
- **Summary:** Phase 3 adds one new branch that uses capability-fit state only. No removal of existing medium branches and no new use of plugin proposal metadata in this phase.

---

## 6. Proposal caps and backlog pressure

- **Cap:** Introduce a single env-driven cap, e.g. `MAX_PENDING_EXTENSION_PROPOSALS` (default e.g. 5 or 10). Same pattern as `getMaxPendingHabitatLayoutProposals` / `getMaxPendingAvatarProposals`.
- **Definition of “pending”:** Count rows in `proposal_record` where `lane_type = 'extension'` (or the chosen lane) and `proposal_state = 'pending_review'` (and optionally other non-terminal states if the FSM allows). Alternatively count by `proposal_role` in the extension set (medium_extension, toolchain_extension, etc.) and proposal_state = pending_review.
- **Where to check:** Inside `manageProposals`, before inserting an extension proposal: query count of pending extension proposals; if count >= cap, skip creation and optionally log. Do not create the row if cap would be exceeded.
- **File:** Add `getMaxPendingExtensionProposals()` in `apps/studio/lib/stop-limits.ts` (or equivalent), and use it in the extension-creation branch of `manageProposals`.

---

## 7. Proposal persistence

- **Table:** Use existing `proposal_record` table. No new table required for Phase 3 if we can represent extension proposals with current columns plus optional new columns.
- **Existing columns used:** proposal_record_id, lane_type, target_type, target_id, artifact_id, title, summary, proposal_state, created_by, created_at, updated_at, proposal_role, (and any existing optional columns).
- **Schema extension:** The payload contract includes fields not currently on `proposal_record`: proposed_medium, missing_capability, required_capabilities, supporting_tools, rationale, affects_surface, affects_identity, execution_risk, extension_type. Options:
  - **Option A:** Add a single JSONB column, e.g. `extension_payload_json`, and store the extension-specific fields there. Minimal schema change; query by lane_type and proposal_role.
  - **Option B:** Add nullable columns for each field. More explicit, better for filtering/analytics.
- **Recommendation:** Option A (one JSONB) for Phase 3 to avoid a large migration; document the shape so Option B can be done later if needed. We do **not** normalize extension proposals into a separate table in this phase.
- **lane_type:** If the existing enum is `approval_lane = ['artifact','surface','system']`, use `lane_type = 'system'` and identify extension proposals by `proposal_role` (and extension_type in payload) in the extension set. In Phase 3, extension proposals use **lane_type = system** as an **operational simplification**, even though semantically some proposals represent medium or surface evolution rather than ordinary runtime config changes. A future phase could introduce `lane_type = 'extension'` if the ontology is extended.

---

## 8. Trace updates

- **New trace fields (optional but recommended):** When an extension proposal is created in a run, add to the session trace object (e.g. in `writeTraceAndDeliberation` or when building the trace object before update):
  - `extension_proposal_id`: the new proposal_record_id (when created).
  - `extension_proposal_role`: the proposal_role (e.g. surface_environment_extension).
- **Existing fields:** requested_medium, executed_medium, fallback_reason, resolution_source, medium_fit, missing_capability, extension_classification, confidence_truth already exist. No change required for them.
- **Proposal type:** Ensure `traceProposalType` (or equivalent) can be set to a value that denotes “extension” when the created proposal was an extension proposal, so downstream/UI can distinguish extension from surface/avatar.

---

## 9. Interaction with proposal_only mediums

- **proposal_only** mediums are **known** to the registry (isRegistered true) but **not executable** (isExecutable false). Phase 3 does not change that. Resolution and fallback (requested_medium → executed_medium, fallback_reason) are unchanged.
- **When requested_medium is a proposal_only medium:** The runner already falls back to an executable medium and records requested_medium vs executed_medium. That run may then produce an artifact (e.g. concept) and, after critique, capability-fit may set medium_fit partial/unsupported and extension_classification non-null. If eligibility and cap allow, Phase 3 can then create an **extension proposal** that cites the requested medium (e.g. interactive_surface) and the source artifact. So proposal_only mediums naturally feed into extension proposals when the evidence supports it.
- **Anti-spam for repeated fallback:** Repeated fallback from the **same** proposal_only requested_medium must **not** create repeated pending extension proposals unless the new rationale is **materially different**. Use the dedupe identity (§3.5): same extension_classification + requested_medium + missing_capability + same rationale family → do not create another. This matters once interactive_surface or similar appears as a requested-but-nonexecutable medium.
- **No execution of proposal_only:** Phase 3 still does not execute proposal_only mediums; it only creates proposal records for operator review.

---

## 10. Edge cases

| Case | Handling |
|------|----------|
| **Partial fit but weak evidence** | Eligibility requires extension_classification non-null and (missing_capability or rationale). If evidence is weak, extension_classification stays null (Phase 2) and we do not create. |
| **missing_capability null** | Allowed only if critique rationale (medium_fit_note or overall_summary) provides concrete support. Otherwise do not create. |
| **extension_classification null** | Do not create. Null is valid for Phase 2; it means “no trustworthy classification.” |
| **Multiple artifacts in a session** | Current design: one primary artifact per session. Extension proposal is at most one per run, tied to primaryArtifact. If in future there are multiple artifacts, policy could be “at most one extension proposal per session” or “per artifact”; Phase 3 keeps “one per run, primary artifact only.” |
| **Repeated proposals for same capability gap** | **Required:** Do not create if a materially equivalent pending extension proposal exists. Use conceptual dedupe identity (§3.5): extension_classification + requested_medium + missing_capability + normalized rationale family. First implementation may approximate conservatively (e.g. exact match on first three + rationale length bucket). Cap also limits total pending. |
| **requested_medium === executed_medium but medium_fit partial** | Possible (e.g. artifact is concept but critique says poor fit). Eligibility is medium_fit partial/unsupported + extension_classification non-null + rationale/capability. So we can still create an extension proposal when the artifact exists and fit is partial. |
| **Critique missing** | If state.critique is null, capability-fit leaves medium_fit/extension_classification null; shouldCreateExtensionProposal is false. |

---

## 11. Migration safety

- **Phase 1 no-op execution:** No change to registry, resolution, or generation. Same plugins, same isExecutable/canPropose behavior. No new medium execution.
- **Phase 2 trace-only capability-fit:** Capability-fit and confidence remain descriptive. The only new behavior is “when eligible, insert one row into proposal_record.” All existing trace fields and state fields are unchanged. No removal of Phase 2 logic.
- **Regression checks:** (1) Concept runs still create habitat_layout proposals when eligible. (2) Image runs still create avatar_candidate proposals when eligible. (3) Sessions with medium_fit supported or extension_classification null do not create extension proposals. (4) Trace still contains all Phase 1 and Phase 2 fields. (5) No new code path executes a medium or mutates staging.

---

## 12. Proposed pipeline diagram (Phase 3 insertion)

```
runSessionInternal
  → loadCreativeStateAndBacklog
  → selectModeAndDrive
  → selectFocus
  → buildContexts
  → runGeneration                    [Phase 1: registry, requested/executed/fallback]
  → (if no artifact) finalize / trajectory only
  → runCritiqueAndEvaluation
  → applyCapabilityFit               [Phase 2: medium_fit, missing_capability, extension_classification]
  → applyConfidenceFromCritique      [Phase 2: confidence, confidence_truth]
  → persistCoreOutputs
  → persistDerivedState
  → manageProposals                  [Phase 3: add extension branch here]
       ├─ if artifact.medium === "concept" → [unchanged] habitat_layout path
       ├─ if artifact.medium === "image"   → [unchanged] avatar_candidate path
       └─ if shouldCreateExtensionProposal(state) && under cap
              → insert extension proposal row
              → set traceProposalId / traceProposalType (extension)
  → writeTraceAndDeliberation        [optional: add extension_proposal_id to trace]
  → persistTrajectoryReview
  → finalizeResult
```

---

## 13. Files to change

| Area | File(s) | Change |
|------|---------|--------|
| Eligibility + payload | `apps/studio/lib/session-runner.ts` | Add `shouldCreateExtensionProposal(state)` (or inline equivalent). Inside `manageProposals`, after concept/image branches, add extension branch: check eligibility, check cap, build payload, insert proposal_record. Set traceProposalId/traceProposalType when extension created. |
| Caps | `apps/studio/lib/stop-limits.ts` | Add `getMaxPendingExtensionProposals()`, env `MAX_PENDING_EXTENSION_PROPOSALS`, default value. |
| Schema (optional) | `supabase/migrations/` | One migration: add `extension_payload_json` JSONB to proposal_record (or add enum value `extension` to approval_lane if using new lane). |
| Types | `packages/core` or `apps/studio` | Optional: type for extension payload (ExtensionProposalPayload) and/or proposal_role extension values. |
| Trace | `apps/studio/lib/session-runner.ts` (writeTraceAndDeliberation) | Optional: add extension_proposal_id, extension_proposal_role to trace when extension proposal was created. |
| API / review | Existing proposals API | Ensure extension proposals are listable/filterable (e.g. by lane_type or proposal_role). May require no change if proposal_record is already queried by role. |
| Tests | `apps/studio/lib/__tests__/` | Add tests: shouldCreateExtensionProposal true/false for various state; cap enforced; no creation when extension_classification null; no creation when medium_fit supported. |

---

## 14. Phased implementation plan (within Phase 3)

1. **Schema + caps (small)**  
   - Migration: add `extension_payload_json` (or chosen columns) to proposal_record; extend approval_lane if desired.  
   - stop-limits: add getMaxPendingExtensionProposals() and env.

2. **Eligibility predicate**  
   - Implement shouldCreateExtensionProposal(state) with all conditions. Unit test with mock state (eligible / ineligible / cap exceeded).

3. **Payload builder**  
   - Function that, given state + artifact + critique, returns the extension proposal row shape (lane_type, target_type, proposal_role, artifact_id, title, summary, extension_payload_json, proposal_state, created_by, etc.).

4. **manageProposals integration**  
   - After existing concept and image blocks: if shouldCreateExtensionProposal(state), then check cap; if under cap, build payload, insert, update state (traceProposalId, traceProposalType, proposalCreated). No change to concept/image logic.

5. **Trace (optional)**  
   - When extension proposal created, add extension_proposal_id (and optionally extension_proposal_role) to the trace object written to creative_session.

6. **Tests**  
   - Unit: eligibility for various state combinations.  
   - Integration-style: run with mocked DB or test DB to ensure one extension proposal row when eligible and cap not exceeded; zero when ineligible or cap exceeded.

---

## 15. Risks and edge cases (summary)

- **Risk:** Extension proposals create operator backlog. Mitigation: strict eligibility, concrete support definition, cap, and required dedupe by conceptual identity (§3.5).
- **Risk:** Schema drift if payload is only JSONB. Mitigation: document the JSON shape; later migration can promote fields to columns if needed.
- **Edge case:** Same capability gap across sessions. Dedupe (extension_classification + requested_medium + missing_capability + rationale family) prevents nearly identical pending proposals; cap limits total.
- **Edge case:** proposal_only medium requested, fallback to concept, then critique says “interactive would be better.” Anti-spam rule (§9): do not create repeated pending proposals for the same requested_medium unless rationale is materially different; dedupe identity covers this.

---

## 16. Out of scope for Phase 3

- No new medium execution; no interactive_surface runtime.
- No automatic staging mutation; no governance bypass; no auto-approval.
- No refactor of concept/image proposal logic to use plugin metadata.
- No new runner branching by medium id beyond the single “extension-eligible” branch.
