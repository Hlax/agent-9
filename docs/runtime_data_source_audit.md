# Runtime / debug data source audit

Audit of where runtime and debug surfaces read/write data, which Supabase client and env they use, and how to ensure one canonical source.

---

## 1. Data sources by surface

### Runtime debug page (`apps/studio/app/runtime/page.tsx`)

| Data | Source | Function / table |
|------|--------|-------------------|
| Current state (runtime, creative_state, active_project, active_thread, **return_candidates**) | Server: `getSupabaseServer()` → `getRuntimeStatePayload()` | `creative_state_snapshot`, `artifact`, `proposal_record`, **`archive_entry`** (count = return_candidates), `runtime_config`, `creative_session` (latest trace), `getSynthesisPressure()` (archive_entry, trajectory_review, etc.) |
| Last 10 sessions (traces) | Same → `getRuntimeTracePayload()` | `creative_session` (limit 10, order created_at desc) |
| Deliberation (ontology panel) | Same → `getRuntimeDeliberationPayload()` | `deliberation_trace` (latest 1) |
| Continuity history / health | Same → `getRuntimeContinuityPayload()` | `creative_session` (20), `deliberation_trace`, `proposal_record`, `artifact` |

- **Exact function:** `fetchRuntimeState()` in the same file calls `getRuntimeStatePayload`, `getRuntimeTracePayload`, `getRuntimeDeliberationPayload`, `getRuntimeContinuityPayload` from `@/lib/runtime-state-api`, each passed `getSupabaseServer()`.
- **Supabase client:** `getSupabaseServer()` from `@/lib/supabase-server`.

### Latest “generations” (sessions) table

- There is **no separate “generations” table UI**. Session list comes from:
  - **Runtime page:** “Last 10 sessions (traces)” from `getRuntimeTracePayload()` → `creative_session` (limit 10).
  - **Continuity history:** `getRuntimeContinuityPayload()` → `creative_session` (limit 20) + deliberation/proposal/artifact joins.
- **generation_run** is written by the session runner but not read by any UI; it is observability-only.

### Artifact tabs (`apps/studio/app/review/artifacts/page.tsx`)

| Data | Source | Table |
|------|--------|--------|
| Artifact list (queue / approved / archived) | Server: `getSupabaseServer()` | `artifact` (filtered by view/role, order created_at desc) |

- **Supabase client:** `getSupabaseServer()` from `@/lib/supabase-server`.

### Metabolism panel (client component)

| Data | Source | How |
|------|--------|-----|
| Snapshot, backlog, runtime, **return_candidates** | Client `fetch(`${window.location.origin}/api/runtime/state`)` | GET `/api/runtime/state` → `getSupabaseServer()` → `getRuntimeStatePayload()` (same as runtime page; return_candidates = archive_entry count) |

- **Supabase client (server-side):** `getSupabaseServer()` in `apps/studio/app/api/runtime/state/route.ts`.

### Cron / autogenerate session runner

| Path | File | Supabase |
|------|------|----------|
| GET `/api/cron/session` | `apps/studio/app/api/cron/session/route.ts` | `getRuntimeConfig(getSupabaseServer())`, then `runSessionInternal()` |
| POST `/api/session/run` | `apps/studio/app/api/session/run/route.ts` | `runSessionInternal()` |
| Internal runner | `apps/studio/lib/session-runner.ts` | `getSupabaseServer()` at start of `runSessionInternal()`; all writes (creative_session, artifact, generation_run, deliberation_trace, trajectory_review, etc.) use that client |

- **Supabase client:** `getSupabaseServer()` from `@/lib/supabase-server`. Same as all other surfaces.

---

## 2. Which Supabase client each surface uses

| Surface | Client | Module |
|---------|--------|--------|
| Runtime page (server) | Server Supabase | `getSupabaseServer()` → `lib/supabase-server.ts` |
| GET /api/runtime/state | Server Supabase | `getSupabaseServer()` in route |
| GET /api/runtime/trace | Server Supabase | `getSupabaseServer()` in route |
| GET /api/runtime/deliberation | Server Supabase | `getSupabaseServer()` in route |
| GET /api/runtime/continuity | Server Supabase | `getSupabaseServer()` in route |
| Review artifacts page | Server Supabase | `getSupabaseServer()` in page |
| Session runner (cron + manual) | Server Supabase | `getSupabaseServer()` in session-runner.ts |
| Other API routes (proposals, identity, etc.) | Server Supabase | `getSupabaseServer()` in each route |

