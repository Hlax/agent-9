import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const FETCH_TIMEOUT_MS = 15000;
const MAX_CONTENT_LENGTH = 500000;
const ALLOWED_SOURCE_TYPES = ["identity_seed", "reference", "note", "prompt", "fragment", "upload", "research"] as const;
const ALLOWED_SOURCE_ROLES = ["identity_seed", "reference", "inspiration", "contextual", "archive_only"] as const;

/**
 * Extract a readable title from HTML.
 */
function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match || match[1] == null) return null;
  return match[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500) || null;
}

/**
 * Strip HTML to plain text (no external deps). Removes script/style, then tags, then normalizes whitespace.
 */
function htmlToText(html: string): string {
  let text = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "");
  const bodyMatch = text.match(/<body\b[\s\S]*?>([\s\S]*?)<\/body>/i);
  if (bodyMatch && bodyMatch[1] != null) text = bodyMatch[1];
  text = text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, MAX_CONTENT_LENGTH);
}

/**
 * POST /api/source-items/ingest — ingest a webpage from URL into one source_item.
 * Crawl runs synchronously when you call this (on "Import" click). Never touches identity.
 * Body: { url: string, source_type?: string, source_role?: string }
 */
export async function POST(request: Request) {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
    if (!rawUrl) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return NextResponse.json({ error: "URL must be http or https" }, { status: 400 });
    }

    const source_type = typeof body.source_type === "string" && ALLOWED_SOURCE_TYPES.includes(body.source_type as typeof ALLOWED_SOURCE_TYPES[number])
      ? body.source_type
      : "reference";
    const source_role = typeof body.source_role === "string" && ALLOWED_SOURCE_ROLES.includes(body.source_role as typeof ALLOWED_SOURCE_ROLES[number])
      ? body.source_role
      : null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          "User-Agent": "Twin-Studio-Webpage-Ingest/1.0",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      });
    } catch (e) {
      clearTimeout(timeoutId);
      const message = e instanceof Error ? e.message : "Fetch failed";
      return NextResponse.json(
        { error: `Could not fetch URL: ${message}. The site may be slow or block requests.` },
        { status: 502 }
      );
    }
    clearTimeout(timeoutId);

    if (!res.ok) {
      return NextResponse.json(
        { error: `URL returned ${res.status} ${res.statusText}` },
        { status: 502 }
      );
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      return NextResponse.json(
        { error: "URL did not return HTML (content-type may be PDF, image, etc.)" },
        { status: 400 }
      );
    }

    const html = await res.text();
    const title = extractTitle(html) ?? url.hostname + (url.pathname !== "/" ? url.pathname : "");
    const content_text = htmlToText(html);
    const finalUrl = res.url ?? url.toString();

    const { data: row, error } = await supabase
      .from("source_item")
      .insert({
        title: title.slice(0, 1000),
        source_type,
        source_role,
        content_text: content_text || null,
        origin_reference: finalUrl,
        media_kind: "webpage",
        source_metadata: {
          ingested_url: rawUrl,
          final_url: finalUrl,
          status: res.status,
        },
        project_id: null,
        summary: null,
        content_uri: null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ source_item: row });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ingest failed" },
      { status: 500 }
    );
  }
}
