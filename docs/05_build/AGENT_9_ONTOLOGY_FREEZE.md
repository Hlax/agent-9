# Agent-9 ontology freeze (Phase 0)

**Canon is the source of truth.** No new logic may reintroduce Twin-only assumptions.

## Do not add

- **Branching on:** `habitat_layout`, `avatar_candidate`, `extension` as proposal roles or lane classifiers
- **Staging/promotion:** Logic that assumes only `lane_type === "surface"` may be staged or promoted; use canon stageable lanes (`STAGEABLE_CANON_LANES`) instead
- **API response keys:** Counts or buckets keyed by `identity_name`, `public_habitat_proposal`, `avatar_candidate`; use `lane_id` and optionally `proposal_type`
- **UI sections:** Hardcoded "Surface" / "Medium" / "System" as the only lanes; render from canon lane map

## Do

- **Proposal creation:** Require or prefer `proposal_type` from canon; resolve `lane_id` via `classifyProposalLane({ proposal_type })`
- **Runner identity:** Map session runner to Agent-9 agent (`agent_9`) for authority checks
- **Caps/throttles:** Key by `proposal_type` or `lane_id` (canon or policy), not by Twin role names
- **Read models / UI:** Bucket and label by `lane_id`; labels and stageability from canon

## Reference

- Canon loader: `apps/studio/lib/canon/`
- Governance: `apps/studio/lib/proposal-governance.ts` (canon-only classification; single deprecated fallback when `proposal_type` missing)
- Lanes API: `GET /api/canon/lanes`
