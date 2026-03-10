/**
 * Public habitat — identity/avatar + works, or Habitat V2 payload-driven layout when present.
 * Fetches from Studio API when NEXT_PUBLIC_STUDIO_URL is set.
 */
type ArtifactItem = {
  artifact_id: string;
  title: string;
  summary: string | null;
  medium: string;
  content_uri: string | null;
  preview_uri: string | null;
  created_at: string;
};

type PublicIdentity = {
  name: string | null;
  summary: string | null;
  embodiment_direction: string | null;
  avatar: {
    artifact_id: string;
    title: string;
    preview_uri: string | null;
    content_uri: string | null;
    medium: string;
  } | null;
};

type FetchResult = { artifacts: ArtifactItem[]; error?: string };

// Habitat V2 payload types (allowlisted; match studio schema)
type HabitatTheme = {
  tone?: string;
  density?: string;
  motion?: string;
  surfaceStyle?: string;
};
type HabitatBlock =
  | { id: string; type: "hero"; headline: string; subheadline?: string; avatarArtifactId?: string; alignment?: string }
  | { id: string; type: "text"; content: string }
  | { id: string; type: "quote"; text: string; attribution?: string }
  | { id: string; type: "artifact_grid"; title?: string; artifactIds: string[]; columns?: number }
  | { id: string; type: "featured_artifact"; artifactId: string; caption?: string }
  | { id: string; type: "concept_cluster"; title?: string; artifactIds: string[] }
  | { id: string; type: "timeline"; title?: string; artifactIds: string[] }
  | { id: string; type: "ambient_motif"; motif: string; intensity?: string }
  | { id: string; type: "divider" }
  | { id: string; type: "marquee"; title?: string; artifactIds: string[] };
type HabitatPayload = {
  version: number;
  page: string;
  theme?: HabitatTheme;
  blocks: HabitatBlock[];
};

type HabitatContentResult = {
  slug: string;
  title: string | null;
  body: string | null;
  payload: HabitatPayload | null;
};

const ALLOWED_BLOCK_TYPES = new Set([
  "hero", "text", "quote", "artifact_grid", "featured_artifact", "concept_cluster",
  "timeline", "ambient_motif", "divider", "marquee",
]);

function isHabitatBlock(b: unknown): b is HabitatBlock {
  return typeof b === "object" && b !== null && "id" in b && "type" in b
    && typeof (b as { type: string }).type === "string"
    && ALLOWED_BLOCK_TYPES.has((b as { type: string }).type);
}

async function getPublishedArtifacts(): Promise<FetchResult> {
  const base = process.env.NEXT_PUBLIC_STUDIO_URL ?? "";
  const cleaned = base.replace(/\/$/, "");
  if (!cleaned) return { artifacts: [] };
  const url = cleaned + "/api/public/artifacts";
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const prefix = "Studio returned " + res.status;
      const errMsg = text ? prefix + ": " + text.slice(0, 80) : prefix;
      return { artifacts: [], error: errMsg };
    }
    const data = await res.json();
    const list = Array.isArray(data.artifacts) ? data.artifacts : [];
    return { artifacts: list };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load";
    return { artifacts: [], error: message };
  }
}

async function getPublicIdentity(): Promise<PublicIdentity | null> {
  const base = process.env.NEXT_PUBLIC_STUDIO_URL ?? "";
  const cleaned = base.replace(/\/$/, "");
  if (!cleaned) return null;
  const url = cleaned + "/api/public/identity";
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return {
      name: data.name ?? null,
      summary: data.summary ?? null,
      embodiment_direction: data.embodiment_direction ?? null,
      avatar: data.avatar ?? null,
    };
  } catch {
    return null;
  }
}

