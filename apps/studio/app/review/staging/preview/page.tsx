import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  validateHabitatPayload,
  type HabitatProposalPayload,
  type HabitatBlock,
} from "@/lib/habitat-payload";
import {
  buildPreviewArtifactsMap,
  resolveArtifactIds,
  type PreviewArtifact,
} from "@/lib/preview-artifacts";
import { normalizePreviewSlug } from "@/lib/preview-slug";

async function getStagingPreview(page: string): Promise<{
  slug: string;
  payload: HabitatProposalPayload | null;
  artifacts: Map<string, PreviewArtifact>;
}> {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return { slug: page, payload: null, artifacts: new Map() };
  }

  const { data } = await supabase
    .from("staging_habitat_content")
    .select("slug, payload_json")
    .eq("slug", page)
    .maybeSingle();

  if (!data || !data.payload_json || typeof data.payload_json !== "object") {
    return { slug: page, payload: null, artifacts: new Map() };
  }

  const result = validateHabitatPayload(data.payload_json);
  if (!result.success) {
    return { slug: page, payload: null, artifacts: new Map() };
  }

  const { data: artifactRows } = await supabase
    .from("artifact")
    .select("artifact_id, title, summary, medium, content_uri, preview_uri, created_at")
    .eq("current_approval_state", "approved_for_publication")
    .eq("current_publication_state", "published");

  const artifacts = buildPreviewArtifactsMap((artifactRows ?? []) as Array<Record<string, unknown>>);

  return {
    slug: data.slug as string,
    payload: result.data as HabitatProposalPayload,
    artifacts,
  };
}

