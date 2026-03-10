import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { createClient } from "@/lib/supabase/server";
import { REQUIRED_APPROVAL_FOR_PUBLISH } from "@/lib/governance-rules";
import { passesStagingGate } from "@/lib/publish-gate";

/**
 * POST /api/artifacts/[id]/publish — set artifact publication state to published.
 * Only allowed when current_approval_state is approved_for_publication.
 * Requires auth.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authClient = await createClient().catch(() => null);
    if (authClient) {
      const {
        data: { user },
      } = await authClient.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const { id: artifactId } = await params;
    if (!artifactId) {
      return NextResponse.json(
        { error: "Missing artifact id" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { data: artifact, error: fetchError } = await supabase
      .from("artifact")
      .select("current_approval_state, target_surface, artifact_role")
      .eq("artifact_id", artifactId)
      .single();

    if (fetchError || !artifact) {
      return NextResponse.json(
        { error: "Artifact not found" },
        { status: 404 }
      );
    }

    if (artifact.current_approval_state !== REQUIRED_APPROVAL_FOR_PUBLISH) {
      return NextResponse.json(
        {
          error:
            "Artifact must be approved_for_publication before publishing. Approval is not publication.",
        },
        { status: 400 }
      );
    }

    const { data: proposals } = await supabase
      .from("proposal_record")
      .select("proposal_state, proposal_role, target_surface")
      .eq("artifact_id", artifactId);
    const list = Array.isArray(proposals) ? proposals : [];
    if (!passesStagingGate(list, { target_surface: artifact.target_surface, artifact_role: artifact.artifact_role })) {
      return NextResponse.json(
        {
          error:
            "Artifact has linked proposals but none have passed staging. Approve for staging (or later) before publishing.",
        },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("artifact")
      .update({
        current_publication_state: "published",
        updated_at: new Date().toISOString(),
      })
      .eq("artifact_id", artifactId);

    if (updateError) {
      return NextResponse.json(
        { error: `Artifact update failed: ${updateError.message}` },
        { status: 500 }
      );
    }

    const changedBy =
      (authClient && (await authClient.auth.getUser()).data.user?.email) ?? null;

    const { error: recordError } = await supabase
      .from("publication_record")
      .insert({
        artifact_id: artifactId,
        publication_state: "published",
        changed_by: changedBy,
        note: null,
      });

    if (recordError) {
      return NextResponse.json(
        { error: `Publication record failed: ${recordError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, publication_state: "published" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Publish failed" },
      { status: 500 }
    );
  }
}
