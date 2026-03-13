import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * POST /api/staging/proposal/action?id=... — execute a legal review action for a proposal.
 * This is a thin proxy around the canonical proposal APIs:
 * - For transition-only actions, it calls PATCH /api/proposals/[id] with proposal_state.
 * - For side-effectful approvals, it calls POST /api/proposals/[id]/approve with action.
 *
 * The staging review UI should only offer actions that were computed as allowed
 * by the governance helpers (allowed_actions in the staging review model).
 */
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing proposal id" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
    };
    const action = typeof body.action === "string" ? body.action : null;
    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    const base = process.env.NEXT_PUBLIC_STUDIO_URL ?? "";
    const origin = base.replace(/\/$/, "") || undefined;
    const root = origin ?? "";

    // Map staging-UI-friendly action keys to the canonical proposal APIs.
    if (action === "approve_for_staging" || action === "approve_for_publication") {
      const res = await fetch(`${root}/api/proposals/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return NextResponse.json(
          { error: json.error || `Approve failed with status ${res.status}` },
          { status: res.status }
        );
      }
      return NextResponse.json(json);
    }

    if (
      action === "needs_revision" ||
      action === "reject" ||
      action === "ignore" ||
      action === "archived"
    ) {
      const targetState =
        action === "ignore" ? "ignored" : action === "reject" ? "rejected" : action;
      const res = await fetch(`${root}/api/proposals/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_state: targetState }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return NextResponse.json(
          { error: json.error || `State transition failed with status ${res.status}` },
          { status: res.status }
        );
      }
      return NextResponse.json(json);
    }

    return NextResponse.json(
      { error: `Unsupported action '${action}'` },
      { status: 400 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to execute action" },
      { status: 500 }
    );
  }
}