function PreviewBlocks({
  blocks,
  artifacts,
}: {
  blocks: HabitatBlock[];
  artifacts: Map<string, PreviewArtifact>;
}) {
  if (!blocks.length) return <p style={{ fontSize: "0.9rem" }}>No blocks in staged payload.</p>;

  return (
    <div>
      {blocks.map((block) => {
        if (block.type === "hero") {
          return (
            <section key={block.id} style={{ marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1.75rem", marginBottom: "0.25rem" }}>{block.headline}</h2>
              {"subheadline" in block && block.subheadline ? (
                <p style={{ color: "#555", margin: 0 }}>{block.subheadline}</p>
              ) : null}
            </section>
          );
        }
        if (block.type === "text") {
          return (
            <section key={block.id} style={{ marginBottom: "1rem" }}>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{block.content}</p>
            </section>
          );
        }
        if (block.type === "quote") {
          return (
            <section
              key={block.id}
              style={{
                marginBottom: "1.25rem",
                borderLeft: "4px solid #ccc",
                paddingLeft: "1rem",
              }}
            >
              <blockquote style={{ margin: 0 }}>{block.text}</blockquote>
              {block.attribution && (
                <cite style={{ display: "block", marginTop: "0.5rem", fontSize: "0.9rem" }}>
                  {block.attribution}
                </cite>
              )}
            </section>
          );
        }
        if (block.type === "divider") {
          return <hr key={block.id} style={{ margin: "1.5rem 0", borderTop: "1px solid #eee" }} />;
        }
        if (block.type === "featured_artifact") {
          const art = artifacts.get(block.artifactId);
          if (!art) {
            return (
              <section key={block.id} style={{ marginBottom: "1rem", fontSize: "0.85rem", color: "#666" }}>
                <code>featured_artifact</code> — artifact <code>{block.artifactId}</code> is not
                published or could not be resolved.
              </section>
            );
          }
          return (
            <section key={block.id} style={{ marginBottom: "1.5rem" }}>
              {(art.preview_uri || art.content_uri) && (
                <img
                  src={art.preview_uri ?? art.content_uri ?? ""}
                  alt=""
                  style={{ maxWidth: "100%", height: "auto", borderRadius: 8 }}
                />
              )}
              <h3 style={{ marginTop: "0.5rem" }}>{art.title}</h3>
              {art.summary && <p style={{ color: "#555", margin: 0 }}>{art.summary}</p>}
              {block.caption && (
                <p style={{ fontSize: "0.9rem", color: "#666", marginTop: "0.25rem" }}>
                  {block.caption}
                </p>
              )}
            </section>
          );
        }
        if (block.type === "artifact_grid") {
          const cols = block.columns ?? 3;
          const ids = block.artifactIds ?? [];
          const { resolved: arts, unresolved } = resolveArtifactIds(ids, artifacts);
          return (
            <section key={block.id} style={{ marginBottom: "1.5rem" }}>
              {block.title && (
                <h2 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>{block.title}</h2>
              )}
              {arts.length > 0 ? (
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    display: "grid",
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                    gap: "1rem",
                  }}
                >
                  {arts.map((a) => (
                    <li
                      key={a.artifact_id}
                      style={{ borderBottom: "1px solid #eee", paddingBottom: "0.75rem" }}
                    >
                      <strong>{a.title}</strong>
                      {a.summary && (
                        <p style={{ margin: "0.25rem 0 0", fontSize: "0.9rem", color: "#555" }}>
                          {a.summary}
                        </p>
                      )}
                      {(a.preview_uri || a.content_uri) && (
                        <img
                          src={a.preview_uri ?? a.content_uri ?? ""}
                          alt=""
                          style={{
                            marginTop: "0.5rem",
                            width: "100%",
                            height: "auto",
                            borderRadius: 4,
                          }}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: "0.85rem", color: "#666" }}>
                  No published artifacts resolved for this grid.
                </p>
              )}
              {unresolved.length > 0 && (
                <p style={{ fontSize: "0.8rem", color: "#999", marginTop: "0.35rem" }}>
                  Unresolved artifact ids: {unresolved.join(", ")}
                </p>
              )}
            </section>
          );
        }
        if (
          block.type === "concept_cluster" ||
          block.type === "timeline" ||
          block.type === "marquee"
        ) {
          const ids = block.artifactIds ?? [];
          const { resolved: arts, unresolved } = resolveArtifactIds(ids, artifacts);
          return (
            <section key={block.id} style={{ marginBottom: "1.5rem" }}>
              {block.title && (
                <h2 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>{block.title}</h2>
              )}
              {arts.length > 0 ? (
                <ul style={{ listStyle: "none", padding: 0 }}>
                  {arts.map((a) => (
                    <li
                      key={a.artifact_id}
                      style={{ borderBottom: "1px solid #eee", padding: "0.75rem 0" }}
                    >
                      <strong>{a.title}</strong>
                      {a.summary && (
                        <p style={{ margin: "0.25rem 0 0", fontSize: "0.9rem", color: "#555" }}>
                          {a.summary}
                        </p>
                      )}
                      {(a.preview_uri || a.content_uri) && (
                        <img
                          src={a.preview_uri ?? a.content_uri ?? ""}
                          alt=""
                          style={{
                            marginTop: "0.5rem",
                            maxWidth: "100%",
                            height: "auto",
                            borderRadius: 4,
                          }}
                        />
                      )}
                      {a.created_at && (
                        <p style={{ marginTop: "0.25rem", fontSize: "0.85rem", color: "#888" }}>
                          {new Date(a.created_at).toLocaleDateString()}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: "0.85rem", color: "#666" }}>
                  No published artifacts resolved for this {block.type.replace("_", " ")}.
                </p>
              )}
              {unresolved.length > 0 && (
                <p style={{ fontSize: "0.8rem", color: "#999", marginTop: "0.35rem" }}>
                  Unresolved artifact ids: {unresolved.join(", ")}
                </p>
              )}
            </section>
          );
        }
        if (block.type === "story_card") {
          const cards = block.cards ?? [];
          return (
            <section
              key={block.id}
              style={{
                marginBottom: "1.5rem",
                border: "1px solid #eee",
                borderRadius: 8,
                padding: "1rem",
              }}
            >
              {block.title && (
                <h2 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>{block.title}</h2>
              )}
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {cards.map((card, i) => (
                  <li
                    key={i}
                    style={{
                      borderBottom: i < cards.length - 1 ? "1px solid #eee" : undefined,
                      padding: "0.75rem 0",
                    }}
                  >
                    <strong style={{ display: "block", marginBottom: "0.25rem" }}>{card.label}</strong>
                    <p style={{ margin: 0, fontSize: "0.95rem", color: "#444" }}>{card.content}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        }
        // Explicit placeholder for unsupported/decorative blocks (e.g. ambient_motif).
        return (
          <section key={block.id} style={{ marginBottom: "1rem", fontSize: "0.85rem", color: "#666" }}>
            <code>{block.type}</code> block
          </section>
        );
      })}
    </div>
  );
}

export default async function StagingPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const requested = normalizePreviewSlug(params.page);
  const { slug, payload, artifacts } = await getStagingPreview(requested);

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "1rem" }}>
      <header style={{ marginBottom: "1rem" }}>
        <p>
          <Link href="/review/staging">← Back to staging review</Link>
        </p>
        <h1>Staged habitat preview</h1>
        <nav style={{ margin: "0.5rem 0 0.75rem", fontSize: "0.9rem" }}>
          {["home", "works", "about", "installation"].map((page) => (
            <Link
              key={page}
              href={`/review/staging/preview?page=${page}`}
              style={{
                marginRight: "0.75rem",
                textDecoration: requested === page ? "underline" : "none",
                fontWeight: requested === page ? 600 : 400,
              }}
            >
              {page}
            </Link>
          ))}
        </nav>
        <p style={{ fontSize: "0.9rem", color: "#555" }}>
          This is a <strong>preview-only</strong> rendering of staged habitat content for{" "}
          <code>{slug}</code>. It does not reflect the current public snapshot and reads only from
          staging.
        </p>
      </header>

      {!payload ? (
        <p style={{ fontSize: "0.9rem" }}>
          No valid staged habitat payload found for <code>{slug}</code>. Approve proposals for
          staging and push habitat payloads into <code>staging_habitat_content</code> to enable
          preview.
        </p>
      ) : (
        <section>
          <h2>Preview</h2>
          <PreviewBlocks blocks={payload.blocks} artifacts={artifacts} />
        </section>
      )}
    </main>
  );
}

