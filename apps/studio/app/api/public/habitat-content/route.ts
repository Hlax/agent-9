import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { validateHabitatPayload } from "@/lib/habitat-payload";

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

    const { data, error } = await supabase
      .from("public_habitat_content")
      .select("slug, title, body, payload_json")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ slug, title: null, body: null, payload: null });
    }

    const title = data?.title ?? null;
    const body = data?.body ?? null;
    let payload = null;
    if (data?.payload_json && typeof data.payload_json === "object") {
      const result = validateHabitatPayload(data.payload_json);
      if (result.success) payload = result.data;
    }

    return NextResponse.json({ slug, title, body, payload });
  } catch (e) {
    return NextResponse.json(
      { slug: "home", title: null, body: null, payload: null },
      { status: 200 }
    );
  }
}
