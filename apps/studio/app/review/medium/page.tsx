import Link from "next/link";
import { MediumProposalList, MediumProposalTabs } from "./medium-proposal-list";

export default async function MediumProposalReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view = (params.view === "approved" || params.view === "archived" ? params.view : "pending_review") as
    | "pending_review"
    | "approved"
    | "archived";

  return (
    <main>
      <h1>Medium proposals</h1>
      <p>
        Capability and medium proposals (e.g. extensions). These do not go to staging or public directly; approving records them for the roadmap or a later spec.
      </p>
      <p>
        <Link href="/review">← Review</Link>
      </p>
      <MediumProposalTabs view={view} />
      <section>
        <MediumProposalList view={view} />
      </section>
    </main>
  );
}

