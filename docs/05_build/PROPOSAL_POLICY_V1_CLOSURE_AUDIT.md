# Proposal Policy V1 — Closure Audit

**Date:** 2026-03-13  
**Context:** Governance V1, Evidence Ledger V1, and Trajectory Feedback V1 are sealed. This audit assesses the **proposal-policy layer** for closure: whether proposal generation behavior is explicit, bounded, inspectable, and aligned with the current architecture.

**Scope:** No redesign. Minimum needed to make proposal behavior explicit, auditable, and stable on top of sealed governance/evidence/trajectory layers.

**Implementation status (post-closure):** The three mandatory fixes are implemented: (1) governance evidence set on createCheck/gate block and persisted; (2) avatar/extension skip outcomes set as `skipped_cap` and `skipped_duplicate`; (3) `duplicate_signal` wired from proposal families and passed to the gate. Lane precedence is documented in code. Pressure tiers and structural vs semantic duplicate policy are documented below.

---

## 1. Pass/Fail by Sub-Area

| Sub-area | Pass/Fail | Notes |
|----------|-----------|--------|
| **Inputs that influence proposal creation** | **Pass** | Confidence, eligibility, backlog caps, governance gate, artifact type, and duplicate_signal (semantic) are wired. Trajectory/taste remain intentionally out of proposal creation (mode/focus/drive only). |
| **Proposal behaviors (create/skip) explicit in code** | **Pass** | Surface (habitat_layout), medium (extension), avatar paths and skip reasons in `manageProposals`; lane precedence comment in code. |
| **Surface vs medium decision explicit and governed** | **Pass** | Lane by `classifyProposalLane`; surface vs medium is stable policy in `proposal-governance.ts`. |
| **Surface vs medium inspectable from traces** | **Pass** | `traceProposalType`, `proposal_outcome`, and `governance_evidence` (including on block) persisted and exposed on timeline/trace. |
| **Proposal pressure (two-tier model)** | **Pass** | Tier 1 (hard) consumed; Tier 2 (soft) documented; see §6. | 
| **Duplicate controls (structural vs semantic)** | **Pass** | Structural duplicate guard (artifact+role) and semantic duplicate_signal to gate; see §7. |
| **Operator reconstructability** | **Partial** | Full for single-path outcomes. When multiple paths run, one `proposal_outcome` per session (last write wins); future: `proposal_attempts` structure for full reconstructability. |

---

## 2. Exact Files / Functions Involved

| Concern | File | Function / area |
|---------|------|------------------|
| Proposal creation (surface / medium / avatar) | `apps/studio/lib/session-runner.ts` | `manageProposals` (≈1653–2155) |
| Lane classification | `apps/studio/lib/proposal-governance.ts` | `classifyProposalLane` |
| Create authority | `apps/studio/lib/proposal-governance.ts` | `canCreateProposal`, `getProposalAuthority` |
| Governance gate | `apps/studio/lib/proposal-governance.ts` | `evaluateGovernanceGate` |
| Concept eligibility | `apps/studio/lib/proposal-eligibility.ts` | `isProposalEligible` |
| Extension eligibility | `apps/studio/lib/session-runner.ts` | `isExtensionProposalEligible` (≈1633–1651) |
| Backlog caps | `apps/studio/lib/stop-limits.ts` | `getMaxPendingHabitatLayoutProposals`, `getMaxPendingAvatarProposals`, `getMaxPendingExtensionProposals` |
| Confidence threshold | `apps/studio/lib/session-runner.ts` | `PROPOSAL_CONFIDENCE_MIN` (0.4), used in `hasMinimumEvidence` then `evaluateGovernanceGate` |
| Trace persistence | `apps/studio/lib/session-runner.ts` | Trace object built ~2422–2449, `persistSessionTrace` |
| Timeline / trace read | `apps/studio/lib/runtime-state-api.ts` | `mapSessionTraceRow`, `getSessionContinuityTimeline`; `SessionTimelineRow` includes `proposal_outcome`, `governance_evidence` |
| Human proposal creation | `apps/studio/app/api/proposals/route.ts` | POST body → `classifyProposalLane`, `canCreateProposal` |
| Artifact → proposal (Harvey) | `apps/studio/app/api/artifacts/[id]/create-proposal/route.ts` | POST → governance then insert |
| Chat name proposal | `apps/studio/app/api/chat/route.ts` | NAME_PROPOSAL regex → `classifyProposalLane`, `canCreateProposal`, insert |
| Duplicate signal (semantic) | `apps/studio/lib/session-runner.ts`, `proposal-governance.ts` | `getDuplicateSignalForProposalGate` (families); `evaluateGovernanceGate` receives 0–1 signal |
| Proposal pressure (observability only) | `apps/studio/lib/synthesis-pressure.ts` | `computeSynthesisPressure`, `getSynthesisPressure` — diagnostic only |

