#!/usr/bin/env node
/**
 * Save database to timestamped SQL files (schema + data).
 *
 * - If DATABASE_URL or SUPABASE_DB_URL is set: uses system pg_dump (no Docker).
 *   Requires PostgreSQL client tools (pg_dump) in PATH.
 * - Otherwise: uses Supabase CLI (supabase db dump), which requires Docker.
 *
 * Output: backups/dump-YYYYMMDD-HHMMSS-schema.sql, ...-data.sql
 */
const { execSync, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const cwd = process.cwd();
const backupDir = path.join(cwd, "backups");
const ts = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
const schemaFile = path.join(backupDir, `dump-${ts}-schema.sql`);
const dataFile = path.join(backupDir, `dump-${ts}-data.sql`);

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

function runSupabaseDump() {
  const dbUrlFlag = dbUrl ? `--db-url "${dbUrl}"` : "";
  const run = (cmd) => execSync(cmd, { stdio: "inherit", shell: true, cwd });
  console.log("Backing up schema...");
  run(`pnpm exec supabase db dump -f "${schemaFile}" ${dbUrlFlag}`.trim());
  console.log("Backing up data...");
  run(`pnpm exec supabase db dump -f "${dataFile}" --data-only --use-copy ${dbUrlFlag}`.trim());
}

function runPgDump() {
  // Use system pg_dump so we don't need Docker (URL passed as arg, no shell escaping)
  const run = (args) => execFileSync("pg_dump", [...args, dbUrl], { stdio: "inherit", cwd });
  console.log("Backing up schema (pg_dump)...");
  run(["--schema-only", "-f", schemaFile]);
  console.log("Backing up data (pg_dump)...");
  run(["--data-only", "-f", dataFile]);
}

if (dbUrl) {
  runPgDump();
} else {
  runSupabaseDump();
}

console.log("Done. Saved to:", schemaFile, dataFile);
