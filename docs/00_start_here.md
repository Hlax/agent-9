# 00 Start Here

This file is the entry point for humans and coding agents.

Its purpose is to make the repo easy to navigate, reduce architectural drift,
and clarify which documents are **canon** versus which documents are **build guidance**.

---

# 1. What This Repo Is

This repo defines and scaffolds the Twin:

a long-lived creative system that explores identity through generated artifacts,
while preserving memory, judgment, governance, and curated public release.

The Twin is not:

- a simple content generator
- a raw public feed of outputs
- a fully autonomous self-rewriting system

The Twin may propose change.
Harvey approves change.

---

# 2. Document Categories

This repo should be read in layers.

## Canon
These define the system's stable meaning and behavior.

- `docs/01_foundation/`
- `docs/02_runtime/`
- `docs/03_governance/`
- `docs/04_product/`

## Build Guidance
These explain how the scaffold should be implemented.

- `docs/05_build/`

## Coding Agent Instructions
These are written directly for Cursor or other coding agents.

- `docs/agents/`

If build guidance conflicts with canon,
**canon wins unless Harvey explicitly approves a redefinition.**

---

# 3. Recommended Read Order

## Step 1 — Foundation
Read first to understand what exists.

1. `docs/01_foundation/constitution.md`
2. `docs/01_foundation/glossary.md`
3. `docs/01_foundation/ontology_notes.md`
4. `docs/01_foundation/data_model.md`

## Step 2 — Runtime
Read next to understand how the system behaves.

5. `docs/02_runtime/system_architecture.md`
6. `docs/02_runtime/creative_state_model.md`
7. `docs/02_runtime/session_loop.md`
8. `docs/02_runtime/runtime_stack.md`
9. `docs/02_runtime/memory_model.md`
10. `docs/02_runtime/idea_lineage.md`
11. `docs/02_runtime/archive_and_return.md`
12. `docs/02_runtime/self_critique_system.md`
13. `docs/02_runtime/evaluation_signals.md`
14. `docs/02_runtime/judgment_flow.md`

## Step 3 — Governance
Read next to understand what must remain supervised.

15. `docs/03_governance/approval_rules.md`
16. `docs/03_governance/approval_state_machine.md`
17. `docs/03_governance/intervention_rules.md`
18. `docs/03_governance/change_record_system.md`
19. `docs/03_governance/versioning_policy.md`
20. `docs/03_governance/versioning_model.md`
21. `docs/03_governance/runtime_invariants.md`
22. `docs/03_governance/approval_lanes.md`

## Step 4 — Product Surfaces
Read next to understand where the system appears.

23. `docs/04_product/product_overview.md`
24. `docs/04_product/mvp_scope.md`
25. `docs/04_product/private_studio.md`
26. `docs/04_product/staging_habitat.md`
27. `docs/04_product/public_habitat.md`
28. `docs/04_product/release_archive.md`
29. `docs/04_product/surface_release_model.md`

## Step 5 — Build and Execution
Read next to scaffold the actual system.

30. `docs/05_build/build_architecture.md`
31. `docs/05_build/phase_4_build_contract.md`
32. `docs/05_build/v1_vertical_slice.md`
33. `docs/05_build/scaffolding_plan.md`
34. `docs/05_build/identity_seed_ingestion.md`
35. `docs/05_build/mind_test_spec.md`

## Step 6 — Agent Instructions
Read last before coding.

36. `docs/agents/cursor_agent_build_instructions.md`
37. `docs/agents/coding_agent_architecture_rules.md`
38. `docs/agents/agent_handoff_rules.md`

---

# 4. Repo Shape

The intended repo layout is:

```text
apps/
  studio/
  habitat-staging/
  public-site/

packages/
  core/
  agent/
  memory/
  evaluation/
  ui/

docs/
  01_foundation/
  02_runtime/
  03_governance/
  04_product/
  05_build/
  agents/

artifacts/
  drafts/
  archived/
  published/

data/
  migrations/
  seeds/
  logs/
```

---

# 5. What Coding Agents Must Not Assume

Coding agents must not assume:

- approval means publication
- staging means public release
- critique can replace evaluation
- evaluation can replace approval
- source items, memory, and artifacts are interchangeable
- the Twin may silently rewrite its own rules
- all future ideas need to be implemented in V1

When uncertain:

- preserve structure
- keep state transitions explicit
- leave TODOs rather than inventing architecture

---

# 6. First Real Goal

The first real goal is not a polished public site.

The first real goal is:

- authenticated Studio
- one working runtime session
- one stored artifact
- critique + evaluation records
- memory / lineage association
- review-state transitions
- publication-state transitions
- staging/public surface shells

The Public Habitat may initially remain a minimal deployed page that says:

**Hello Twin!**

That is acceptable for the first scaffold milestone.

---

# 7. Operational Principle

The Twin may:

- generate
- critique
- evaluate
- remember
- propose

Harvey decides:

- what is retained
- what is revised
- what is staged
- what is published
- what is adopted as a system change

That supervision model should remain visible in both code and documentation.
