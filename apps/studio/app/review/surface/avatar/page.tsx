import Link from "next/link";
import { AvatarProposalList } from "./avatar-proposal-list";

/**
 * Avatar candidate review path.
 * Twin may propose an avatar; Harvey approves before it is used (e.g. in staging or identity).
 * First-class reviewable flow — not an artifact approval.
 */
export default function AvatarCandidateReviewPage() {
  return (
    <main>
      <h1>Avatar candidate review</h1>
      <p>Review proposed avatar submissions. Approve or reject for use in identity/staging.</p>
      <p>
        <Link href="/review/surface">← Surface proposals</Link>
      </p>
      <section style={{ marginTop: "1rem" }}>
        <AvatarProposalList />
      </section>
    </main>
  );
}
