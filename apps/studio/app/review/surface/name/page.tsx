import Link from "next/link";
import { NameProposalList, NameProposalTabs } from "./name-proposal-list";

export default async function NameProposalReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view = (params.view === "approved" || params.view === "archived" ? params.view : "pending_review") as "pending_review" | "approved" | "archived";

  return (
    <main>
      <h1>Name proposals</h1>
      <p>Twin may propose an identity name; Harvey applies it to identity.</p>
      <p>
        <Link href="/review/surface">← Surface</Link>
      </p>
      <NameProposalTabs view={view} />
      <section>
        <NameProposalList view={view} />
      </section>
    </main>
  );
}
