import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * GET /api/habitat-content/live — list slugs that have content in public_habitat_content (promotion output).
 * Used in Studio to show "Promotion output" and clear by slug when the originating proposal is unknown.
 * Note: The public site serves from habitat_snapshot, not this table; this is what promotion wrote.
 */
export async function GET() {
  const authClient = await createClient().catch(() => null);
  if (authClient) {
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.json({ pages: [] });

  const { data: rows, error } = await supabase
    .from("public_habitat_content")
    .select("slug, title, body, payload_json");

  if (error) return NextResponse.json({ pages: [], error: error.message }, { status: 500 });

  const pages = (rows ?? [])
    .filter(
      (r: { title: string | null; body: string | null; payload_json: unknown }) =>
        r.title != null || r.body != null || (r.payload_json != null && typeof r.payload_json === "object")
    )
    .map((r: { slug: string; title: string | null; body: string | null; payload_json: unknown }) => ({
      slug: r.slug,
      title: r.title ?? null,
      has_body: !!r.body,
      has_payload: !!r.payload_json && typeof r.payload_json === "object",
    }));

  return NextResponse.json({ pages });
}
