/**
 * GET /api/runtime/config — read mode and always_on (and last_run_at).
 * PATCH /api/runtime/config — set mode and/or always_on (auth required).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getRuntimeConfig, setRuntimeConfig, type RuntimeMode } from "@/lib/runtime-config";

export async function GET() {
  const supabase = getSupabaseServer();
  const config = await getRuntimeConfig(supabase);
  return NextResponse.json({
    mode: config.mode,
    always_on: config.always_on,
    last_run_at: config.last_run_at,
  });
}

export async function PATCH(request: Request) {
  const auth = await createClient().catch(() => null);
  if (auth) {
    const { data: { user } } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: { mode?: string; always_on?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const updates: { mode?: RuntimeMode; always_on?: boolean } = {};
  if (body.mode !== undefined) {
    const m = ["slow", "default", "steady", "turbo"].includes(body.mode) ? (body.mode as RuntimeMode) : undefined;
    if (m) updates.mode = m;
  }
  if (typeof body.always_on === "boolean") updates.always_on = body.always_on;

  if (Object.keys(updates).length === 0) {
    const config = await getRuntimeConfig(supabase);
    return NextResponse.json({ mode: config.mode, always_on: config.always_on, last_run_at: config.last_run_at });
  }

  await setRuntimeConfig(supabase, updates);
  const config = await getRuntimeConfig(supabase);
  return NextResponse.json({ mode: config.mode, always_on: config.always_on, last_run_at: config.last_run_at });
}
