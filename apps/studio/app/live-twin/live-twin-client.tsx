"use client";

import { useState, useEffect } from "react";

type PayloadBlock = { id: string; type: string; headline?: string; content?: string; text?: string };
type HabitatPayload = { version?: number; page?: string; blocks?: PayloadBlock[] };

/**
 * Fetches from the same API the public site uses: GET /api/public/habitat-content.
 * That API reads only from habitat_snapshot (latest approved). No staging, no public_habitat_content.
 */
export function LiveTwinClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<HabitatPayload | null>(null);
  const [slug, setSlug] = useState<string>("home");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/habitat-content?page=home")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.payload && typeof data.payload === "object" && Array.isArray(data.payload.blocks)) {
          setPayload(data.payload as HabitatPayload);
          setSlug(data.slug ?? "home");
        } else {
          setPayload(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <p style={{ color: "#666" }}>Loading…</p>;
  if (error) return <p style={{ color: "#c00" }}>Error: {error}</p>;

  const hasPayload = payload?.blocks && payload.blocks.length > 0;

  return (
    <>
      <p style={{ fontSize: "0.85rem", color: "#555", marginBottom: "1rem" }}>
        <strong>Source:</strong> <code>habitat_snapshot</code> (public read path). Not staging. Not promotion output table.
      </p>
      {!hasPayload ? (
        <div>
          <p style={{ fontSize: "1rem", color: "#666" }}>No snapshot yet.</p>
          <p style={{ fontSize: "0.9rem", color: "#555", marginTop: "0.5rem" }}>
            The public site shows fallback content until a snapshot exists. Run the pipeline: approve proposals for staging → Push staging to public.
          </p>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: "0.9rem", color: "#555", marginBottom: "0.75rem" }}>
            Page: <strong>{slug}</strong> · {payload!.blocks!.length} block(s)
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {(payload!.blocks as PayloadBlock[]).map((b) => (
              <li key={b.id} style={{ padding: "0.5rem 0", borderBottom: "1px solid #eee", fontSize: "0.9rem" }}>
                <span style={{ color: "#666" }}>{b.type}</span>
                {b.headline ? ` — ${b.headline}` : b.text ? ` — ${String(b.text).slice(0, 60)}…` : b.content ? ` — ${String(b.content).slice(0, 60)}…` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p style={{ marginTop: "1rem", fontSize: "0.8rem", color: "#888" }}>
        To see the full public experience, open the public site. This view is for verifying what snapshot-backed content is being served.
      </p>
    </>
  );
}
