import Link from "next/link";

/**
 * Surface proposal review queue stub.
 * Canon: surface lane — avatar candidates and public habitat proposals are first-class reviewable flows.
 * Do not collapse with artifact approval; use proposal_record with lane_type = surface.
 */
export default function SurfaceReviewPage() {
  return (
    <main>
      <h1>Surface proposals</h1>
      <p>
        Review staging habitat and public habitat proposals. Separate from artifact approval.
      </p>
      <p>
        <Link href="/">← Studio</Link>
      </p>
      <nav style={{ display: "flex", gap: "1rem", marginTop: "1rem", flexWrap: "wrap" }}>
        <Link href="/review/surface/avatar">Avatar candidate review</Link>
        <Link href="/review/surface/habitat">Public habitat proposal review</Link>
        <Link href="/review/surface/name">Name proposals</Link>
      </nav>
    </main>
  );
}
