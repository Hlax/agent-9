import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getActiveIdentityId } from "@/lib/staging-composition";
import { getPublishReadinessReview } from "@/lib/habitat-publish-review";

/**
 * GET /api/staging/publish-review — advisory-only publish readiness review.
 *
 * Query:
 *   - identity_id (optional; falls back to active identity)
 *   - last_n (optional; default 10, cap 20)
 *
 * Candidate payload source:
 *   - derived from current staging composition (staging_habitat_content + identity avatar state).
 *
 * Returns:
 * {
 *   identity_id: string;
 *   last_n: number;
 *   review: PublishReadinessReviewV1;
 * }
 *
 * This endpoint is advisory-only in V1: it must not gate or block publish.
 */
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    let identityId = searchParams.get("identity_id");
    if (!identityId) {
      identityId = await getActiveIdentityId(supabase);
    }

    if (!identityId) {
      return NextResponse.json(
        { error: "No active identity and no identity_id provided" },
        { status: 404 }
      );
    }

    const lastN = Math.min(
      20,
      Math.max(
        1,
        Number.parseInt(searchParams.get("last_n") ?? "", 10) || 10
      )
    );

    const { data: stagingRows, error: stagingError } = await supabase
      .from("staging_habitat_content")
      .select("slug, payload_json")
      .order("slug");

    if (stagingError) {
      return NextResponse.json(
        { error: stagingError.message },
        { status: 500 }
      );
    }

    const { data: ident } = await supabase
      .from("identity")
      .select("active_avatar_artifact_id, embodiment_direction")
      .eq("identity_id", identityId)
      .maybeSingle();

    const avatarArtifactId =
      (ident as { active_avatar_artifact_id?: string } | null)
        ?.active_avatar_artifact_id ?? null;
    const embodimentDirection =
      (ident as { embodiment_direction?: string } | null)
        ?.embodiment_direction ?? null;

    const candidatePayload = {
      habitat_pages: (stagingRows ?? []).map((r: any) => ({
        slug: r.slug as string,
        payload: r.payload_json,
      })),
      avatar_state: avatarArtifactId
        ? {
            avatar_artifact_id: avatarArtifactId,
            embodiment_direction: embodimentDirection,
          }
        : null,
      extensions: [] as unknown[],
    };

    const review = await getPublishReadinessReview(supabase, {
      identityId,
      candidatePayload,
      lastN,
    });

    return NextResponse.json({
      identity_id: identityId,
      last_n: lastN,
      review,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

