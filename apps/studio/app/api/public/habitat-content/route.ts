import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { validateHabitatPayload } from "@/lib/habitat-payload";
import { getActiveIdentityId } from "@/lib/staging-composition";
import { selectHabitatPagePayloadFromSnapshot } from "@/lib/public-habitat-selector";

/**
 * GET /api/public/habitat-content?page=home — read-only public habitat content for a page.
 * Returns { slug, title, body, payload }. payload is present only when valid Habitat V2 payload is stored.
 */
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ slug: "home", title: null, body: null, payload: null });
    }

    const { searchParams } = new URL(request.url);
    const page = searchParams.get("page") ?? "home";
    const slug = ["home", "works", "about", "installation"].includes(page) ? page : "home";

    // Resolve the active identity and read the latest public snapshot for that identity.
    const identityId = await getActiveIdentityId(supabase);
    if (!identityId) {
      return NextResponse.json({ slug, title: null, body: null, payload: null });
    }

    const { data: snapshotRow, error } = await supabase
      .from("habitat_snapshot")
      .select("payload_json")
      .eq("identity_id", identityId)
      .eq("snapshot_kind", "public")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      error ||
      !snapshotRow ||
      !snapshotRow.payload_json ||
      typeof snapshotRow.payload_json !== "object"
    ) {
      return NextResponse.json({ slug, title: null, body: null, payload: null });
    }

    const rawPagePayload = selectHabitatPagePayloadFromSnapshot(
      snapshotRow.payload_json,
      slug
    );

    let payload: unknown = null;
    if (rawPagePayload && typeof rawPagePayload === "object") {
      const result = validateHabitatPayload(rawPagePayload);
      if (result.success) {
        payload = result.data;
      }
    }

    return NextResponse.json({ slug, title: null, body: null, payload });
  } catch (e) {
    return NextResponse.json(
      { slug: "home", title: null, body: null, payload: null },
      { status: 200 }
    );
  }
}
