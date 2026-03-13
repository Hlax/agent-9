/**
 * Preview slug normalization for staging habitat preview.
 * Allowed pages only; invalid or missing slug falls back to "home".
 */

const ALLOWED = ["home", "works", "about", "installation"];

export function normalizePreviewSlug(raw: string | undefined): string {
  if (!raw) return "home";
  return ALLOWED.includes(raw) ? raw : "home";
}
