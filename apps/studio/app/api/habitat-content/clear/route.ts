import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const ALLOWED_SLUGS = ["home", "works", "about", "installation"];

/**
 * POST /api/habitat-content/clear — clear public content for one slug (title, body, payload_json).
 * Body: { slug: string }. Requires auth.
 */
export async function POST(request: Request) {
  const authClient = await createClient().catch(() => null);
  if (authClient) {
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  let body: { slug?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slug || !ALLOWED_SLUGS.includes(slug)) {
    return NextResponse.json(
      { error: `slug must be one of: ${ALLOWED_SLUGS.join(", ")}` },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("public_habitat_content")
    .update({
      title: null,
      body: null,
      payload_json: null,
      updated_at: new Date().toISOString(),
    })
    .eq("slug", slug);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, slug });
}
