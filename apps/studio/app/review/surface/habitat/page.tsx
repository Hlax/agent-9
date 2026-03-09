import Link from "next/link";

/**
 * Public habitat proposal review path.
 * Twin may propose a staging_habitat or public_habitat change; Harvey approves before publication.
 * First-class reviewable flow — not an artifact approval.
 */
export default function PublicHabitatProposalReviewPage() {
  return (
    <main>
      <h1>Public habitat proposal review</h1>
      <p>
        Review proposed staging or public habitat (index/home) changes. Approve before publishing to public site.
      </p>
      <p>
        <Link href="/review/surface">← Surface proposals</Link>
      </p>
      <section style={{ marginTop: "1rem" }}>
        <p>
          <em>Stub: list proposal_record where lane_type = surface and target_type = public_habitat_proposal (or staging_habitat).</em>
        </p>
      </section>
    </main>
  );
}
