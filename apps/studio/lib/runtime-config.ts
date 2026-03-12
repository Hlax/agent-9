/**
 * Runtime config (scheduler mode, always-on, last run).
 * Keys: mode, always_on, last_run_at.
 */

import type { getSupabaseServer } from "@/lib/supabase-server";

type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseServer>>;

export type RuntimeMode = "slow" | "default" | "steady" | "turbo";

const VALID_MODES: RuntimeMode[] = ["slow", "default", "steady", "turbo"];

export function parseMode(value: string | null | undefined): RuntimeMode {
  if (value && VALID_MODES.includes(value as RuntimeMode)) return value as RuntimeMode;
  return "default";
}

export function parseAlwaysOn(value: string | null | undefined): boolean {
  return value === "true" || value === "1";
}

export async function getRuntimeConfig(supabase: SupabaseClient | null): Promise<{
  mode: RuntimeMode;
  always_on: boolean;
  last_run_at: string | null;
  tokens_used_today: number;
}> {
  const fallback = {
    mode: parseMode(process.env.RUNTIME_MODE),
    always_on: parseAlwaysOn(process.env.ALWAYS_ON_ENABLED),
    last_run_at: null as string | null,
    tokens_used_today: 0,
  };
  if (!supabase) return fallback;
  const { data: rows, error } = await supabase
    .from("runtime_config")
    .select("key, value")
    .in("key", ["mode", "always_on", "last_run_at", "tokens_used_today", "tokens_reset_at"]);
  if (error) return fallback;
  const map: Record<string, string | null> = {};
  for (const r of rows ?? []) {
    map[r.key] = r.value ?? null;
  }
  return {
    mode: parseMode(map["mode"] ?? process.env.RUNTIME_MODE),
    always_on: parseAlwaysOn(map["always_on"] ?? process.env.ALWAYS_ON_ENABLED),
    last_run_at: map["last_run_at"] ?? null,
    tokens_used_today: parseTokenUsage(map["tokens_used_today"], map["tokens_reset_at"]),
  };
}

function parseTokenUsage(value: string | null | undefined, resetAt: string | null | undefined): number {
  const today = new Date().toISOString().slice(0, 10);
  if (resetAt !== today) return 0;
  if (value == null || value === "") return 0;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function setRuntimeConfig(
  supabase: SupabaseClient,
  updates: { mode?: RuntimeMode; always_on?: boolean }
): Promise<void> {
  const now = new Date().toISOString();
  const rows: { key: string; value: string; updated_at: string }[] = [];
  if (updates.mode !== undefined) rows.push({ key: "mode", value: updates.mode, updated_at: now });
  if (updates.always_on !== undefined) rows.push({ key: "always_on", value: String(updates.always_on), updated_at: now });
  if (rows.length === 0) return;
  await supabase.from("runtime_config").upsert(rows, { onConflict: "key" });
}

export async function setLastRunAt(supabase: SupabaseClient, iso: string): Promise<void> {
  const { error } = await supabase
    .from("runtime_config")
    .upsert([{ key: "last_run_at", value: iso, updated_at: iso }], { onConflict: "key" });
  if (error) {
    console.warn("[runtime_config] setLastRunAt failed", { error: error.message, iso });
  }
}

/** Get tokens used today (resets when tokens_reset_at !== today). */
export async function getTokenUsage(supabase: SupabaseClient | null): Promise<number> {
  if (!supabase) return 0;
  const config = await getRuntimeConfig(supabase);
  return config.tokens_used_today;
}

/** Add tokens used and optionally reset if date changed. */
export async function addTokenUsage(supabase: SupabaseClient, delta: number): Promise<void> {
  if (delta <= 0) return;
  const today = new Date().toISOString().slice(0, 10);
  const { data: rows } = await supabase
    .from("runtime_config")
    .select("key, value")
    .in("key", ["tokens_used_today", "tokens_reset_at"]);
  const map: Record<string, string> = {};
  for (const r of rows ?? []) {
    map[r.key] = r.value ?? "";
  }
  const resetAt = map["tokens_reset_at"]?.slice(0, 10) ?? "";
  const current = resetAt === today ? parseInt(map["tokens_used_today"] ?? "0", 10) || 0 : 0;
  const next = current + delta;
  const now = new Date().toISOString();
  await supabase.from("runtime_config").upsert(
    [
      { key: "tokens_used_today", value: String(next), updated_at: now },
      { key: "tokens_reset_at", value: today, updated_at: now },
    ],
    { onConflict: "key" }
  );
}

/** Count creative_session rows with started_at within the last rolling hour. */
export async function getSessionsRunInLastHour(supabase: SupabaseClient): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("creative_session")
    .select("session_id", { count: "exact", head: true })
    .gte("started_at", oneHourAgo);
  return count ?? 0;
}

/** Minimum ms between session runs by mode (canon: creative_metabolism). */
export function getIntervalMs(mode: RuntimeMode): number {
  switch (mode) {
    case "slow":
      return 30 * 60 * 1000; // 30 min
    case "default":
      return 60 * 1000; // 1 min
    case "steady":
      return 5 * 60 * 1000; // 5 min
    case "turbo":
      // Under 1 min so cron firing every minute usually runs (avoids skip when last run was ~45s ago).
      return 45 * 1000; // 45 s
    default:
      return 60 * 1000; // 1 min
  }
}

/** Max creative_session rows allowed per rolling 1-hour window, by runtime mode. 0 = no cap. */
export function getMaxSessionsPerHour(mode: RuntimeMode): number {
  switch (mode) {
    case "slow":
      return 4;
    case "steady":
      return 12;
    case "default":
      return 20;
    case "turbo":
      return 30;
    default:
      return 12;
  }
}
