# Phase 4 Build Contract

This document is the practical source of truth for the first scaffold build.

Coding agents should follow this file when implementation details are ambiguous.
If a conflict appears between this document and canonical ontology/governance docs, preserve canon and ask for a scoped implementation decision rather than inventing architecture.

---

## 1. Build Goal

The first scaffold build should prove that the Twin can:

- authenticate into a private Studio
- start a creative session
- generate at least one artifact
- store critique and evaluation results
- store memory and thread association
- enter human review
- allow Harvey to approve, annotate, archive, reject, or mark approved_for_publication
- optionally publish an approved artifact
- deploy a public habitat that may initially display only **Hello Twin!**

The purpose of Phase 4 is not full autonomy.
The purpose is to establish a governed creative system scaffold that can safely evolve.

---

## 2. Locked V1 Stack

Use the following stack for V1 scaffold work:

- **Monorepo:** TypeScript
- **Framework:** Next.js
- **Database:** Supabase Postgres
- **Auth:** Supabase Auth
- **Storage:** Supabase Storage
- **Deployment:** Vercel
- **Generation Brain:** GPT first
- **Image Tool Adapter:** Krea second
- **Optional Later Tooling:** Python workers only when specifically required

Do not split the scaffold into multiple languages or services unless explicitly instructed.
Do not introduce LangGraph, background orchestration frameworks, or distributed job systems in the first scaffold.

---

## 3. Required Apps

Create these applications:

### `apps/studio`
Private authenticated operator interface.

### `apps/habitat-staging`
Preview environment for staged artifacts, layout proposals, and habitat experiments.

### `apps/public-site`
Public habitat.
Initial acceptable deployment is a blank white page with large text saying **Hello Twin!**.

---

## 4. Required Packages

Create these shared packages:

### `packages/core`
Canonical types, enums, domain helpers, shared interfaces.

### `packages/agent`
Runtime orchestration, session flow, provider adapters, generation calls.

### `packages/memory`
Memory creation, archive logic, thread helpers, return logic stubs.

### `packages/evaluation`
Critique handling, evaluation signal logic, judgment helpers.

### `packages/ui`
Shared UI components and surface primitives.

---

## 5. Required First Database Tables

The first migrations should include only the minimum tables needed for the end-to-end scaffold:

- `identity`
- `project`
- `creative_session`
- `creative_state_snapshot`
- `idea`
- `idea_thread`
- `artifact`
- `generation_run`
- `critique_record`
- `evaluation_signal`
- `approval_record`
- `publication_record`
- `proposal_record`
- `memory_record`
- `source_item`
- `archive_entry`
- `change_record`

For V1, `approval_record` may remain artifact-lane-specific.
Use `proposal_record` for surface and system review objects rather than forcing all review into one artifact-shaped record.
Do not over-normalize before the first vertical slice works.
Add joins only where required for actual runtime behavior.

---

## 6. Locked V1 Artifact Support

The runtime should support these artifact mediums first:

- `writing`
- `image`
- `concept`

Schema may remain open to:

- `audio`
- `video`

But audio/video do not need real generation support in the first scaffold.

---

## 7. Runtime Scope

The runtime must be able to:

1. create a session
2. load context
3. select a mode
4. generate one artifact
5. create one critique record
6. create one evaluation signal record
7. update memory
8. link the artifact to an idea or thread when possible
9. place the artifact into pending review

The runtime should be **observable, auditable, and replay-friendly**.
It does not need fake determinism.

---

## 8. Governance Rules That Must Be Enforced in Code

These are implementation rules, not just documentation notes:

- critique does not write approval state
- evaluation does not write approval state
- approval does not equal publication
- `approved_for_publication` does not equal `published`
- rejected is not delete
- archived is not delete
- public habitat reads only published artifacts
- staging habitat does not imply publication
- system changes require Harvey approval before adoption
- habitat changes require staged review before public promotion

---

## 9. Approval and Publication Model

### Approval states

Use these human-facing states:

- `pending_review`
- `approved`
- `approved_with_annotation`
- `needs_revision`
- `rejected`
- `archived`
- `approved_for_publication`

### Publication states

Use these release-facing states:

- `private`
- `internal_only`
- `scheduled`
- `published`

Never collapse the two.

---

## 10. Three Approval Lanes

The scaffold must preserve three separate kinds of review:

### Artifact lane
For generated writing, image, and concept artifacts.

### Surface lane
For staging habitat layouts, collections, interface proposals, and public habitat release candidates.

### System lane
For runtime changes, workflow changes, evaluation changes, memory logic changes, or coding-agent implementation proposals.

A decision in one lane must not silently apply to another lane.

---

## 11. Surface Release Rule

A public habitat change is not the same as artifact publication.

For habitat and staging work, use this flow:

1. Twin proposes a surface or habitat concept
2. Harvey approves it for staging
3. Cursor or a human implements it in `apps/habitat-staging`
4. Harvey reviews the staging result
5. Harvey approves the release candidate for public promotion
6. Human merge/deploy promotes it to `apps/public-site`

Do not auto-publish staging changes.
Do not allow the Twin to modify production habitat directly.

---

## 12. What Is Mocked in the First Scaffold

The first scaffold may use thin or mocked implementations for:

- identity naming proposals
- avatar generation proposals
- Krea adapter internals
- return session automation
- archive resurfacing heuristics
- mind test execution
- staging layout generation

But the system must still preserve the correct interfaces and records.

---

## 13. What Not to Build Yet

Do not build these in the first scaffold:

- autonomous self-rewriting
- unattended scheduled sessions
- visitor analytics-driven learning
- distributed runtime services
- generalized plugin marketplaces
- production-grade automated training pipelines
- audio/video generation pipeline
- silent policy or schema evolution

---

## 14. Required Studio Controls for V1

Studio must allow Harvey to:

- sign in
- start a session
- view recent sessions
- review artifacts
- read critique and evaluation
- annotate artifacts
- approve, reject, revise, or archive artifacts
- mark artifacts approved_for_publication
- publish approved artifacts
- review source items
- review staging proposals
- review system proposals

---

## 15. First Deployment Outcome

The first successful deployment should include:

- working Studio shell
- working Supabase connection
- one successful session run
- one stored artifact with review metadata
- one public habitat deployed to Vercel
- the public habitat may initially display only **Hello Twin!**

That is a valid success state.

---

## 16. Agent Behavior Rule

When uncertain, coding agents should:

- implement the thinner version
- preserve canonical names
- leave explicit TODO notes
- avoid inventing architecture
- avoid adding new entities unless required
- prefer staged extensibility over speculative abstraction
