import Link from "next/link";
import { HabitatProposalList, HabitatProposalTabs } from "./habitat-proposal-list";
import { LiveHabitatPages } from "./live-habitat-pages";
import { StagingCompositionCard } from "./staging-composition-card";

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
      <p>
        Review habitat proposals in the <strong>surface lane</strong>. Approve for staging = include in candidate
        habitat (not public). Push staging to public = publish staged habitat as new public snapshot. Direct publish is
        reserved for exceptions and legacy fixes.
      </p>
      <p>
        <Link href="/review/surface">← Surface</Link>
      </p>
      <StagingCompositionCard />
      <LiveHabitatPages />
      <HabitatProposalTabs view={view} />
      <section>
        <HabitatProposalList view={view} />
      </section>
    </main>
  );
}
