import { redirect } from "next/navigation";

/** Compatibility alias: /review/system → canonical /review/system_lane. */
export default function SystemReviewRedirect() {
  redirect("/review/system_lane");
}
