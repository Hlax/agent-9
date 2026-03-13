# Implementation Checklist

**Purpose:** Pre-implementation filter so new work lands in the correct module, respects existing contracts, and does not accidentally break public truth or governance boundaries.

**Use this checklist before implementing any feature, route, schema change, or agent task.**

---

## Twin Operating Model

The checklist does more than guard code—it defines the **Twin Operating Model**. The architecture is:

| Layer | Module | Role |
| ----- | ------ | ----- |
| **Detection** | Runtime | Evaluate state, suggest change |
| **Decision** | Governance | Validate legality, allow or block transitions |
| **Composition** | Staging | Organize candidates for review |
| **History** | Promotion | Turn approved state into immutable snapshots |
| **Serving** | Public Snapshot | Serve the latest approved state |

That's a clean AI system architecture: detect → decide → compose → record → serve. No stage should skip or bypass the next.

**Twin System Flow**

```
Runtime (detect change)
      ↓
Proposal (suggest change)
      ↓
Governance (validate legality)
      ↓
Staging (compose candidate state)
      ↓
Promotion (record immutable snapshot)
      ↓
Public Snapshot (serve twin)
```

---

## 1. Ownership Check

**First ask:** What is this feature actually doing?

If it is about:

- **detecting or suggesting a change** → **Runtime**
- **deciding whether a proposal can legally move states** → **Governance**
- **organizing candidate changes for reviewers** → **Staging**
- **turning approved candidate state into immutable public history** → **Promotion**
- **serving the current public twin** → **Public**

If the answer spans multiple modules, split the work by module boundary.

---

## 2. Contract Check

Before changing code, ask:

- Does this feature change the proposal contract?
- Does it change the snapshot payload shape?
- Does it change proposal states or transitions?
- Does it change identity or snapshot lineage assumptions?
- Does it change which table is considered canonical truth?

**If yes,** update the relevant architecture doc before or alongside implementation.

---

## 3. Public Truth Check

Ask:

- Does this feature affect what the public twin shows?
- If yes, is the public read path still snapshot-backed?
- Am I accidentally reading from staging, proposal, or projection tables?
- Am I introducing a second source of truth?

**Rule:** Public truth must resolve from the latest approved `habitat_snapshot`, not from staging or proposal state.

**Public Read Path Rule**

Public consumers must read from:

- `habitat_snapshot` → resolved as latest approved snapshot

They must **not** read from:

- staging tables
- proposal tables
- runtime tables

*Why? Many engineers accidentally wire UI directly to staging.*

---

## 4. Governance Check

Ask:

- Does this feature trigger a proposal state change?
- If yes, is the transition validated by canonical governance helpers?
- Am I hardcoding legal actions in the UI?
- Am I bypassing `canTransitionProposalState` or equivalent FSM logic?

**Rule:** UI and convenience APIs may surface actions, but governance decides legality.

---

## 5. Runtime Safety Check

Ask:

- Is runtime directly mutating staging or public state?
- Is runtime assigning final/governance-owned states?
- Is runtime inserting only reviewable proposals?

**Rule:** Runtime may create proposals in `pending_review`; it may not approve, publish, or snapshot.

---

## 6. Agent Authority Check

Ask:

- Is the agent allowed to perform this action?
- Is this action human-gated?
- Does the agent only produce proposals?

**Rule:** Agents may propose change, but only governance and promotion define truth.

This reinforces the human-in-the-loop boundary.

---

## 7. Staging Boundary Check

Ask:

- Is this feature organizing candidate state, or redefining truth?
- Is staging still mutable candidate composition only?
- Am I accidentally making staging a public source?

**Rule:** Staging may organize, preview, and compose candidate state; it may not define public truth.

---

## 8. Promotion Check

Ask:

- Does this feature publish anything?
- If yes, does it go through the canonical promotion path?
- Does it create a new snapshot rather than mutating an old one?
- Does it preserve proposal → published transition semantics?

**Rule:** Promotion creates history. It never edits existing public history.

**Promotion must create a new immutable snapshot row. Existing snapshots are never modified.**

---

## 9. Projection Check

