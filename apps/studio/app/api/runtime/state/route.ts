import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * GET /api/runtime/state — latest creative_state_snapshot plus lightweight backlog/metabolism view.
 */
export async function GET() {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ snapshot: null, backlog: null, return_candidates: 0 });
  }

  const [stateRes, artifactBacklogRes, proposalBacklogRes, runtimeConfigRes, archiveCountRes] =
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
      supabase
        .from("runtime_config")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("archive_entry").select("archive_entry_id", { count: "exact", head: true }),
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

  const { data: runtimeConfig } = runtimeConfigRes;
  const returnCandidatesCount = archiveCountRes.count ?? 0;

  if (stateError || !snapshot) {
    return NextResponse.json({
      snapshot: null,
      backlog: { artifacts: artifactBacklog, proposals: proposalBacklog },
      runtime: runtimeConfig ?? null,
      return_candidates: returnCandidatesCount,
    });
  }

  return NextResponse.json({
    snapshot,
    backlog: {
      artifacts: artifactBacklog,
      proposals: proposalBacklog,
    },
    runtime: runtimeConfig ?? null,
    return_candidates: returnCandidatesCount,
  });
}

