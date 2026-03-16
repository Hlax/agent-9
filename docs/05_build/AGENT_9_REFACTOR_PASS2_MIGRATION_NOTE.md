# Agent-9 refactor second pass — migration note

## Summary

This pass removes remaining semantic escape hatches and makes routing/read models fully canon-native. Callers now pass explicit `proposal_type`; review is lane-native (`/review/[laneId]`); staging core is lane-only with legacy shapes at the edge.

---

## Remaining compatibility shims

| Shim | Location | Purpose | Remove when |
|------|----------|---------|-------------|
| **Legacy lane fallback** | `proposal-governance.ts` `classifyProposalLane` | When `proposal_type` is missing, can still classify via `requested_lane` or default to build_lane if `ALLOW_LEGACY_PROPOSAL_LANE_FALLBACK=1` | No callers rely on missing proposal_type; set env to `0` or unset and remove fallback branch |
| **Redirects** | `/review/surface`, `/review/medium`, `/review/system` | Redirect to `/review/build_lane`, `/review/audit_lane`, `/review/system_lane` | All links and bookmarks use canonical lane IDs; sub-routes (e.g. `/review/surface/name`) migrated or removed |
| **Legacy staging buckets** | `staging-read-model.ts` `toLegacyStagingBuckets`, `buildStagingBuckets` | API and tests still receive `buckets` and legacy totals | All consumers use `lanes` + `totals.byLane` only; staging review API returns lane-native only |
| **StagingProposalView.bucket** | `staging-read-model.ts` | Optional `bucket` set by legacy adapter for backward compat | All consumers use `lane_id` only |

---

## API contract changes

- **POST /api/proposals**  
  - `proposal_type` remains **required**. Invalid or missing returns 400.

- **POST /api/artifacts/[id]/create-proposal**  
  - **Breaking:** `proposal_type` is now **required** in the body (no default `layout_change`).  
  - Clients must send e.g. `{ "proposal_type": "layout_change", ... }`.  
  - 400 if missing or not in canon.

- **GET /api/canon/lanes**  
  - Source of truth for lane list and stageability; use for review hub and any lane-driven UI.

- **Review routes**  
  - Canonical: `/review/build_lane`, `/review/audit_lane`, `/review/system_lane`, `/review/promotion_lane`, `/review/canon_lane`.  
  - Compatibility: `/review/surface` → redirect to `/review/build_lane`, same for medium/system.

---

## Environment

- **ALLOW_LEGACY_PROPOSAL_LANE_FALLBACK**  
  - `1` / `true` / `yes`: allow classification when `proposal_type` is missing (deprecated; logs each hit).  
  - Unset or `0`: fallback path still returns a result but logs; all callers should send `proposal_type`.  
  - After migration: remove fallback code when hit count is zero.

---

## Caller updates (done in this pass)

- **session-runner.ts** — Already canon-only (layout_change, embodiment_change, integration_change).
- **api/chat/route.ts** — Name proposals use `proposal_type: "embodiment_change"` and insert with `proposal_type` / `proposal_role`.
- **runtime-simulation.ts** — Concept path uses `proposal_type: "layout_change"` instead of requested_lane + proposal_role.
- **api/proposals/route.ts** — POST requires and validates `proposal_type`.
- **api/artifacts/[id]/create-proposal/route.ts** — POST requires `proposal_type` (no default).
- **proposal-governance-closure.test.ts** — Tests use canon `proposal_type` only; no fallback in happy path.

---

## Staging read model

- **Core:** `buildStagingBucketsLaneOnly()` returns `LaneNativeStagingModel` (lanes keyed by `lane_id`, totals.proposals + totals.byLane only).
- **Legacy:** `toLegacyStagingBuckets(laneNative)` builds `buckets` and legacy totals; used by `buildStagingBuckets()` and thus `getStagingReviewModel()`.
- New consumers should use `buildStagingBucketsLaneOnly` and, if needed, call `toLegacyStagingBuckets` at the edge only.

---

## Tests

- **canon-native-behavior.test.ts** — Covers: proposal_type validation, no DEPRECATED_LEGACY_FALLBACK on happy path, fallback gating, lane-native staging model shape, stageable lanes, deriveCanonLaneId.
- **proposal-governance-closure.test.ts** — All classification tests use explicit `proposal_type`.