- **Auth-only usage:** Some routes also use `createClient()` from `@/lib/supabase/server` (cookie-based auth). That client uses `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (same project, anon key). Data reads/writes for runtime/artifacts/sessions use **only** `getSupabaseServer()`.

---

## 3. Env vars that determine the Supabase project

| Env var | Used by | Purpose |
|---------|--------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | All (server + browser client) | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `getSupabaseServer()` only | Service role for server-side DB access |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) | `createClient()` in lib/supabase (auth) | Anon key for auth |

- **Single project:** All runtime and artifact surfaces use the **same** project: whatever `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` point to in the **process that serves the request** (e.g. local dev server, Vercel serverless).

---

## 4. Do runtime page and artifact/generation views read the same DB?

- **Yes.** They all use `getSupabaseServer()` and the same env at request time. There is no second Supabase project or alternate DB in code.
- **Writes and reads:** Session runner (cron + manual) and all read surfaces use the same `getSupabaseServer()`, so writes and reads are **not** split across different DBs in code.

---

## 5. Where a mismatch can still come from

1. **Environment split**
   - **Local:** `.env.local` (or `.env`) → one Supabase project.
   - **Vercel (prod/preview):** Project Settings → Environment Variables → can differ per environment (Production / Preview / Development). If the SQL editor is opened for **Project A** but the app is deployed with **Project B**’s env (e.g. preview branch), you’ll see different row counts and timelines.
   - **Fix:** Ensure `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the deployment (and in the env you’re testing) point to the **same** project you’re querying in the SQL editor.

2. **Next.js caching (most likely for “stale” runtime page)**
   - The runtime page is a **Server Component** with no `dynamic` or `revalidate` and no `cookies()`/`headers()` usage. Next.js can **cache the full RSC payload** (static or after first request).
   - GET `/api/runtime/state` (and other GET runtime routes) can also be cached by the framework unless marked dynamic.
   - **Symptom:** SQL editor shows e.g. 6 sessions and few archive_entry rows; runtime page still shows a long timeline and return_candidates = 72 (from an earlier cached state).
   - **Fix:** Force these to be dynamic so they always hit the DB (see below).

---

## 6. Smallest fix: one canonical source

- **Code:** All surfaces already use one client and one project; no code change is needed for “which DB.”
- **Caching:** To make runtime/debug surfaces always reflect the current DB:
  - **Runtime page:** `export const dynamic = 'force-dynamic'` in `apps/studio/app/runtime/page.tsx`.
  - **Runtime API routes:** `export const dynamic = 'force-dynamic'` in:
    - `apps/studio/app/api/runtime/state/route.ts`
    - `apps/studio/app/api/runtime/trace/route.ts`
    - `apps/studio/app/api/runtime/deliberation/route.ts`
    - `apps/studio/app/api/runtime/continuity/route.ts`
- **Env:** In each environment (local, Vercel prod, Vercel preview), set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the **same** Supabase project you use in the SQL editor when checking row counts.

After that, the runtime page, artifact tabs, metabolism panel (via API), and session runner all read/write the same canonical source with no route caching for those paths.

---

## 7. Exact files reference

| Purpose | File(s) |
|---------|--------|
| Runtime page | `apps/studio/app/runtime/page.tsx` |
| Runtime state API | `apps/studio/lib/runtime-state-api.ts` (getRuntimeStatePayload, getRuntimeTracePayload, getRuntimeDeliberationPayload, getRuntimeContinuityPayload) |
| Runtime API routes | `apps/studio/app/api/runtime/state/route.ts`, `trace/route.ts`, `deliberation/route.ts`, `continuity/route.ts` |
| Server Supabase client | `apps/studio/lib/supabase-server.ts` (`getSupabaseServer`) |
| Session runner (writes) | `apps/studio/lib/session-runner.ts` (`runSessionInternal`) |
| Cron entrypoint | `apps/studio/app/api/cron/session/route.ts` |
| Manual run | `apps/studio/app/api/session/run/route.ts` |
| Artifact review page | `apps/studio/app/review/artifacts/page.tsx` |
| Metabolism panel (client) | `apps/studio/app/components/metabolism-panel.tsx` (fetches `/api/runtime/state`) |

**return_candidates** is the **count of `archive_entry`** from `getRuntimeStatePayload()` (used by both the runtime page and GET `/api/runtime/state`).
