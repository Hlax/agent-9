"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface StagingPage {
  slug: string;
  title: string | null;
  body: string | null;
  payload_json: unknown;
  source_proposal_id: string | null;
  updated_at: string;
}

interface PromotionRow {
  id: string;
  promoted_at: string;
  promoted_by: string | null;
  slugs_updated: string[];
}

export function StagingCompositionCard() {
  const router = useRouter();
  const [pages, setPages] = useState<StagingPage[]>([]);
  const [promotions, setPromotions] = useState<PromotionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/staging/composition").then((r) => r.json()),
      fetch("/api/staging/promote/history").then((r) => r.json()),
    ]).then(([comp, hist]) => {
      if (!cancelled) {
        setPages(Array.isArray(comp.pages) ? comp.pages : []);
        setPromotions(Array.isArray(hist.promotions) ? hist.promotions : []);
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handlePromote = async () => {
    setPromoting(true);
    try {
      const res = await fetch("/api/staging/promote", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.ok) {
        setPromotions((prev) => [
          { id: data.promotion_id, promoted_at: new Date().toISOString(), promoted_by: null, slugs_updated: data.slugs_updated ?? [] },
          ...prev,
        ]);
        router.refresh();
      }
    } finally {
      setPromoting(false);
    }
  };

  if (loading) return <p style={{ fontSize: "0.9rem", color: "#666" }}>Loading staging…</p>;

  return (
    <section style={{ border: "1px solid #ccc", borderRadius: 8, padding: "1rem", marginBottom: "1rem", background: "#fafafa" }}>
      <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.5rem" }}>Staging composition</h2>
      <p style={{ margin: 0, fontSize: "0.85rem", color: "#555" }}>
        Current staging habitat (candidate workspace). Approve for staging = include in candidate habitat. Public updates only when you push staging to public (promotion creates the new snapshot).
      </p>
      {pages.length === 0 ? (
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.9rem", color: "#666" }}>No pages in staging yet. Approve a habitat proposal for staging to merge it.</p>
      ) : (
        <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem", fontSize: "0.9rem" }}>
          {pages.map((p) => (
            <li key={p.slug}>
              <strong>{p.slug}</strong>
              {p.title && p.title !== p.slug ? ` — ${p.title}` : ""}
              {p.source_proposal_id ? (
                <span style={{ color: "#666", marginLeft: "0.35rem" }}>(from proposal)</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <button
          type="button"
          onClick={handlePromote}
          disabled={promoting || pages.length === 0}
          style={{ padding: "0.35rem 0.75rem", fontSize: "0.9rem", fontWeight: 600 }}
        >
          {promoting ? "Pushing…" : "Push staging to public"}
        </button>
        <span style={{ fontSize: "0.8rem", color: "#666" }}>Publish staged habitat as new public snapshot. Human-only.</span>
      </div>
      {promotions.length > 0 && (
        <details style={{ marginTop: "0.75rem" }}>
          <summary style={{ fontSize: "0.85rem", cursor: "pointer" }}>Promotion history</summary>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem", fontSize: "0.8rem", color: "#555" }}>
            {promotions.slice(0, 5).map((pr) => (
              <li key={pr.id}>
                {new Date(pr.promoted_at).toLocaleString()} — {pr.promoted_by ?? "—"} — {pr.slugs_updated?.length ?? 0} page(s)
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
