import Link from "next/link";
import { SystemProposalList } from "./system-proposal-list";

/**
 * System lane: Twin can propose system-infrastructure changes (schema, memory, retrieval, workflow).
 * Harvey approves or rejects; implementation is human-driven, no auto-apply.
 */
export default function SystemProposalReviewPage() {
  return (
    <main>
      <h1>System proposals</h1>
      <p>
        Review Twin proposals for system infrastructure (e.g. schema, memory, retrieval). Approve to record; you implement changes.
      </p>
      <p>
        <Link href="/">← Studio</Link>
      </p>
      <section style={{ marginTop: "1rem" }}>
        <SystemProposalList />
      </section>
    </main>
  );
}
