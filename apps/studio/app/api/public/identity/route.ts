/**
 * GET /api/public/identity — read-only public identity/avatar for public habitat.
 * No auth. Returns name, summary, embodiment_direction, and active avatar artifact (if set).
 */
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  try {
    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({
        name: null,
        summary: null,
        embodiment_direction: null,
        avatar: null,
      });
    }

    const { data: ident, error: identError } = await supabase
      .from("identity")
      .select("name, summary, embodiment_direction, active_avatar_artifact_id")
      .eq("is_active", true)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (identError) {
      return NextResponse.json(
        { error: identError.message },
        { status: 500 }
      );
    }

    if (!ident) {
      return NextResponse.json({
        name: null,
        summary: null,
        embodiment_direction: null,
        avatar: null,
      });
    }

    let avatar: { artifact_id: string; title: string; preview_uri: string | null; content_uri: string | null; medium: string } | null = null;

    if (ident.active_avatar_artifact_id) {
      const { data: art, error: artError } = await supabase
        .from("artifact")
        .select("artifact_id, title, preview_uri, content_uri, medium")
        .eq("artifact_id", ident.active_avatar_artifact_id)
        .single();

      if (!artError && art) {
        avatar = {
          artifact_id: art.artifact_id,
          title: art.title ?? "",
          preview_uri: art.preview_uri ?? null,
          content_uri: art.content_uri ?? null,
          medium: art.medium ?? "image",
        };
      }
    }

    return NextResponse.json({
      name: ident.name ?? null,
      summary: ident.summary ?? null,
      embodiment_direction: ident.embodiment_direction ?? null,
      avatar,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
