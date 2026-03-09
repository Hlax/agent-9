# Scaffolding Plan

This document defines the practical implementation order for the first Twin scaffold.

It is intentionally execution-focused.
It should help Harvey and Cursor move from documentation into a working system
without inventing architecture along the way.

---

# 1. Objective

The first scaffold should prove that the Twin can exist as a governed system,
not just as a set of concepts.

By the end of the first scaffold milestone, the repo should support:

- authenticated Studio access
- one runtime session flow
- one stored artifact
- critique and evaluation storage
- memory / lineage wiring
- review state transitions
- publication state transitions
- a deployed Public Habitat

The Public Habitat may initially be a minimal white page with:

**Hello Twin!**

---

# 2. Locked V1 Stack

Use this stack unless Harvey explicitly changes it:

- TypeScript monorepo
- Next.js apps
- Supabase for Postgres, auth, and storage
- Vercel for deployment
- one TypeScript runtime/orchestration layer
- GPT for early writing/concept generation
- provider adapter pattern for image generation

Do not introduce extra services, distributed workers, or a separate Python operator layer in the first scaffold unless a real implementation need appears.

---

# 3. Repo Initialization

## Step 1
Create the fresh repository.

## Step 2
Create the intended top-level structure:

```text
apps/
packages/
docs/
artifacts/
data/
```

## Step 3
Add the numbered docs folders and `docs/agents/`.

## Step 4
Copy in the canonical markdown files.

## Step 5
Add the build/handoff docs before serious coding begins.

---

# 4. Documentation Setup Order

Before writing application code:

1. confirm the canonical doc structure
2. add `README.md`
3. add `docs/00_start_here.md`
4. add build contract and handoff docs
5. patch any approval/publication wording drift

Only after the repo docs are coherent should Cursor begin scaffolding code.

---

# 5. Phase A — Core App and Package Shells

Create these apps:

- `apps/studio`
- `apps/habitat-staging`
- `apps/public-site`

Create these packages:

- `packages/core`
- `packages/agent`
- `packages/memory`
- `packages/evaluation`
- `packages/ui`

Create a shared TypeScript workspace configuration.

Goal of this phase:
- the monorepo runs
- apps can boot
- packages can be imported
- deployment targets are clear

---

# 6. Phase B — Supabase Foundation

Initialize Supabase and define first migrations.

Minimum early entities should support:

- identity
- project
- creative_session
- artifact
- critique_record
- evaluation_signal
- approval_record or equivalent approval transition storage
- memory_record
- idea_thread
- source_item

Keep the schema lean.
Do not normalize everything on day one.
Preserve canonical names wherever practical.

Goal of this phase:
- working local/dev database
- first migrations exist
- core tables reflect canon

---

# 7. Phase C — Runtime Vertical Slice

Implement the first session path.

Minimum runtime flow:

1. start session
2. load context
3. generate artifact
4. run self critique
5. compute evaluation
6. store records
7. associate to thread or project
8. mark artifact pending review

At first, one artifact per session is enough.

Goal of this phase:
- one complete session can run end-to-end
- outputs are stored and traceable

---

# 8. Phase D — Studio Shell

Build the private Studio first.

Minimum Studio capabilities:

- authenticated access
- session trigger
- artifact review queue
- artifact detail view
- source upload panel
- basic project selector
- basic idea thread visibility

Required review actions:

- approve
- approve_with_annotation
- needs_revision
- reject
- archive
- approve_for_publication
- publish

Goal of this phase:
- Harvey can actually operate the system
- governance exists before public polish

---

# 9. Phase E — Staging and Public Surface Shells

## Habitat Staging
Create a minimal preview environment.
It may begin as a simple shell that can later display staged artifacts or habitat concepts.

## Public Habitat
Deploy a minimal public site.
For the first scaffold milestone, it may simply show:

**Hello Twin!**

Goal of this phase:
- public deployment works
- staging exists as a distinct environment
- staging and public are not conflated

---

# 10. Phase F — Review and Release Safety

Before richer behavior is added, enforce these rules:

- approval is not publication
- staging is not public release
- critique is not evaluation
- evaluation is not approval
- archive is not deletion
- rejection is not deletion

Also preserve review history.
Do not only store final labels.

Goal of this phase:
- the system is structurally safe before it gets more complex

---

# 11. Phase G — First Identity Seed Readiness

After the scaffold works, prepare for the first identity-shaping inputs.

This includes:

- source ingestion structure
- project setup for identity formation
- first upload flow for text/images/references
- early tagging or classification support
- storage paths for raw and processed inputs

Do not confuse this with full autonomous training.
This phase is about readiness for guided identity seeding.

---

# 12. Explicit Non-Goals for the First Scaffold

Do not try to complete these in the first scaffold:

- autonomous self-rewriting
- distributed runtime
- advanced analytics
- visitor-signal-based identity shaping
- full multimodal sprawl
- automated training pipelines
- self-authorized production code changes

Those can be proposed later, but they should not block the first real system.

---

# 13. Definition of Scaffold Success

The first scaffold is successful when:

- the repo is clean and navigable
- apps and packages exist
- Supabase is connected
- one session can run
- one artifact can be reviewed in Studio
- state transitions exist
- staging and public shells exist
- the Public Habitat deploys successfully

At that point, the Twin is no longer only a design concept.
It becomes a governed platform ready for identity formation work.

---

# 14. Recommended Next Step After Scaffold Success

Once the scaffold milestone is complete, the next planning docs should guide:

- identity seed ingestion
- mind test design
- first naming session
- first avatar / habitat concept proposal
- first staged release candidate

That is the point where the Twin begins to feel alive.
