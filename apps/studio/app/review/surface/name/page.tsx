import Link from "next/link";
import { NameProposalList } from "./name-proposal-list";

/**
 * Name proposal review. Twin may propose an identity name; Harvey applies it to identity.
 */
export default function NameProposalReviewPage() {
  return (
    <main>
      <h1>Name proposals</h1>
      <p>Review proposed identity names. Apply to set the Twin&apos;s name.</p>
      <p>
        <Link href="/review/surface">← Surface proposals</Link>
      </p>
      <section style={{ marginTop: "1rem" }}>
        <NameProposalList />
      </section>
    </main>
  );
}
