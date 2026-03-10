"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface LivePage {
  slug: string;
  title: string | null;
  has_body: boolean;
  has_payload: boolean;
}

export function LiveHabitatPages() {
  const router = useRouter();
  const [pages, setPages] = useState<LivePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/habitat-content/live")
      .then((r) => r.json())
      .then((d) => setPages(d.pages ?? []))
      .catch(() => setPages([]))
      .finally(() => setLoading(false));
  }, []);

  const handleClear = async (slug: string) => {
    setClearing(slug);
    try {
      const res = await fetch("/api/habitat-content/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (res.ok) {
        setPages((prev) => prev.filter((p) => p.slug !== slug));
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({}));
        alert(j.error || res.statusText);
      }
    } finally {
      setClearing(null);
    }
  };

  if (loading) return <p style={{ fontSize: "0.9rem", color: "#666" }}>Loading live pages…</p>;
  if (pages.length === 0) return <p style={{ fontSize: "0.9rem", color: "#666" }}>No habitat pages currently live on the public site.</p>;

  return (
    <section style={{ marginBottom: "1.5rem", padding: "0.75rem", background: "#f8f8f8", borderRadius: 8, border: "1px solid #ddd" }}>
      <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Live on public site</h2>
      <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: "#555" }}>
        These slugs have content visible at freeartshow.net. Clear a slug to remove it from the public site (does not change proposals).
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {pages.map((p) => (
          <li key={p.slug} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
            <strong style={{ minWidth: "6rem" }}>{p.slug}</strong>
            <span style={{ fontSize: "0.85rem", color: "#666" }}>
              {p.title ? `“${p.title.slice(0, 50)}${p.title.length > 50 ? "…" : ""}"` : ""}
              {p.has_payload ? " · has layout" : ""}
            </span>
            <button
              type="button"
              onClick={() => handleClear(p.slug)}
              disabled={clearing === p.slug}
              style={{ marginLeft: "auto", padding: "0.2rem 0.5rem", fontSize: "0.8rem", borderRadius: 4 }}
            >
              {clearing === p.slug ? "…" : "Clear from public"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
