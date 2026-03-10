# Database backup and wipe

## 1. Save the database (backup)

From the repo root:

```bash
pnpm db:backup
```

- Writes timestamped SQL files to **`backups/`**:
  - `dump-YYYYMMDD-HHMMSS-schema.sql` — schema only
  - `dump-YYYYMMDD-HHMMSS-data.sql` — data only (COPY format)
- Uses the **linked** Supabase project (run `supabase link` first if you haven’t).
- For a direct connection string instead of link, set **`DATABASE_URL`** or **`SUPABASE_DB_URL`** (e.g. from Supabase Dashboard → Settings → Database → Connection string, Session mode).

The `backups/` folder is in `.gitignore`; don’t commit dumps.

---

## 2. Wipe the database

**Local Supabase (Docker):**

```bash
pnpm db:wipe
```

(or `pnpm db:reset`). Drops the local DB and reapplies all migrations from `supabase/migrations`.

**Remote (linked) Supabase:**

```bash
pnpm db:wipe:linked
```

Drops all user-created objects in the **linked** project and reapplies local migrations. Run **`pnpm db:backup`** first if you want to keep a copy.

---

## Order of operations

1. **Backup:** `pnpm db:backup`
2. **Wipe:** `pnpm db:wipe` (local) or `pnpm db:wipe:linked` (remote)
