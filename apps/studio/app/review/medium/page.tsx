import { redirect } from "next/navigation";

/** Compatibility alias: /review/medium → canonical /review/audit_lane. */
export default function MediumReviewRedirect() {
  redirect("/review/audit_lane");
}