---

## 3. Current Proposal-Policy Schema / Inputs Inventory

### 3.1 Inputs that currently influence proposal creation

| Input | Used? | Where | Hard policy vs soft |
|-------|--------|--------|----------------------|
| **confidence** | Yes | `hasMinimumEvidence` (confidence ≥ PROPOSAL_CONFIDENCE_MIN 0.4) → gate `has_minimum_evidence` | Hard: gate blocks when false. |
| **eligibility** | Yes | `isProposalEligible` (concept: alignment ≥ 0.6, fertility ≥ 0.7, pull ≥ 0.6, critique_outcome in continue/branch/shift_medium) | Hard: ineligible → skip, outcome `skipped_ineligible`. |
| **backlog caps** | Yes | `getMaxPendingHabitatLayoutProposals()` (default 2), `getMaxPendingAvatarProposals()` (3), `getMaxPendingExtensionProposals()` (5) | Hard: count ≥ cap → skip, outcome `skipped_cap` (all paths). |
| **governance gate** | Yes | `evaluateGovernanceGate` (authority, confidence_truth, has_minimum_evidence, duplicate_signal) | Hard: block when has_minimum_evidence false or non-surface promotion. Warn when confidence defaulted or duplicate_signal ≥ 0.8. |
| **trajectory signals** | No | — | Intentionally not inputs to manageProposals (mode/focus/drive only). |
| **taste / focus context** | No | — | Intentionally not inputs to manageProposals. |
| **proposal history / duplicates** | Yes | Structural: rejected/archived guard (concept); same artifact+role (extension, avatar). Semantic: duplicate_signal from proposal families passed to gate. | Hard: structural guards. Soft: duplicate_signal → gate warn. |
| **thread continuity** | No | — | Not an input to proposal create/skip. |
| **artifact type** | Yes | `artifact.medium === "concept"` → surface habitat path; `=== "image"` → avatar path; `isExtensionProposalEligible` → medium extension path. | Hard: branch by medium + extension eligibility. |

### 3.2 Canonical proposal_outcome values (trace)

Path is inferred from `traceProposalType` (surface | avatar | extension) when a proposal was created; for skips, path follows the lane that was evaluated (concept / image / extension). Outcome set is **unified** across paths:

- **created** — new proposal inserted (surface habitat, avatar, or extension).
- **updated** — existing active habitat_layout proposal refreshed (concept path only).
- **skipped_cap** — backlog at cap for that lane (concept, avatar, or extension).
- **skipped_duplicate** — structural duplicate: avatar already has proposal, or extension already has pending proposal for same artifact+role.
- **skipped_ineligible** — concept path; eligibility check failed.
- **skipped_governance** — createCheck or gate blocked; `governance_evidence` is always set and persisted (lane_type, actor_authority, reason_codes, classification_reason).
- **skipped_rejected_archived** — concept path; same artifact already has rejected/archived proposal.

---

## 4. Proposal Behaviors Present in Code

| Behavior | Present? | Where |
|----------|----------|--------|
| Create surface proposal (habitat_layout) | Yes | manageProposals, concept path; insert or update. |
| Create medium proposal (extension) | Yes | manageProposals, extension path; insert only. |
| Create surface proposal (avatar) | Yes | manageProposals, image path; insert only. |
| Update existing proposal | Yes | Concept path: refresh newest active habitat_layout. |
| Skip due to cap | Yes | All three paths; only concept path sets `proposalOutcome = "skipped_cap"`. |
| Skip due to ineligibility | Yes | Concept path; `proposalOutcome = "skipped_ineligible"`. |
| Skip due to governance | Yes | Concept and extension paths; `proposalOutcome = "skipped_governance"`. |
| Skip due to low evidence/confidence | Yes | Via gate (has_minimum_evidence); outcome is `skipped_governance`. |
| Skip due to rejected/archived | Yes | Concept path only; `proposalOutcome = "skipped_rejected_archived"`. |
| Skip extension due to duplicate (same artifact+role) | Yes | No insert; `proposalOutcome = "skipped_duplicate"`. |
| Skip avatar due to cap | Yes | `proposalOutcome = "skipped_cap"`. |
| Skip avatar (already has proposal) | Yes | `proposalOutcome = "skipped_duplicate"`. |

