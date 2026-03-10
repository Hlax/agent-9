# Deploy readiness (launch-safe)

Minimal launch-safe fixes applied. What is safe for production, what is deferred, and exact production env vars.

---

## What is now launch-safe

- **Token hard stop** — Session run returns 400 and does not persist when `tokens_used` exceeds `MAX_TOKENS_PER_SESSION`. No artifact/session/critique/state written.
- **LOW_TOKEN_THRESHOLD** — When `tokens_used_today` (in `runtime_config`) ≥ `LOW_TOKEN_THRESHOLD`, the cron route auto-sets runtime mode to `slow` before triggering a run. Daily reset via `tokens_reset_at`.
- **Health check** — `GET /api/health` returns 200 with `{ ok, db }` when app is up; 503 if DB is configured but unreachable.
- **Staging/public error handling** — Public-site and habitat-staging show an explicit error message when the Studio API fetch fails (e.g. "Unable to load: …") instead of failing silently.
- **Publish staging gate** — `POST /api/artifacts/[id]/publish` requires that if the artifact has any linked `proposal_record` rows, at least one has `proposal_state` in `approved_for_staging`, `staged`, `approved_for_publication`, or `published`. Otherwise 400.
- **Minimal tests** — `writeChangeRecord` (approve → change_record), `passesStagingGate` (publish gate), cron auth (401 without/wrong secret, 200 with correct), stop-limits (`isOverTokenLimit`, `getLowTokenThreshold`).
- **Canon** — `docs/02_runtime/concept_to_proposal_flow.md` §6.1 documents lane_type/target_type mapping (surface_proposal → `lane_type=surface`, system_proposal → `lane_type=system`, canon_proposal → system + target_type; change_record on approve).

---

## What remains deferred

- **Metabolism in scheduler** — Scheduler uses only mode interval and token threshold; no creative_drive / energy / reflection_pressure inputs. No scope expansion for launch.
- **Governance log UI** — No Studio page that lists `change_record`. Auditable in DB only.
- **Staging build state** — Habitat-staging "Build state" and "Before/after" panels still mock; not wired to real build/deploy.
- **Deployment gates beyond publish** — No code-level gates that block publish by branch or release; process-only.
- **ideaThreadId in pipeline** — Selected idea thread is not passed into generation context; project only.

---

## Production env vars (exact)

**Studio (`apps/studio`)**

| Variable | Required | Example / note |
|----------|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (if using DB) | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes (if using DB) | From Supabase dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (if using DB) | From Supabase dashboard |
| `OPENAI_API_KEY` | Yes (for sessions) | Your OpenAI key |
| `MAX_ARTIFACTS_PER_SESSION` | No | Default 1 |
| `MAX_TOKENS_PER_SESSION` | No | Default 0 (no limit). Set e.g. `5000` for hard cap. |
| `REPETITION_WINDOW` | No | Default 5 |
| `LOW_TOKEN_THRESHOLD` | No | Default 0. Set e.g. `50000` so when tokens_used_today ≥ 50k, mode → slow. |
| `CRON_SECRET` | Yes (if using cron) | Strong random secret; cron calls use header `x-cron-secret`. |
| `APP_URL` | Yes (if using cron) | Public base URL of Studio, e.g. `https://studio.example.com` (no trailing slash). |
| `RUNTIME_MODE` | No | Default `default`. Overridden by DB `runtime_config.mode` when set. |
| `ALWAYS_ON_ENABLED` | No | Default `false`. Overridden by DB `runtime_config.always_on`. |

**Public site (`apps/public-site`)**

| Variable | Required | Example / note |
|----------|----------|-----------------|
| `NEXT_PUBLIC_STUDIO_URL` | Yes (to show artifacts) | `https://studio.example.com` (no trailing slash). |

**Habitat-staging (`apps/habitat-staging`)**

| Variable | Required | Example / note |
|----------|----------|-----------------|
| `NEXT_PUBLIC_STUDIO_URL` | Yes (to show proposals) | `https://studio.example.com` (no trailing slash). |

---

## Health and cron

- **Liveness:** `GET {Studio}/api/health` → 200 and `db: "ok"` or `"not_configured"` when healthy; 503 when DB is configured but unreachable.
- **Cron:** Call `GET {Studio}/api/cron/session` with header `x-cron-secret: <CRON_SECRET>` on an interval (e.g. every 1–5 minutes). When `always_on` is true and interval has elapsed, a session run is triggered.
