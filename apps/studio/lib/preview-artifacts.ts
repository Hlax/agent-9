export interface PreviewArtifact {
  artifact_id: string;
  title: string;
  summary: string | null;
  medium: string | null;
  content_uri: string | null;
  preview_uri: string | null;
  created_at: string;
}

export function buildPreviewArtifactsMap(
  rows: Array<{
    artifact_id?: unknown;
    title?: unknown;
    summary?: unknown;
    medium?: unknown;
    content_uri?: unknown;
    preview_uri?: unknown;
    created_at?: unknown;
  }>
): Map<string, PreviewArtifact> {
  const map = new Map<string, PreviewArtifact>();
  for (const row of rows) {
    const id = typeof row.artifact_id === "string" ? row.artifact_id : null;
    if (!id) continue;
    map.set(id, {
      artifact_id: id,
      title: typeof row.title === "string" ? row.title : id,
      summary: typeof row.summary === "string" ? row.summary : null,
      medium: typeof row.medium === "string" ? row.medium : null,
      content_uri: typeof row.content_uri === "string" ? row.content_uri : null,
      preview_uri: typeof row.preview_uri === "string" ? row.preview_uri : null,
      created_at: typeof row.created_at === "string" ? row.created_at : "",
    });
  }
  return map;
}

/**
 * Pure helper: resolve artifact IDs against a preview artifacts map.
 * Returns resolved artifacts in order and list of unresolved IDs for inline reporting.
 */
export function resolveArtifactIds(
  artifactIds: string[],
  map: Map<string, PreviewArtifact>
): { resolved: PreviewArtifact[]; unresolved: string[] } {
  const resolved: PreviewArtifact[] = [];
  const unresolved: string[] = [];
  for (const id of artifactIds) {
    const art = map.get(id);
    if (art) resolved.push(art);
    else unresolved.push(id);
  }
  return { resolved, unresolved };
}

