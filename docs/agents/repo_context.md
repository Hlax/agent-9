# Repository Context

This repository contains the design and implementation scaffold for the **Twin creative agent system**.

The Twin is a governed, state-driven creative system that generates artifacts, critiques them, evaluates them, stores memory, preserves lineage, and routes outputs into explicit human review and publication flows.

## Canonical System Documents

Treat the following folders as the primary sources of truth:

### Foundation
- `docs/01_foundation/constitution.md`
- `docs/01_foundation/glossary.md`
- `docs/01_foundation/ontology_notes.md`
- `docs/01_foundation/data_model.md`

### Runtime
- `docs/02_runtime/system_architecture.md`
- `docs/02_runtime/creative_state_model.md`
- `docs/02_runtime/session_loop.md`
- `docs/02_runtime/runtime_stack.md`
- `docs/02_runtime/runtime_diagram.md`
- `docs/02_runtime/memory_model.md`
- `docs/02_runtime/idea_lineage.md`
- `docs/02_runtime/archive_and_return.md`
- `docs/02_runtime/judgment_flow.md`

### Governance
- `docs/03_governance/self_critique_system.md`
- `docs/03_governance/evaluation_signals.md`
- `docs/03_governance/approval_rules.md`
- `docs/03_governance/approval_state_machine.md`
- `docs/03_governance/intervention_rules.md`
- `docs/03_governance/change_record_system.md`
- `docs/03_governance/runtime_invariants.md`
- `docs/03_governance/approval_lanes.md`
- `docs/03_governance/versioning_policy.md`
- `docs/03_governance/versioning_model.md`

### Product
- `docs/04_product/product_overview.md`
- `docs/04_product/mvp_scope.md`
- `docs/04_product/private_studio.md`
- `docs/04_product/source_library_ingest.md`
- `docs/04_product/staging_habitat.md`
- `docs/04_product/public_habitat.md`
- `docs/04_product/release_archive.md`
- `docs/04_product/surface_release_model.md`

### Build
- `docs/05_build/build_architecture.md`
- `docs/05_build/phase_4_build_contract.md`
- `docs/05_build/v1_vertical_slice.md`
- `docs/05_build/scaffolding_plan.md`
- `docs/05_build/identity_seed_ingestion.md`
- `docs/05_build/mind_test_spec.md`

## Important Principles

Build agents working in this repository should:
- follow the architecture defined in the documentation
- preserve canonical names, enums, and state boundaries
- avoid introducing new system concepts without updating glossary and data model
- treat approval, publication, and surface release as separate flows
- treat surface proposals and system proposals as different from artifact approval
- prefer extending existing systems rather than inventing parallel ones
- preserve explicit history for approval transitions, publication transitions, and meaningful proposals

If uncertainty exists, consult the canonical docs before implementing new behavior.

When documentation conflicts:
1. foundation meaning wins over convenience
2. governance separation wins over collapsed implementation
3. explicit state transitions win over inferred shortcuts
4. `docs/05_build/phase_4_build_contract.md` guides implementation details only when canon is not contradicted