---

## 5. Surface vs Medium: Explicit, Inspectable, Governed

- **Explicit in code:** Yes. Surface vs medium is determined by `classifyProposalLane` (role + target_surface + target_type). Runner uses fixed roles: habitat_layout → surface; extension roles → medium; avatar_candidate → surface.
- **Inspectable from traces:** Partially. `traceProposalType` (surface | avatar | extension) and `proposal_outcome` are in trace; timeline exposes `proposal_outcome` and `governance_evidence`. When gate blocks, `governance_evidence` is null so "why" (reason_codes) is not visible.
- **Governed by stable policy:** Yes. Lane and authority rules live in `proposal-governance.ts`; eligibility thresholds in `proposal-eligibility.ts`; caps in `stop-limits.ts`.
- **Lane precedence (explicit policy):** Comment in `manageProposals`: 1. Concept → surface habitat; 2. Image → avatar; 3. Extension → medium. Later lanes may overwrite `proposalOutcome` until a multi-outcome trace (e.g. `proposal_attempts`) is introduced.

---

## 6. Proposal Pressure Model (Two-Tier)

Pressure is explicitly two-tiered so that hard policy (block) and soft pressure (warn / future influence) are not conflated.

**Tier 1 — Hard pressure (block)**  
Controls whether creation is allowed. If any Tier 1 condition fails, the proposal path is blocked or skipped and the outcome is traced.

- **Backlog caps** — getMaxPendingHabitatLayoutProposals, getMaxPendingAvatarProposals, getMaxPendingExtensionProposals. Count ≥ cap → skip; outcome `skipped_cap`.
- **Governance gate** — createCheck (e.g. runner vs system lane), evaluateGovernanceGate (has_minimum_evidence, non-surface promotion). Block → outcome `skipped_governance`; governance_evidence persisted with reason_codes.
- **Eligibility** — isProposalEligible (concept) / isExtensionProposalEligible. Ineligible → outcome `skipped_ineligible` (concept) or path not run (extension).
- **Structural duplicate guard** — same artifact + lane/role already has pending or rejected/archived proposal → skip; outcome `skipped_duplicate` or `skipped_rejected_archived` as appropriate.

**Tier 2 — Soft pressure (warn / influence later)**  
Does not block creation in V1; may produce governance warnings or future probability/weight signals.

- **duplicate_signal** — 0–1 from proposal families (semantic duplicate pressure). Passed to evaluateGovernanceGate; ≥ 0.8 adds DUPLICATE_PRESSURE_WARNING to reason_codes (warn only).
- **Synthesis pressure** — computed from recurrence, unfinished, archive, return success, repetition penalty, momentum. Observability only; not consumed for proposal create/skip.
- **Trajectory patterns** — e.g. stall, repetition_without_movement. Influence mode/drive (reflection_need, etc.), not proposal creation. Intentionally out of scope for Proposal Policy V1.

Documenting Tier 2 ensures caps are not treated as the only pressure variable in future work.

---

## 7. Duplicate Controls: Structural vs Semantic

Two distinct mechanisms; both are explicit policy.

**Structural duplicate guard (hard rule)**  
Integrity constraint: the same artifact + lane/role cannot have multiple pending proposals where the system defines "same" structurally.

- **Concept path:** Same artifact_id already has a proposal in rejected or archived (same lane/role) → do not create a new habitat proposal; outcome `skipped_rejected_archived`.
- **Extension path:** Same artifact_id + proposal_role already has a pending_review extension proposal → do not insert; outcome `skipped_duplicate`.
- **Avatar path:** Same artifact_id already has an avatar_candidate proposal → do not insert; outcome `skipped_duplicate`.

This is **integrity**, not creativity: it prevents duplicate rows and ambiguous lineage.

**Semantic duplicate pressure (soft rule)**  
Creative repetition control: how much recent proposal history looks like duplicates (e.g. from proposal_relationship / concept families).

- **duplicate_signal** — 0–1 derived from buildConceptFamilies (families_with_duplicate_pressure / family_count over recent proposals). Passed into evaluateGovernanceGate; when ≥ 0.8 the gate adds DUPLICATE_PRESSURE_WARNING to reason_codes (warn only, does not block).
- **Surfaced in evidence:** governance_evidence.reason_codes on trace; proposal-families and relationship summary in runtime-state-api for observability.

