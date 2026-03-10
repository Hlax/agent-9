import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/artifacts/[id]/unpublish — set artifact publication state back to private.
 * Requires auth. Does not change approval state.
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
      .select("current_publication_state")
      .eq("artifact_id", artifactId)
      .single();

    if (fetchError || !artifact) {
      return NextResponse.json(
        { error: "Artifact not found" },
        { status: 404 }
      );
    }

    if (artifact.current_publication_state !== "published") {
      // Already not public; treat as idempotent success.
      return NextResponse.json({
        ok: true,
        publication_state: artifact.current_publication_state ?? "private",
      });
    }

    const { error: updateError } = await supabase
      .from("artifact")
      .update({
        current_publication_state: "private",
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
        publication_state: "unpublished",
        changed_by: changedBy,
        note: null,
      });

    if (recordError) {
      return NextResponse.json(
        { error: `Publication record failed: ${recordError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, publication_state: "private" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unpublish failed" },
      { status: 500 }
    );
  }
}

