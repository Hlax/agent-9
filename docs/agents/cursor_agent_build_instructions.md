# Cursor Agent Build Instructions

This document provides instructions for coding agents such as Cursor to safely build the Twin system.

The repository contains canonical design documents describing the system. Agents must treat those documents as the authoritative specification.

---

## 0. Before Implementing (Implementation Checklist)

**Run docs/05_build/IMPLEMENTATION_CHECKLIST.md** before changing routes, proposal contracts, snapshot logic, governance logic, staging/public read paths, or promotion behavior.

When starting a task, confirm:

- Identify owning module (Runtime, Governance, Staging, Promotion, Public).
- Call out any contract changes.
- Confirm no public-truth violation (public reads from snapshot only).
- Confirm no governance bypass.
- Confirm runtime remains proposal-only.
- Confirm staging remains candidate-only.
- Confirm promotion remains snapshot-only (new row only, never mutate existing).
- Confirm no projection treated as canonical.
- Confirm data flow: Runtime → Proposal → Governance → Staging → Promotion → Public Snapshot (no skips).
- Update docs if architecture changed.
- Add tests for touched contracts.

---

## 1. Canonical Document Order

Read the documentation in this order before scaffolding:

### Foundation
1. `docs/01_foundation/constitution.md`
2. `docs/01_foundation/glossary.md`
3. `docs/01_foundation/ontology_notes.md`
4. `docs/01_foundation/data_model.md`

### Runtime
5. `docs/02_runtime/system_architecture.md`
6. `docs/02_runtime/creative_state_model.md`
7. `docs/02_runtime/session_loop.md`
8. `docs/02_runtime/runtime_stack.md`
9. `docs/02_runtime/runtime_diagram.md`
10. `docs/02_runtime/memory_model.md`
11. `docs/02_runtime/idea_lineage.md`
12. `docs/02_runtime/archive_and_return.md`
13. `docs/02_runtime/judgment_flow.md`

### Governance
14. `docs/03_governance/self_critique_system.md`
15. `docs/03_governance/evaluation_signals.md`
16. `docs/03_governance/approval_rules.md`
17. `docs/03_governance/approval_state_machine.md`
18. `docs/03_governance/intervention_rules.md`
19. `docs/03_governance/change_record_system.md`
20. `docs/03_governance/runtime_invariants.md`
21. `docs/03_governance/approval_lanes.md`
22. `docs/03_governance/versioning_policy.md`
23. `docs/03_governance/versioning_model.md`

### Product
24. `docs/04_product/product_overview.md`
25. `docs/04_product/mvp_scope.md`
26. `docs/04_product/private_studio.md`
27. `docs/04_product/source_library_ingest.md`
28. `docs/04_product/staging_habitat.md`
29. `docs/04_product/public_habitat.md`
30. `docs/04_product/release_archive.md`
31. `docs/04_product/surface_release_model.md`

### Build
32. `docs/05_build/IMPLEMENTATION_CHECKLIST.md` — run before architecture-sensitive changes
33. `docs/05_build/build_architecture.md`
34. `docs/05_build/phase_4_build_contract.md`
35. `docs/05_build/v1_vertical_slice.md`
36. `docs/05_build/scaffolding_plan.md`
37. `docs/05_build/identity_seed_ingestion.md`
38. `docs/05_build/mind_test_spec.md`

### Agent instructions
39. `docs/agents/repo_context.md`
40. `docs/agents/coding_agent_architecture_rules.md`

This order mirrors the system dependency chain.

---

## 2. Build Strategy

Implement the system in layers.

Layer 1 — database schema and core enums  
Layer 2 — core domain models and shared types  
Layer 3 — runtime engine and generation orchestration  
Layer 4 — critique, evaluation, approval, and publication records  
Layer 5 — memory, lineage, archive, and return helpers  
Layer 6 — Studio interface and review queues  
Layer 7 — staging habitat and public habitat surfaces  

Do not begin public-surface polish before core runtime logic, review state, and persistence are coherent.

---

## 3. Database Implementation

The data model document defines canonical entities.

Agents should:
- map canonical entities to database tables
- preserve field names unless a canon update explicitly changes them
- preserve enums
- preserve separation between review state and publication state
- preserve explicit proposal/release records where required
- avoid renaming entities without approval

Supabase/Postgres is the recommended implementation target.

---

## 4. Runtime Responsibilities

The runtime engine must:
- start creative sessions
- load context
- generate artifacts
- run critique
- compute evaluation signals
- update memory and lineage
- write provenance for generation attempts
- place review-eligible artifacts into pending review

The runtime loop must remain **observable, auditable, and replay-friendly**.

For V1, prioritize:
- explicit logging
- traceable state transitions
- clear session inputs and outputs
- reproducible storage of prompts, context, critique, evaluation, and generation-run provenance

Do not assume full determinism once model providers or external tools are involved. Preserve enough structure that runtime behavior can be reviewed, debugged, and interpreted later.

---

## 5. Judgment Separation Rules

Agents must not collapse the following layers:

- Self Critique
- Evaluation Signals
- Human Approval
- Publication State
- Surface Release Review
- System Proposal Review

Each must remain a separate component or record type.

---

## 6. Artifact Lifecycle

Artifacts should move through review-facing states such as:

`draft` → `pending_review` → `approved` / `approved_with_annotation` / `needs_revision` / `rejected` / `archived` / `approved_for_publication`

Approval and publication must remain separate concepts.

`approved_for_publication` means Harvey has intentionally cleared an artifact for possible public release.

Actual publication is a separate step governed by **publication state**.

Recommended V1 publication states:
- `private`
- `internal_only`
- `scheduled`
- `published`

Agents must not collapse internal approval and external release into one status or one action.

---

## 7. Approval Lanes

The scaffold must preserve three review lanes:

### Artifact lane
For generated writing, image, and concept artifacts.

### Surface lane
For staging habitat layouts, collections, interface proposals, and public habitat release candidates.

### System lane
For runtime changes, workflow changes, evaluation changes, memory logic changes, policy changes, and coding-agent implementation proposals.

A decision in one lane must not silently apply to another lane.

---

## 8. Provenance Requirement

Generation must preserve a minimal provenance record.

At minimum, V1 should store:
- session id
- artifact id
- medium
- provider name
- model name
- prompt snapshot or prompt hash
- context snapshot or context summary
- generation start time
- generation end time
- run status

This is required for auditability and future debugging.

---

## 9. Studio Requirements

The private Studio should allow Harvey to:
- start sessions
- review artifacts
- read critique and evaluation
- annotate outputs
- approve, reject, revise, or archive artifacts
- mark artifacts `approved_for_publication`
- publish only artifacts already `approved_for_publication`
- review staging habitat proposals
- review and promote staging releases to public
- review system proposals

The Studio is the main human governance surface for:
- artifact review
- publication review
- staging review
- system proposal review

---

## 10. Safety Rules

Agents must not:
- remove canonical entities
- rename ontology concepts
- merge evaluation and approval logic
- merge approval and publication logic
- publish habitat changes through artifact publication logic
- bypass memory or lineage updates
- silently redefine enums or approval meanings
- write production habitat changes directly from runtime output

Violating these rules breaks the architecture.

---

## 11. Implementation Goal

The goal is a working system capable of:
- running creative sessions
- generating artifacts
- critiquing and evaluating outputs
- storing memory and lineage context
- preserving provenance
- allowing human review
- handling publication state transitions explicitly
- staging surface proposals safely
- publishing selected artifacts intentionally
