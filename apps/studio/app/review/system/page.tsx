import Link from "next/link";
import { SystemProposalList, SystemProposalTabs } from "./system-proposal-list";

export default async function SystemProposalReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view = (params.view === "approved" || params.view === "archived" ? params.view : "pending_review") as "pending_review" | "approved" | "archived";

  return (
    <main>
      <h1>System proposals</h1>
      <p>
        Review Twin proposals for system infrastructure. Approve to record; you implement changes.
      </p>
      <p>
        <Link href="/">← Twin</Link>
      </p>
      <SystemProposalTabs view={view} />
      <section>
        <SystemProposalList view={view} />
      </section>
    </main>
  );
}
