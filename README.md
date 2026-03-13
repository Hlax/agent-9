# Digital Twin

A governed creative system that explores identity through artifacts over time.

## Intent

This repo is the **scaffolding and deployment foundation** for the Twin. The **Twin** (the agent/system in this repo) generates, critiques, evaluates, remembers, and proposes. **Harvey** (the human operator) reviews, approves, stages, and publishes. Nothing reaches the public without going through staging and explicit approval. The intent is a clear split: the Twin suggests; Harvey decides.

## Product Surfaces

- **Private Studio** — where Harvey operates: review proposals by lane, preview staged habitat before publish, and approve or reject.
- **Staging** — where candidate habitat and artifacts live until Harvey promotes them.
- **Public Habitat** — the curated public face of the Twin; only content Harvey has approved for publication appears there.

## Core System Layers

- Foundation / ontology
- Runtime
- Governance
- Product surfaces
- Build and scaffolding

## Recommended Read Order

Start here:

- `docs/00_start_here.md`

Then move through:

1. `docs/01_foundation/`
2. `docs/02_runtime/`
3. `docs/03_governance/`
4. `docs/04_product/`
5. `docs/05_build/`
6. `docs/agents/`

## Suggested Stack for V1

- TypeScript monorepo
- Next.js apps
- Supabase for Postgres, auth, and storage
- Vercel for deployment
- One TypeScript runtime/orchestration layer for V1
- GPT for early runtime generation
- Provider adapter pattern for image tooling

## First Scaffold Success

The first scaffold milestone is successful when:

- Studio auth works
- one session can run
- one artifact can be generated and stored
- critique and evaluation records are stored
- memory/lineage wiring exists
- review and publication state transitions work
- the Public Habitat deploys successfully

The Public Habitat may initially be a blank white page with a large:

**Hello Twin!**

## Important Principle

Approval and publication are not the same thing. Staging and public release are not the same thing. System proposals and implementation changes still require Harvey approval.

---

## V1 Scaffold Layout

```
apps/
  studio/           # Private operator interface (Next.js)
  habitat-staging/  # Staging preview (Next.js)
  public-site/      # Public habitat — minimal shell "Hello Twin!" (Next.js)
packages/
  core/             # Canonical enums, types, domain models
  agent/            # Session pipeline, provenance stubs
  memory/           # Archive, memory-record helpers
  evaluation/       # Critique, evaluation-signal stubs
  ui/               # Shared UI primitives
supabase/
  migrations/       # Postgres schema (enums + core tables)
data/
  migrations/       # (reserved)
  seeds/
  logs/
artifacts/
  drafts/
  archived/
  published/
```

### Prerequisites

- **Supabase CLI** — required for all `db:*` scripts (migrate, generate, reset, verify). It is installed as a project dev dependency; run `pnpm install` and use the scripts below. To install the CLI globally or via another method, see [Install the Supabase CLI](https://supabase.com/docs/guides/cli/getting-started).

### Commands (pnpm)

- `pnpm install` — install dependencies (includes Supabase CLI for `db:*` scripts)
- `pnpm build` — build all packages and apps
- `pnpm dev:studio` — Studio at http://localhost:3000
- `pnpm dev:staging` — Staging at http://localhost:3001
- `pnpm dev:public` — Public site at http://localhost:3002
- `pnpm db:generate` — generate TypeScript types from local schema into `packages/core/src/db-types.ts` (requires `supabase start`)
- `pnpm db:migrate` — apply Supabase migrations (requires Supabase CLI and local Supabase)
- `pnpm db:reset` — reset local DB and reapply all migrations (verifies migrations apply cleanly)
- `pnpm db:verify` — same as `db:reset` (alias for migration verification)
- `pnpm test` — run tests across packages and apps

### Studio (for Harvey)

Studio is the operator interface: review proposals by lane (habitat, artifacts, critiques, extensions, system), add notes and take actions, preview staged habitat before publish, then approve for publication when ready. Implementation details live in `docs/`; the staging pipeline is documented in `docs/04_product/staging_pipeline_mvp_closure.md`.
