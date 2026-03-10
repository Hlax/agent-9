import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_EXTENSIONS = [".md", ".txt"];
const ALLOWED_SOURCE_TYPES = ["identity_seed", "reference", "note", "prompt", "fragment", "upload", "research"] as const;
const ALLOWED_SOURCE_ROLES = ["identity_seed", "reference", "inspiration", "contextual", "archive_only"] as const;

function hasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * POST /api/source-items/upload — upload a text document (.md or .txt) as one source_item.
 * Body: multipart/form-data with "file" (required), optional "title", "source_type", "source_role".
 * Never touches identity.
 */
export async function POST(request: Request) {
  try {
    const authClient = await createClient().catch(() => null);
    if (authClient) {
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024}MB)` },
        { status: 400 }
      );
    }

    if (!hasAllowedExtension(file.name)) {
      return NextResponse.json(
        { error: `Only ${ALLOWED_EXTENSIONS.join(", ")} files are allowed` },
        { status: 400 }
      );
    }

    const contentText = await file.text();
    const titleOverride = formData.get("title");
    const title =
      typeof titleOverride === "string" && titleOverride.trim()
        ? titleOverride.trim().slice(0, 1000)
        : file.name.slice(0, 500);

    const rawType = formData.get("source_type");
    const source_type =
      typeof rawType === "string" && ALLOWED_SOURCE_TYPES.includes(rawType as (typeof ALLOWED_SOURCE_TYPES)[number])
        ? rawType
        : "reference";

    const rawRole = formData.get("source_role");
    const source_role =
      typeof rawRole === "string" && ALLOWED_SOURCE_ROLES.includes(rawRole as (typeof ALLOWED_SOURCE_ROLES)[number])
        ? rawRole
        : null;

    const { data: row, error } = await supabase
      .from("source_item")
      .insert({
        title,
        source_type,
        source_role,
        content_text: contentText || null,
        origin_reference: `uploaded:${file.name}`,
        media_kind: "document",
        project_id: null,
        summary: null,
        content_uri: null,
        source_metadata: { filename: file.name, size: file.size },
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ source_item: row });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}
