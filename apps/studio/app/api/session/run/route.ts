import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { setLastRunAt } from "@/lib/runtime-config";
import { runSessionInternal, SessionRunError, type PreferredMedium } from "@/lib/session-runner";

/**
 * POST /api/session/run — run one session pipeline.
 * Requires authenticated user. Loads identity/reference source context when DB is configured.
 * Body (optional): { promptContext?: string, preferMedium?: "writing" | "concept" | "image" }.
 */
const CRON_SECRET_HEADER = "x-cron-secret";

export async function POST(request: Request) {
  try {
    const cronSecret = request.headers.get(CRON_SECRET_HEADER);
    const hasProtectionBypassHeader = !!request.headers.get("x-vercel-protection-bypass");
    const isCron = !!process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET;

    console.log("[session/run] entry", {
      isCron,
      hasCronSecretHeader: !!cronSecret,
      hasProtectionBypassHeader,
      hasAutomationBypassEnv: !!process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    });

    let createdBy: string = "harvey";

    if (!isCron) {
      const authClient = await createClient().catch(() => null);
      if (authClient) {
        const {
          data: { user },
        } = await authClient.auth.getUser();
        if (!user) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (user?.email) createdBy = user.email;
      }
    }

    let promptContext: string | null = null;
    let preferMedium: PreferredMedium | null = null;
    try {
      const body = await request.json().catch(() => ({}));
      if (typeof body?.promptContext === "string" && body.promptContext.trim()) {
        promptContext = body.promptContext.trim();
      }
      if (body?.preferMedium === "image" || body?.preferMedium === "writing" || body?.preferMedium === "concept") {
        preferMedium = body.preferMedium;
      }
    } catch {
      // no body
    }

    const payload = await runSessionInternal({
      createdBy,
      isCron,
      promptContext,
      preferMedium,
    });

    // Update last_run_at so the cron interval guard accounts for manual session runs.
    const serviceSupabase = getSupabaseServer();
    if (serviceSupabase) {
      await setLastRunAt(serviceSupabase, new Date().toISOString());
    }

    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof SessionRunError) {
      return NextResponse.json(e.payload, { status: e.status });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Session failed" },
      { status: 500 }
    );
  }
}
