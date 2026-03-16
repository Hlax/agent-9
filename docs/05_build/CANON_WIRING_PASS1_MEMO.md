# Canon Wiring Pass 1 — Implementation Memo

**Date:** 2026-03-16  
**Scope:** First canon integration: loader, proposal-governance refactor, compatibility shim. No review UI, patch engine, or DB migrations.

---

## What Changed

### 1. Canon files (new)

- **`canon/core/system_ontology.json`** — Object types and principles.
- **`canon/core/agent_registry.json`** — Four agents: `agent_9`, `builder_agent`, `risk_audit_agent`, `human`. Lane permissions and allowed/restricted actions per agent.
- **`canon/core/proposal_types.json`** — Ten proposal types with `primary_lane`, `auto_build_allowed`, and requirement flags.
- **`canon/core/lane_map.json`** — Five lanes: `build_lane`, `system_lane`, `canon_lane`, `audit_lane`, `promotion_lane`.
- **`canon/governance/governance_rules.json`** — Rule set (not yet used in code).
- **`canon/governance/promotion_rules.json`** — Promotion requirements (not yet used in code).
- **`canon/governance/block_conditions.json`** — Block condition list (not yet used in code).

### 2. Canon loader (new, server-only)

- **`apps/studio/lib/canon/schemas.ts`** — Zod schemas for all seven JSON files and exported types.
- **`apps/studio/lib/canon/loader.ts`** — `loadCanon(root?)`, `getCanon()`, in-memory cache, and helpers: `getProposalType()`, `getPrimaryLaneForProposalType()`, `isValidProposalType()`, `getAgent()`, `agentCanCreateProposalInLane()`.
- **`apps/studio/lib/canon/compat.ts`** — Compatibility mapping canon lane_id ↔ DB `LaneType` (`surface` | `medium` | `system`).
- **`apps/studio/lib/canon/index.ts`** — Re-exports.

Loader resolves canon root via `CANON_ROOT` or by probing `canon`, `../canon`, `../../canon` so it works from repo root or from `apps/studio` (e.g. tests).

### 3. Proposal-governance refactor

- **Lane classification**
  - **When `proposal_type` is set and present in canon:** Lane is taken from `proposal_types[].primary_lane`, then mapped to DB `LaneType` via `canonLaneToDb()`. Result includes `canon_lane_id`.
  - **When `proposal_type` is set but unknown:** `reason_codes` includes `PROPOSAL_TYPE_NOT_IN_CANON`; lane defaults to `surface`.
  - **When `proposal_type` is not set:** Existing role-based logic is unchanged (habitat_layout → surface, extension → medium, system_proposal → system, etc.).

- **Proposal creation authority**
  - **Before:** Runner was blocked from creating system proposals only (hardcoded).
  - **After:** `canCreateProposal(lane, actor)` uses `agent_registry.json`. Actor is mapped to `agent_id` (runner → `agent_9`, human → `human`, reviewer → `risk_audit_agent`). Human always allowed. For others, `agentCanCreateProposalInLane(agent_id, canon_lane_id)` is used; if the agent is missing or not allowed, result is block with `AGENT_NOT_ALLOWED_FOR_LANE`.

- **New exports:** `getAgentIdForAuthority()`, `validateProposalType()`.

- **New reason codes:** `PROPOSAL_TYPE_NOT_IN_CANON`, `AGENT_NOT_ALLOWED_FOR_LANE`. `RUNNER_SYSTEM_PROPOSAL_FORBIDDEN` is no longer used (canon allows agent_9 to create in system_lane).

### 4. Tests

- **proposal-governance.test.ts:** Runner + system now allowed (agent_9 has system_lane). Runner + medium now blocked (agent_9 has no audit_lane). New tests for canon-driven classification and `validateProposalType()`.
- **proposal-governance-closure.test.ts:** Unchanged; still passes.

---

## Compatibility Shims Added

### Lane mapping (canon → DB)

| Canon lane_id   | DB LaneType |
|-----------------|-------------|
| `build_lane`    | `surface`   |
| `system_lane`   | `system`    |
| `canon_lane`    | `system`    |
| `audit_lane`    | `medium`    |
| `promotion_lane`| `surface`   |

- **Persistence:** Callers still write and read `lane_type` as `surface` | `medium` | `system`. No DB schema change.
- **Staging/promotion:** Existing FSM still treats only `surface` as eligible for `approved_for_staging` / `staged` / `approved_for_publication` / `published`. So canon `build_lane` and `promotion_lane` (both mapped to `surface`) remain stageable; system/canon/audit stay non-stageable in the current FSM.

### Legacy classification

- If callers do **not** pass `proposal_type`, behavior is unchanged: `proposal_role` and `target_surface` drive lane (habitat_layout, avatar_candidate, extension, etc.). No change required yet in session-runner, create-proposal API, or chat route.

### Agent mapping

- `runner` → `agent_9`, `http_user` → `human`, `reviewer` → `risk_audit_agent`, `unknown` → block (no agent_id).

---

## Known Limitations

1. **Callers do not yet pass `proposal_type`.** Session-runner, create-proposal route, and proposals/chat routes still use only `proposal_role` / `requested_lane`. To use canon for classification, they must start sending `proposal_type` (e.g. `system_change`, `schema_change`, `refactor_plan`).

2. **Governance/block/promotion JSON not used.** `governance_rules.json`, `promotion_rules.json`, and `block_conditions.json` are loaded but not consulted in approve or promote logic. Blocking and promotion checks are still the existing FSM and lane guards.

3. **agent_9 cannot create medium (audit_lane) proposals.** Registry gives agent_9 only `build_lane`, `system_lane`, `canon_lane`. Extension-style work in the old “medium” lane would need either a canon proposal_type whose primary_lane is build_lane (and store as surface) or a decision to grant agent_9 audit_lane in canon.

4. **Single load, no hot reload.** Canon is cached after first load. Changing JSON on disk requires process restart (or an explicit `clearCanonCache()` and re-load in tests).

5. **Human is special-cased.** Human is allowed to create in any lane without looking up `human` in the registry. The registry does include a `human` entry for documentation; the code path skips the lookup for `actor === "human"`.

---

## Single Best Next Implementation Step

**Have session-runner and create-proposal API pass `proposal_type` when creating proposals, and persist it.**

- In **session-runner** (`manageProposals`): When creating a proposal from a concept or extension, set `proposal_type` from a small mapping (e.g. concept → `system_change` or `refactor_plan`, image/avatar → keep legacy for now, extension → `workflow_change` or a dedicated type). Call `classifyProposalLane({ proposal_type, ... })` so lane comes from canon. Persist `proposal_type` on `proposal_record` if a column exists, or in a payload field.
- In **POST /api/artifacts/[id]/create-proposal** and **POST /api/proposals**: Accept optional `proposal_type` in the body. When present, call `classifyProposalLane({ proposal_type, ... })` and validate with `validateProposalType(proposal_type)` before create.

That one step makes new proposals canon-driven end-to-end (type → lane → authority) without changing the review UI or the FSM.
