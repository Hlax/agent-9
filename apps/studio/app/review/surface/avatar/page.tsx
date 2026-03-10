import Link from "next/link";
import { AvatarProposalList, AvatarProposalTabs } from "./avatar-proposal-list";

export default async function AvatarCandidateReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view = (params.view === "approved" || params.view === "archived" ? params.view : "pending_review") as "pending_review" | "approved" | "archived";

  return (
    <main>
      <h1>Avatar candidate review</h1>
      <p>Review proposed avatar submissions. Approve or archive.</p>
      <p>
        <Link href="/review/surface">← Surface</Link>
      </p>
      <AvatarProposalTabs view={view} />
      <section>
        <AvatarProposalList view={view} />
      </section>
    </main>
  );
}
