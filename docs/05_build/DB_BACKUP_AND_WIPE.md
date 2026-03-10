# Database backup and wipe

## 1. Save the database (backup)

From the repo root:

```bash
pnpm db:backup
```

- Writes timestamped SQL files to **`backups/`**:
  - `dump-YYYYMMDD-HHMMSS-schema.sql` — schema only
  - `dump-YYYYMMDD-HHMMSS-data.sql` — data only

**Two modes:**

| Mode | When | Requires |
|------|------|----------|
| **pg_dump** | `DATABASE_URL` or `SUPABASE_DB_URL` is set | PostgreSQL client tools (`pg_dump`) in PATH — no Docker |
| **Supabase CLI** | Neither env is set | Linked project (`supabase link`) and **Docker** (CLI runs pg_dump in a container) |

**Recommended on Windows (no Docker):** set **`DATABASE_URL`** from Supabase Dashboard → Settings → Database → **Connection string** (Session mode, copy the URI). Install [PostgreSQL](https://www.postgresql.org/download/windows/) so `pg_dump` is in PATH, or use the “Command Line Tools” build. Then run `pnpm db:backup`.

The `backups/` folder is in `.gitignore`; don’t commit dumps.

---

## 2. Wipe the database

**Local Supabase (Docker):**

```bash
pnpm db:wipe
```

(or `pnpm db:reset`). Drops the local DB and reapplies all migrations from `supabase/migrations`.

**Remote Supabase (two options):**

| Command | Requires | Notes |
|--------|----------|--------|
| `pnpm db:wipe:remote` | `DATABASE_URL` or `SUPABASE_DB_URL` + **psql** in PATH | No Docker. Drops all tables in `public`, then reapplies migrations. |
| `pnpm db:wipe:linked` | `supabase link` (and may need Docker) | Supabase CLI reset. |

Recommended when you don’t use Docker: set **`DATABASE_URL`** (from Supabase Dashboard → Database → Connection string), ensure **psql** is in PATH (same as for backup), then run:

```bash
pnpm db:wipe:remote
```

Run **`pnpm db:backup`** first if you want to keep a copy.

---

## Order of operations

1. **Backup:** `pnpm db:backup`
2. **Wipe:** `pnpm db:wipe` (local) or `pnpm db:wipe:linked` (remote)
