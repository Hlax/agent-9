"use client";

import Link from "next/link";
import { SignOut } from "./sign-out";

/**
 * Studio v2 pipeline navigation.
 * Maps to: Runtime → Proposals → Staging → Promotion → Live Twin
 */
export function StudioNav() {
  return (
    <nav
      className="studio-nav"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.5rem",
        alignItems: "center",
      }}
    >
      <Link href="/" style={{ fontWeight: 600 }}>
        Studio
      </Link>
      <span style={{ color: "#999" }}>|</span>
      <Link href="/runtime">Runtime</Link>
      <Link href="/review">Proposals</Link>
      <Link href="/review/staging">Staging</Link>
      <Link href="/review/surface/habitat">Promotion</Link>
      <Link href="/live-twin">Live Twin</Link>
      <span style={{ flex: 1 }} />
      <Link href="/session" style={{ padding: "0.35rem 0.75rem", background: "#111", color: "#fff", borderRadius: 6, fontWeight: 600 }}>
        Start session
      </Link>
      <Link href="/source" title="Source library">Source</Link>
      <Link href="/identity" title="Identity">Identity</Link>
      <Link href="/concepts" title="Concepts">Concepts</Link>
      <Link href="/review/artifacts" title="Artifact review">Artifacts</Link>
      <SignOut />
    </nav>
  );
}