async function getHabitatContent(page: string): Promise<HabitatContentResult> {
  const base = process.env.NEXT_PUBLIC_STUDIO_URL ?? "";
  const cleaned = base.replace(/\/$/, "");
  if (!cleaned) return { slug: "home", title: null, body: null, payload: null };
  const url = cleaned + "/api/public/habitat-content?page=" + encodeURIComponent(page);
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return { slug: page, title: null, body: null, payload: null };
    const data = await res.json();
    const payload =
      data?.payload && typeof data.payload === "object" && data.payload.version === 1 && Array.isArray(data.payload.blocks)
        ? (data.payload as HabitatPayload)
        : null;
    return {
      slug: data?.slug ?? page,
      title: data?.title ?? null,
      body: data?.body ?? null,
      payload,
    };
  } catch {
    return { slug: page, title: null, body: null, payload: null };
  }
}

function DefaultLayout({
  identity,
  works,
  error,
}: {
  identity: PublicIdentity | null;
  works: ArtifactItem[];
  error?: string;
}) {
  return (
    <>
      <section style={{ marginBottom: "2rem", paddingBottom: "1.5rem", borderBottom: "1px solid #eee" }}>
        <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>{identity?.name ?? "Twin"}</h1>
        {identity?.avatar && (identity.avatar.preview_uri ?? identity.avatar.content_uri) && (
          <div style={{ marginBottom: "0.75rem" }}>
            <img
              src={identity.avatar.preview_uri ?? identity.avatar.content_uri ?? ""}
              alt={identity.avatar.title || "Avatar"}
              style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8 }}
            />
          </div>
        )}
        {(identity?.summary ?? identity?.embodiment_direction) && (
          <p style={{ color: "#555", margin: 0, fontSize: "0.95rem" }}>
            {identity?.summary ?? identity?.embodiment_direction ?? ""}
          </p>
        )}
      </section>
      <h2 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>Works</h2>
      {error ? <p style={{ color: "#c00", marginBottom: "1rem" }}>Unable to load works: {error}</p> : null}
      {works.length === 0 && !error ? (
        <p style={{ color: "#666" }}>No published works yet.</p>
      ) : works.length === 0 ? null : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {works.map((a) => (
            <li key={a.artifact_id} style={{ borderBottom: "1px solid #eee", padding: "1rem 0" }}>
              <strong>{a.title}</strong>
              {a.summary && <p style={{ margin: "0.25rem 0 0", fontSize: "0.95rem", color: "#555" }}>{a.summary}</p>}
              {(a.preview_uri || a.content_uri) && (
                <img
                  src={a.preview_uri ?? a.content_uri ?? ""}
                  alt=""
                  style={{ marginTop: "0.5rem", maxWidth: "100%", height: "auto", borderRadius: 4 }}
                />
              )}
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#888" }}>
                {a.medium} - {new Date(a.created_at).toLocaleDateString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function HabitatBlocks({
  blocks,
  artifactsMap,
  identity,
}: {
  blocks: HabitatBlock[];
  artifactsMap: Map<string, ArtifactItem>;
  identity: PublicIdentity | null;
}) {
  const sectionStyle = { marginBottom: "1.5rem" };
  const items: React.ReactNode[] = [];
  for (const block of blocks) {
    if (!isHabitatBlock(block)) continue;
    if (block.type === "hero") {
      const avatarId = block.avatarArtifactId ?? identity?.avatar?.artifact_id ?? null;
      const art = avatarId ? artifactsMap.get(avatarId) : null;
      const imgUri = art ? (art.preview_uri ?? art.content_uri) : (identity?.avatar?.preview_uri ?? identity?.avatar?.content_uri);
      items.push(
        <section key={block.id} style={{ ...sectionStyle, textAlign: block.alignment === "center" ? "center" : "left" }}>
          {imgUri && (
            <div style={{ marginBottom: "0.75rem" }}>
              <img src={imgUri} alt="" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8 }} />
            </div>
          )}
          <h1 style={{ fontSize: "2rem", marginBottom: "0.25rem" }}>{block.headline}</h1>
          {block.subheadline && <p style={{ color: "#555", margin: 0, fontSize: "1rem" }}>{block.subheadline}</p>}
        </section>
      );
    } else if (block.type === "text") {
      items.push(
        <section key={block.id} style={sectionStyle}>
          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{block.content}</p>
        </section>
      );
    } else if (block.type === "quote") {
      items.push(
        <section key={block.id} style={{ ...sectionStyle, borderLeft: "4px solid #ccc", paddingLeft: "1rem" }}>
          <blockquote style={{ margin: 0 }}>{block.text}</blockquote>
          {block.attribution && <cite style={{ display: "block", marginTop: "0.5rem", fontSize: "0.9rem" }}>{block.attribution}</cite>}
        </section>
      );
    } else if (block.type === "artifact_grid") {
      const cols = block.columns ?? 3;
      const arts = (block.artifactIds ?? [])
        .map((id) => artifactsMap.get(id))
        .filter((a): a is ArtifactItem => a != null);
      items.push(
        <section key={block.id} style={sectionStyle}>
          {block.title && <h2 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>{block.title}</h2>}
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "1rem" }}>
            {arts.map((a) => (
              <li key={a.artifact_id} style={{ borderBottom: "1px solid #eee", paddingBottom: "0.75rem" }}>
                <strong>{a.title}</strong>
                {a.summary && <p style={{ margin: "0.25rem 0 0", fontSize: "0.9rem", color: "#555" }}>{a.summary}</p>}
                {(a.preview_uri || a.content_uri) && (
                  <img src={a.preview_uri ?? a.content_uri ?? ""} alt="" style={{ marginTop: "0.5rem", width: "100%", height: "auto", borderRadius: 4 }} />
                )}
              </li>
            ))}
          </ul>
        </section>
      );
    } else if (block.type === "featured_artifact") {
      const art = artifactsMap.get(block.artifactId);
      if (art) {
        items.push(
          <section key={block.id} style={sectionStyle}>
            {(art.preview_uri || art.content_uri) && (
              <img src={art.preview_uri ?? art.content_uri ?? ""} alt="" style={{ maxWidth: "100%", height: "auto", borderRadius: 8 }} />
            )}
            <h3 style={{ marginTop: "0.5rem" }}>{art.title}</h3>
            {art.summary && <p style={{ color: "#555", margin: 0 }}>{art.summary}</p>}
            {block.caption && <p style={{ fontSize: "0.9rem", color: "#666", marginTop: "0.25rem" }}>{block.caption}</p>}
          </section>
        );
      }
    } else if (block.type === "concept_cluster" || block.type === "timeline" || block.type === "marquee") {
      const artifactIds = "artifactIds" in block ? (block.artifactIds ?? []) : [];
      const arts = artifactIds.map((id) => artifactsMap.get(id)).filter((a): a is ArtifactItem => a != null);
      items.push(
        <section key={block.id} style={sectionStyle}>
          {"title" in block && block.title && <h2 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>{block.title}</h2>}
          <ul style={{ listStyle: "none", padding: 0 }}>
            {arts.map((a) => (
              <li key={a.artifact_id} style={{ borderBottom: "1px solid #eee", padding: "0.75rem 0" }}>
                <strong>{a.title}</strong>
                {a.summary && <p style={{ margin: "0.25rem 0 0", fontSize: "0.9rem", color: "#555" }}>{a.summary}</p>}
                {(a.preview_uri || a.content_uri) && (
                  <img src={a.preview_uri ?? a.content_uri ?? ""} alt="" style={{ marginTop: "0.5rem", maxWidth: "100%", height: "auto", borderRadius: 4 }} />
                )}
              </li>
            ))}
          </ul>
        </section>
      );
    } else if (block.type === "ambient_motif") {
      items.push(<section key={block.id} style={{ ...sectionStyle, minHeight: 8 }} aria-hidden />);
    } else if (block.type === "divider") {
      items.push(<hr key={block.id} style={{ margin: "1.5rem 0", border: "none", borderTop: "1px solid #eee" }} />);
    }
  }
  return <>{items}</>;
}

export default function PublicHome() {
  return (
    <main
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1rem",
      }}
    >
      <h1
        style={{
          fontFamily: "\"Futura\", system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
          fontSize: "3.5rem",
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        Hello Twin
      </h1>
    </main>
  );
}
