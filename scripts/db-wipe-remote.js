#!/usr/bin/env node
/**
 * Remote wipe without Docker: drops all tables in public schema, then reapplies
 * migrations. Requires DATABASE_URL or SUPABASE_DB_URL and psql in PATH.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const cwd = process.cwd();
const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error("Set DATABASE_URL or SUPABASE_DB_URL (e.g. from Supabase Dashboard → Database → Connection string).");
  process.exit(1);
}

// Find migrations (repo root may be cwd or parent)
const migrationsDir =
  fs.existsSync(path.join(cwd, "supabase", "migrations"))
    ? path.join(cwd, "supabase", "migrations")
    : path.join(cwd, "..", "supabase", "migrations");

if (!fs.existsSync(migrationsDir)) {
  console.error("Migrations folder not found at supabase/migrations.");
  process.exit(1);
}

const run = (args) =>
  execFileSync("psql", [...args, dbUrl], { stdio: "inherit", cwd });

// 1) Drop all tables and user types in public schema (so migrations can recreate enums etc.)
const dropSql = `
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
  FOR r IN (SELECT typname FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = 'public' AND t.typtype IN ('e','c','d')) LOOP
    EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
  END LOOP;
END $$;
`;
const dropFile = path.join(cwd, "scripts", ".wipe-drop-public.sql");
fs.writeFileSync(dropFile, dropSql, "utf8");
try {
  console.log("Dropping all tables in public schema...");
  run(["-v", "ON_ERROR_STOP=1", "-f", dropFile]);
} finally {
  try { fs.unlinkSync(dropFile); } catch (_) {}
}

// 2) Reapply migrations in order
const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
console.log("Reapplying", files.length, "migrations...");
for (const f of files) {
  const full = path.join(migrationsDir, f);
  console.log("  ", f);
  run(["-v", "ON_ERROR_STOP=1", "-f", full]);
}

console.log("Remote wipe done.");
