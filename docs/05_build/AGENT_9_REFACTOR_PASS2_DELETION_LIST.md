# Agent-9 refactor second pass — deletion list

Items to remove **after** rollout when no callers remain.

---

## 1. Proposal governance

- [ ] **Legacy fallback branch in `classifyProposalLane`**  
  - Remove the block that runs when `proposalType` is empty (requested_lane and default build_lane).  
  - Make `proposal_type` required at the type level or throw/return error when missing and `ALLOW_LEGACY_PROPOSAL_LANE_FALLBACK` is not set.  
  - **Prerequisite:** `ALLOW_LEGACY_PROPOSAL_LANE_FALLBACK` unset in all envs; zero fallback hits in logs.

---

## 2. Review routes

- [ ] **Redirect pages**  
  - Remove or simplify `app/review/surface/page.tsx`, `app/review/medium/page.tsx`, `app/review/system/page.tsx` if all traffic uses `/review/[laneId]` and sub-routes under `/review/surface/*` are migrated (e.g. to `/review/build_lane/name` or in-app links updated).  
  - **Prerequisite:** No critical links or bookmarks to `/review/surface`, `/review/medium`, `/review/system`; analytics confirm.

- [ ] **Sub-routes under surface**  
  - If consolidating: remove or redirect `review/surface/name`, `review/surface/habitat`, `review/surface/avatar` when replaced by lane-native or consolidated review UI.

---

## 3. Staging read model

- [ ] **Legacy bucket construction**  
  - Remove `toLegacyStagingBuckets` and the legacy `totals`/`buckets` from `StagingReviewModel` when all consumers use `lanes` + `totals.byLane` only.  
  - **Prerequisite:** Staging review API and any other callers return/consume lane-native shape only.

- [ ] **`buildStagingBuckets`**  
  - Remove when `getStagingReviewModel` and tests use `buildStagingBucketsLaneOnly` + optional adapter at edge.  
  - **Prerequisite:** All callers migrated to lane-native or explicit adapter.

- [ ] **`StagingProposalView.bucket`**  
  - Remove optional `bucket` and `StagingLaneBucket` / `classifyLaneBucket` from core types when no longer used.  
  - **Prerequisite:** No consumers depend on `bucket`; only `lane_id` is used.

---

## 4. Deprecated reason code (optional)

- [ ] **GOVERNANCE_REASON_CODES.DEPRECATED_LEGACY_FALLBACK**  
  - Remove when fallback is removed and no logs/traces reference it.

---

## Verification before deletion

1. Grep for `ALLOW_LEGACY_PROPOSAL_LANE_FALLBACK` and `classifyProposalLane` without `proposal_type`.  
2. Grep for `buckets`, `habitatGroups`, `artifacts`, `critiques`, `extensions`, `system` in staging consumers.  
3. Confirm review hub and nav use `/review/{lane_id}` only.  
4. Run full test suite and staging/review E2E or manual checks.
