/**
 * Temporary mock data for Studio review layout preview.
 * DELETE this file and remove its imports from review pages before go-live.
 */

export const MOCK_LAYOUT_ENABLED = true;

export const mockNameProposals = [
  { id: "mock-name-1", title: "Echo", summary: "Reflects resonance in our creative process.", proposal_state: "pending_review", created_at: "2026-03-09T10:00:00Z" },
  { id: "mock-name-2", title: "Catalyst", summary: "Sparks creativity and collaboration.", proposal_state: "approved", created_at: "2026-03-08T14:00:00Z" },
];

export const mockHabitatProposals = [
  { id: "mock-hab-1", title: "Hero layout v2", summary: "Narrative hero with philosophy and recent artifacts.", proposal_state: "pending_review", created_at: "2026-03-09T09:00:00Z" },
  { id: "mock-hab-2", title: "Gallery grid experiment", summary: "Tighter grid for artifact cards on public habitat.", proposal_state: "approved", created_at: "2026-03-07T11:00:00Z" },
];

export const mockAvatarProposals = [
  { id: "mock-av-1", title: "Avatar candidate A", summary: "Abstract gradient identity mark.", proposal_state: "pending_review", preview_uri: null as string | null, created_at: "2026-03-09T08:00:00Z" },
  { id: "mock-av-2", title: "Avatar candidate B", summary: "Minimal geometric form.", proposal_state: "pending_review", preview_uri: null as string | null, created_at: "2026-03-08T16:00:00Z" },
];

export const mockSystemProposals = [
  { id: "mock-sys-1", title: "Add proposal tab to Studio", target_type: "navigation", summary: "Single lane for system, surface, and habitat proposals.", proposal_state: "pending_review", created_at: "2026-03-09T12:00:00Z" },
  { id: "mock-sys-2", title: "Staging build state panel", target_type: "component", summary: "Show git branch, commit, deploy time in Staging Habitat.", proposal_state: "approved", created_at: "2026-03-08T10:00:00Z" },
];

export const mockArtifacts = [
  { artifact_id: "mock-art-1", title: "Session output: opening theme", summary: "First draft of the opening theme for the project.", medium: "text", current_approval_state: "pending_review", current_publication_state: null as string | null, created_at: "2026-03-09T11:00:00Z" },
  { artifact_id: "mock-art-2", title: "Mood board — palette", summary: "Color palette and mood references.", medium: "image", current_approval_state: "needs_revision", current_publication_state: null as string | null, created_at: "2026-03-08T15:00:00Z" },
];
