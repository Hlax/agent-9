import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getRuntimeConfig } from "@/lib/runtime-config";

/**
 * GET /api/runtime/state — latest creative_state_snapshot, backlog, runtime config, and introspection fields.
 */
export async function GET() {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ snapshot: null, backlog: null, return_candidates: 0 });
  }

  const [stateRes, artifactBacklogRes, proposalBacklogRes, archiveCountRes, runtimeConfig, latestSessionRes] =
    await Promise.all([
      supabase
        .from("creative_state_snapshot")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("artifact")
        .select("medium, artifact_role, current_approval_state", { count: "exact", head: false }),
      supabase
        .from("proposal_record")
        .select("proposal_role, proposal_state, lane_type, target_surface", {
          count: "exact",
          head: false,
        }),
      supabase.from("archive_entry").select("archive_entry_id", { count: "exact", head: true }),
      getRuntimeConfig(supabase),
      supabase
        .from("creative_session")
        .select("trace")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const { data: snapshot, error: stateError } = stateRes;

  const artifactBacklog =
    artifactBacklogRes.data?.reduce(
      (acc: any, row: any) => {
        const role = row.artifact_role ?? "none";
        const key = `${row.current_approval_state}__${role}`;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ) ?? {};

  const proposalBacklog =
    proposalBacklogRes.data?.reduce(
      (acc: any, row: any) => {
        const role = row.proposal_role ?? "none";
        const key = `${row.lane_type}__${row.proposal_state}__${role}__${row.target_surface ?? "none"}`;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ) ?? {};

  const returnCandidatesCount = archiveCountRes.count ?? 0;
  const latestTrace = (latestSessionRes.data as { trace?: Record<string, unknown> } | null)?.trace ?? null;
  const active_project = (latestTrace && typeof latestTrace === "object" && "project_name" in latestTrace)
    ? (latestTrace.project_name as string)
    : null;
  const active_thread = (latestTrace && typeof latestTrace === "object" && "thread_name" in latestTrace)
    ? (latestTrace.thread_name as string)
    : null;

  const creative_state =
    snapshot && typeof snapshot === "object" && "creative_tension" in snapshot
      ? {
          tension: (snapshot as Record<string, unknown>).creative_tension ?? null,
          reflection_need: (snapshot as Record<string, unknown>).reflection_need ?? null,
          momentum: (snapshot as Record<string, unknown>).recent_exploration_rate ?? null,
        }
      : null;

  const runtime = {
    mode: runtimeConfig.mode,
    always_on: runtimeConfig.always_on,
    tokens_used_today: runtimeConfig.tokens_used_today,
  };

  if (stateError || !snapshot) {
    return NextResponse.json({
      snapshot: null,
      backlog: { artifacts: artifactBacklog, proposals: proposalBacklog },
      runtime,
      return_candidates: returnCandidatesCount,
      creative_state,
      active_project,
      active_thread,
    });
  }

  return NextResponse.json({
    snapshot,
    backlog: {
      artifacts: artifactBacklog,
      proposals: proposalBacklog,
    },
    runtime,
    return_candidates: returnCandidatesCount,
    creative_state,
    active_project,
    active_thread,
  });
}

