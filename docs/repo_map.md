# Repository Map

This document describes the high-level structure of the Twin repository.

---

## Top-Level Structure

```text
README.md
docs/
apps/
packages/
artifacts/
data/
```

---

## Apps

### `apps/studio`
Private authenticated operator interface for Harvey.

### `apps/habitat-staging`
Preview environment for staged artifacts, layout proposals, and habitat experiments.

### `apps/public-site`
Public habitat for intentionally released work.

---

## Packages

### `packages/core`
Canonical types, enums, shared interfaces, domain helpers.

### `packages/agent`
Runtime orchestration, session flow, provider adapters, generation calls.

### `packages/memory`
Memory creation, archive logic, return logic, lineage helpers.

### `packages/evaluation`
Critique processing, evaluation signal logic, judgment helpers.

### `packages/ui`
Shared UI components and surface primitives.

---

## Docs

### `docs/01_foundation`
Constitution, glossary, ontology, data model.

### `docs/02_runtime`
System architecture, creative state, session loop, runtime stack, memory, lineage, archive, judgment flow.

### `docs/03_governance`
Self critique, evaluation signals, approval rules, intervention rules, versioning, runtime invariants, approval lanes.

### `docs/04_product`
Product overview, MVP scope, Studio, source ingestion, staging habitat, public habitat, release archive, surface release model.

### `docs/05_build`
Build architecture, scaffold contract, vertical slice, scaffolding plan, seed ingestion, mind test spec. **Implementation Checklist** (`IMPLEMENTATION_CHECKLIST.md`) — run before changing routes, proposal contracts, snapshot logic, governance, staging/public paths, or promotion.

### `docs/agents`
Repo context and coding-agent instructions.

---

## Artifacts

```text
artifacts/
  drafts/
  archived/
  published/
```

Artifacts may also be stored in object storage. This folder is only the repo-level conceptual shape.

---

## Data

```text
data/
  migrations/
  seeds/
  logs/
```

Database migrations and seeds live here. Runtime logs or exported debug traces may also live here when helpful.

---

## Important Note

This map is descriptive, not canonical by itself.

If it conflicts with:
- `docs/00_start_here.md`
- `docs/01_foundation/data_model.md`
- `docs/05_build/phase_4_build_contract.md`

those files win.
