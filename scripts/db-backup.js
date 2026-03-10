#!/usr/bin/env node
/**
 * Save database to timestamped SQL files (schema + data).
 * Uses linked Supabase project, or DATABASE_URL / SUPABASE_DB_URL if set.
 * Output: backups/dump-YYYYMMDD-HHMMSS-schema.sql, ...-data.sql
 */
const { execSync } = require("child_process");
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
const dbUrlFlag = dbUrl ? `--db-url "${dbUrl}"` : "";

function run(cmd) {
  execSync(cmd, { stdio: "inherit", shell: true, cwd });
}

console.log("Backing up schema...");
run(`pnpm exec supabase db dump -f "${schemaFile}" ${dbUrlFlag}`.trim());
console.log("Backing up data...");
run(`pnpm exec supabase db dump -f "${dataFile}" --data-only --use-copy ${dbUrlFlag}`.trim());
console.log("Done. Saved to:", schemaFile, dataFile);