Trajectory/repetition (e.g. repetition_detected, gently_reduce_repetition) influences **mode and drive**, not proposal creation; that separation is intentional for V1.

---

## 8. Operator Reconstructability

From runtime surfaces (timeline, trace payload, runtime page):

| Question | Reconstructable? | How / gap |
|----------|------------------|-----------|
| Why was a **surface** proposal created? | Yes | proposal_outcome = created/updated; governance_evidence (lane_type, reason_codes); decision_summary.next_action. |
| Why was a **medium** proposal created? | Yes | Same; traceProposalType = extension. |
| Why was **no** proposal created? | Partially | proposal_outcome = skipped_* when set. **Gaps:** (1) When gate blocks, governance_evidence is null → reason_codes not visible. (2) Avatar skip (cap or already has proposal) → no outcome set. (3) Extension skip (cap or duplicate) → no outcome set. |
| Why was one proposal path chosen over another? | Partially | Order is implicit: concept → image → extension; last overwrites proposalOutcome. No explicit "path attempted" list; traceProposalType only set when a proposal was created. |

---

## 9. Closure Gaps Addressed and Future Options

### 9.1 Implemented (mandatory for sealing)

1. **Governance evidence when gate blocks** — Implemented. On createCheck fail or gate block, `governanceEvidence` is set (lane_type, classification_reason, actor_authority, reason_codes) and included in the returned state so the trace persists it. Full operator explainability restored.

2. **Avatar and extension skip outcomes** — Implemented. Unified outcomes: `skipped_cap`, `skipped_duplicate` (path inferred from traceProposalType / lane). Avatar: cap or already has proposal → skipped_cap / skipped_duplicate. Extension: cap or same artifact+role → skipped_cap / skipped_duplicate.

3. **Duplicate signal wired** — Implemented. `getDuplicateSignalForProposalGate(supabase)` derives 0–1 from recent proposals via buildConceptFamilies; result passed into `evaluateGovernanceGate` for both concept and extension paths. Gate can warn (DUPLICATE_PRESSURE_WARNING) when ≥ 0.8; reason_codes surfaced in governance_evidence.

### 9.2 Documented (policy and code)

4. **Lane precedence** — Explicit comment in `manageProposals`: 1. Concept → surface habitat; 2. Image → avatar; 3. Extension → medium. Later lanes may overwrite proposalOutcome until multi-outcome trace is introduced.

5. **Canon outcome values** — Listed in §3.2; path inferred from traceProposalType.

### 9.3 Future (nice-to-have, not required for V1 seal)

6. **proposal_attempts trace structure** — When multiple paths run, record per-lane outcome instead of a single overwritten value, e.g. `proposal_attempts: { concept: "skipped_cap", avatar: null, extension: "created" }`. Gives full reconstructability without ambiguity. Optional for V1; cleanest design for a later iteration.

---

## 10. Implementation Summary

- **Governance evidence on block:** Set in both concept and extension paths before early return; persisted in trace.
- **Avatar/extension outcomes:** `skipped_cap` and `skipped_duplicate` set for avatar and extension; path inferred from traceProposalType.
- **duplicate_signal:** `getDuplicateSignalForProposalGate(supabase)` in session-runner; called once at start of manageProposals; passed to both concept and extension gate calls.
- **Lane precedence:** Comment in manageProposals documents order and overwrite semantics.
- **Pressure tiers and duplicate policy:** Documented in §6 and §7 (Tier 1 hard / Tier 2 soft; structural vs semantic duplicates).

---

## 11. Final Verdict

**Proposal Policy V1: sealed.**

**Summary:** Proposal creation is **explicit and governed** in one place (`manageProposals` + `proposal-governance` + `proposal-eligibility` + `stop-limits`). Surface vs medium is **stable policy**; lane precedence is documented in code. Evidence Ledger V1 exposes `proposal_outcome` and `governance_evidence` on the read path; **governance_evidence** is now set and persisted when the gate or createCheck blocks. Avatar and extension skip reasons are traced as **skipped_cap** and **skipped_duplicate**. **duplicate_signal** is wired from proposal families to the governance gate (semantic duplicate pressure; structural duplicate guard remains the hard rule). Pressure is documented as two-tier (hard block vs soft warn); structural vs semantic duplicate policy is clearly separated. Trajectory and taste remain intentionally out of proposal creation (mode/focus/drive only). Optional future improvement: **proposal_attempts** trace structure for full multi-path reconstructability.
