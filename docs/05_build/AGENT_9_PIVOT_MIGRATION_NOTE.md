# Agent-9 Pivot — Migration Note

After the refactor from Twin ontology to canon-native semantics, this note records what remains legacy, what was quarantined, and what can be deleted once callers migrate.

---

## 1. Legacy Twin paths that remain

- **DB columns:** `proposal_record` still has `lane_type` (surface/medium/system) and `proposal_role`; no `lane_id` column yet. Lane identity is derived via `dbLaneToCanon(lane_type)` in code.
- **Compat mapping:** `apps/studio/lib/canon/compat.ts` maps canon lane_id ↔ DB `LaneType`. Required until `proposal_record` stores `lane_id` (e.g. TEXT column).
- **Review routes:** `/review/surface`, `/review/medium`, `/review/system` are still used; review hub maps canon lanes to these three routes. Dynamic `/review/[laneId]` not added.
- **Legacy buckets in staging read model:** `StagingReviewModel.buckets` (habitat, artifacts, critiques, extensions, system) and `StagingLaneBucket` / `classifyLaneBucket()` remain for backward compatibility. New consumers should use `model.lanes` (keyed by canon lane_id).
- **Deprecated fallback in classification:** When `proposal_type` is not provided, `classifyProposalLane()` returns build_lane/surface with reason code `DEPRECATED_LEGACY_FALLBACK`. Callers should pass `proposal_type` from canon.

---

## 2. Quarantined (do not extend; replace before adding new logic)

- **`getMaxPendingHabitatLayoutProposals`**, **`getMaxPendingAvatarProposals`**, **`getMaxPendingExtensionProposals`** in `stop-limits.ts`: Deprecated wrappers that call `getMaxPendingProposalsByProposalType("layout_change" | "embodiment_change" | "integration_change")`. Do not add new Twin-role-based caps.
- **Proposal counts API legacy keys:** The old response shape `{ identity_name, public_habitat_proposal, avatar_candidate }` was removed; the API now returns only `{ byLane, byProposalType }`. Any client that depended on the old keys must switch to `byLane` / `byProposalType`.
- **Twin role literals in tests/fixtures:** Tests that assert on `proposal_role === "habitat_layout"` or `"avatar_candidate"` or `"extension"` should be updated to assert on `proposal_type === "layout_change"` etc. New tests must not depend on Twin role names.
- **UI that filters by `target_type === "avatar_candidate"`:** Review/avatar pages that query by `target_type=avatar_candidate` should switch to `proposal_type=embodiment_change` or `lane_id` + `proposal_type`.

---

## 3. Delete after callers migrate

- **Legacy role-based branch in `classifyProposalLane`:** The fallback that uses `requested_lane` / default build_lane when `proposal_type` is missing can be removed once all creation paths (session-runner, POST /api/proposals, POST /api/artifacts/[id]/create-proposal) and any other callers always pass `proposal_type`.
- **Deprecated helpers in stop-limits:** `getMaxPendingHabitatLayoutProposals`, `getMaxPendingAvatarProposals`, `getMaxPendingExtensionProposals` can be removed once no callers use them (session-runner already uses `getMaxPendingProposalsByProposalType`).
- **`StagingLaneBucket` and `classifyLaneBucket`:** When all UI and APIs consume `model.lanes` only, the legacy `buckets` shape and the Twin bucket enum/helper can be removed from the read model.
- **Compat mapping (`canon/compat.ts`):** When `proposal_record` has a `lane_id` column and all writers/readers use it, the DB lane_type enum and compat mapping can be retired (or kept only for migration of old rows).

---

## 4. Acceptance checks (proof that refactor is correct)

Use these to verify that new proposals are canon-native, staging is canon-driven, review is canon-driven, and counts are canon-native.

### New proposals are canon-native

1. **Session-runner creates with canon proposal_type:** Run a session that produces a concept artifact; confirm the created `proposal_record` has `proposal_type` in `["layout_change", "embodiment_change", "integration_change"]` (or another valid canon type) and `proposal_role` equals that same value (or the canon type). No `habitat_layout`, `avatar_candidate`, or `extension` in `proposal_role` for new rows.
2. **Lane from canon:** For the same row, `lane_type` must match `canonLaneToDb(getPrimaryLaneForProposalType(proposal_type))`.
3. **POST /api/proposals and POST /api/artifacts/[id]/create-proposal:** Create a proposal with body `{ proposal_type: "layout_change", title: "Test", summary: "..." }`; response and DB row must have `proposal_type: "layout_change"` and lane derived from canon.

### Staging is canon-driven

4. **Staging proposals API:** `GET /api/staging/proposals` returns only proposals whose `lane_type` is in the set of DB types that map to `STAGEABLE_CANON_LANES` (currently surface). No hardcoded `lane_type === "surface"` in the route; it uses `STAGEABLE_DB_LANE_TYPES` from canon.
5. **Staging review model:** `GET /api/staging/review` (or equivalent) returns a payload that includes `lanes` keyed by canon lane_id (e.g. `build_lane`, `audit_lane`, `system_lane`) with `label` and `description` from lane_map when provided.

### Review is canon-driven

6. **Review hub:** `app/review/page.tsx` renders one section per canon lane from `getLaneMap()`, with labels and descriptions from canon. Counts are by lane_id (derived from DB lane_type until lane_id is stored).
7. **Review hub links:** Each section links to the correct review route (e.g. build_lane → /review/surface, audit_lane → /review/medium, system_lane → /review/system).

### Counts are canon-native

8. **GET /api/proposals/counts:** Returns `{ byLane: Record<lane_id, number>, byProposalType?: Record<proposal_type, number> }`. No keys `identity_name`, `public_habitat_proposal`, `avatar_candidate`. Query param `by_proposal_type=true` includes `byProposalType` in the response.
9. **Review hub counts:** The review page uses the same byLane counts (or fetches from the counts API with auth) so that the numbers next to each lane match the canon lane_id.

---

## 5. Manual test checklist

- [ ] Run session (concept path): one proposal created with `proposal_type: "layout_change"`, `proposal_role: "layout_change"`, `lane_type: "surface"`.
- [ ] Run session (image path): one proposal created with `proposal_type: "embodiment_change"`, `lane_type: "surface"`.
- [ ] Run session (extension path): one proposal created with `proposal_type: "integration_change"`, `lane_type: "medium"`.
- [ ] GET /api/proposals/counts: response has `byLane` with keys build_lane, promotion_lane, audit_lane, system_lane, canon_lane.
- [ ] GET /api/staging/proposals: only stageable-lane proposals (surface in current compat).
- [ ] GET /api/staging/review: response has `lanes` with at least build_lane (and others if data exists), and `totals.byLane`.
- [ ] Review hub page: five lane sections (Build Lane, System Lane, Canon Lane, Audit Lane, Promotion Lane) with counts and links.
- [ ] POST /api/proposals with `proposal_type: "layout_change"`: 200, row has correct lane and proposal_type.
- [ ] POST /api/artifacts/[id]/create-proposal with default or `proposal_type: "layout_change"`: 200, row has proposal_type and canon-derived lane.
