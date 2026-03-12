# Habitat staging merge path — fix deliverable

## Root cause

- **Observed:** Approving for staging reported success and `proposal_record.proposal_state` advanced to `approved_for_staging`, but `staging_habitat_content` remained empty.
- **Cause:** The approve route only called `mergeHabitatProposalIntoStaging` when `proposal.habitat_payload_json != null` **and** `typeof proposal.habitat_payload_json === "object"`. In some environments Supabase returns JSONB columns as **serialized JSON strings**. Then `typeof ... === "object"` is false, so the merge branch was never run; the route still updated proposal state. So state advanced successfully while no row was written to `staging_habitat_content`.
- **Secondary:** If merge was called but validation failed, the route only returned 400 when both `!mergeResult.applied` and `mergeResult.error` were set. The fix treats any `!mergeResult.applied` (when we intended to merge) as failure and does not advance state.

## Files changed

| File | Change |
|------|--------|
| `apps/studio/app/api/proposals/[id]/approve/route.ts` | Normalize `habitat_payload_json`: read from `habitat_payload_json` or `habitatPayloadJson`; if value is a string, `JSON.parse` it. Use normalized value for the "is habitat for staging" check and for calling merge. When `isHabitatForStaging` and `!mergeResult.applied`, return 400 and do not update proposal state. Use normalized payload for the publication path as well. |
| `apps/studio/lib/staging-composition.ts` | In `mergeHabitatProposalIntoStaging`: if payload is a string, parse before validation. Try full `validateHabitatPayload` first; if it fails, try `parseHabitatPayloadForMerge` (minimal shape: `page` string, `blocks` array). If either succeeds, upsert into `staging_habitat_content` with slug, title, body: null, payload_json, source_proposal_id. Do not advance proposal state when merge returns applied: false. |
| `apps/studio/lib/habitat-payload.ts` | Add `parseHabitatPayloadForMerge(raw)`: accept object or JSON string; require non-empty string `page` and array `blocks`; return `{ slug, payload }` or `{ error }`. Used when full schema validation fails but payload is mergeable. |
| `apps/studio/lib/__tests__/staging-habitat-merge.test.ts` | New tests: valid payload (page string, blocks) → insert; JSON string → upsert; re-approve same page → upsert; invalid payload → applied false, no upsert; null → applied false; Supabase error → applied false with message. |

## Payload shape assumptions

- **Before:** Code assumed `habitat_payload_json` was already an object in memory and that it matched the strict Zod schema (e.g. `version: z.literal(1)`, `page` in enum, blocks fully typed). String JSONB or minor shape differences could prevent merge from running or cause validation to fail.
- **After:** Payload is normalized (string → parsed object) before the merge gate. Merge accepts the **real payload shape** produced by habitat proposals: `page` (string slug), `blocks` (array), `version` (optional number). Full validation is tried first; if it fails, a minimal check (`page` + `blocks`) is used so staging still receives the content. Stored `payload_json` preserves the actual shape.

## Backfill

Proposals that were **already** approved for staging before this fix were never merged into `staging_habitat_content`. Their `proposal_record.proposal_state` is `approved_for_staging` (or later) but no row exists in `staging_habitat_content` for that page. To bring those into the staging composition, run a **one-time backfill**: for each such proposal with non-null `habitat_payload_json`, call the same merge logic (e.g. `mergeHabitatProposalIntoStaging(supabase, proposal_record_id, habitat_payload_json, title)`) or re-invoke the approve path in a safe way (e.g. admin script or idempotent "re-apply to staging" action). No schema change is required for backfill.
