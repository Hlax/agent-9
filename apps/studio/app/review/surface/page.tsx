import { redirect } from "next/navigation";

/** Compatibility alias: /review/surface → canonical /review/build_lane. */
export default function SurfaceReviewRedirect() {
  redirect("/review/build_lane");
}
