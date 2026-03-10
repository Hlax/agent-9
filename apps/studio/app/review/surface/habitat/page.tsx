import Link from "next/link";
import { HabitatProposalList, HabitatProposalTabs } from "./habitat-proposal-list";

export default async function HabitatProposalReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view = (params.view === "approved" || params.view === "archived" ? params.view : "pending_review") as "pending_review" | "approved" | "archived";

  return (
    <main>
      <h1>Public habitat proposal review</h1>
      <p>Review staging habitat and public habitat proposals.</p>
      <p>
        <Link href="/review/surface">← Surface</Link>
      </p>
      <HabitatProposalTabs view={view} />
      <section>
        <HabitatProposalList view={view} />
      </section>
    </main>
  );
}