Ask:

- Am I touching a projection or compatibility table?
- If yes, am I mistakenly treating it as canonical?
- Is this table read anywhere critical?

**Rule:** Projection tables may exist for compatibility, but they are not authoritative unless explicitly documented as such.

---

## 10. Schema Change Check

Schema changes are among the most dangerous in this architecture.

If this change modifies:

- `habitat_snapshot`
- `proposal_record` (or habitat proposal schema)
- snapshot lineage fields
- proposal FSM states

Then:

- architecture docs must update
- migrations must be reviewed
- tests must confirm compatibility

---

## 11. Test Check

Before considering the work done, ask:

- What contract did this feature touch?
- Is there a unit test for that contract?
- If behavior crosses module boundaries, is there an integration-style test?
- Did I preserve existing staging/public/governance invariants?

**Minimum expectation:**

- new helper → unit test
- new route behavior → route or behavior test where practical
- contract change → update tests + docs

---

## 12. Documentation Check

Ask:

- Does this feature change architecture or just implementation details?
- If architecture changed, which doc must be updated?

**Typical doc targets:**

- Runtime Proposal Lifecycle
- Proposal Contract & Trigger Matrix
- Identity & Snapshot Lineage Model
- Governance / FSM Boundary
- **Staging Pipeline MVP Closure** — `docs/04_product/staging_pipeline_mvp_closure.md`
- Twin System Architecture Map
- Twin System Responsibility Matrix

**Rule:** If the architecture changed, the docs should not lag behind the code.

---

## 13. Module Boundary Check

The system is modular. A common mistake is modules importing or calling logic from the wrong layer.

Ask:

- Is Runtime calling Governance helpers directly (beyond submitting proposals)?
- Is Staging modifying snapshot records?
- Is Promotion depending on staging projections for truth?
- Am I depending upstream instead of downstream?

**Rule:** Modules may depend downstream, not upstream.

Allowed direction:

```
Runtime
   ↓
Governance
   ↓
Staging
   ↓
Promotion
   ↓
Public
```

---

## 14. Data Flow Check

Confirm the change respects the system pipeline:

**Runtime → Proposal → Governance → Staging → Promotion → Public Snapshot**

No stage should skip or bypass the next.

**Example violations:**

- Runtime → Staging (runtime must not write staging directly)
- Runtime → Snapshot (runtime may not create public history)
- Proposal → Public (proposals never serve public; only snapshots do)

This keeps the system flow explicit.

---

## 15. Final Go / No-Go Gate

Before merging or accepting the work, confirm:

- [ ] correct module ownership
- [ ] no new source of public truth
- [ ] no governance bypass
- [ ] no runtime direct mutation of public/staging truth
- [ ] tests pass
- [ ] relevant docs updated if contracts changed

**If any of those fail, stop and fix the boundary first.**

---

## Short Version

1. Who owns this?
2. Does it change a contract?
3. Does it affect public truth? (Public reads from snapshot only.)
4. Does it bypass governance?
5. Does runtime stay proposal-only?
6. Is the agent only proposing (human-gated)?
7. Does staging stay candidate-only?
8. Does promotion create a new snapshot row (never mutate existing)?
9. Am I treating a projection as canonical?
10. If schema changed: docs + migrations + compatibility tests?
11. Did I test the touched contract?
12. Did I update docs if architecture changed?
13. Am I depending downstream, not upstream?
14. Does data flow follow Runtime → Proposal → Governance → Staging → Promotion → Public (no skips)?

---

## Adoption

- **Required reading before:** new routes, new proposal states, snapshot changes, staging/public read-path changes.
- **Agent prompts:** Before coding, run the checklist; identify owning module; call out contract changes; confirm no public-truth or governance-boundary violations.
- **High-risk changes** (proposal contract, FSM, snapshot payload, public read path, staging/public crossover, promotion, schema changes to snapshot/proposal/lineage/FSM, cross-module dependencies): require checklist review, doc update if needed, and explicit test coverage.

See also: `docs/00_start_here.md`, `docs/04_product/staging_pipeline_mvp_closure.md`.
