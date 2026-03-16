# Agent-9 refactor second pass — acceptance notes (canon-native E2E)

## Goal

Repro is canon-native end to end: proposal meaning from canon, lane from canon, staging/review/counts by lane_id, no semantic escape hatches in happy path.

---

## 1. Proposal creation

| Check | Status / how to verify |
|-------|------------------------|
| **POST /api/proposals** requires `proposal_type` | ✅ Implemented. Omit body.proposal_type → 400 with message to use canon type. |
| **POST /api/proposals** rejects invalid `proposal_type` | ✅ Implemented. Invalid type → 400 "not in canon". |
| **POST /api/artifacts/[id]/create-proposal** requires `proposal_type` | ✅ Implemented. Missing → 400; no default. |
| **POST /api/artifacts/[id]/create-proposal** rejects invalid `proposal_type` | ✅ Implemented. Invalid → 400. |
| Session-runner creates only with canon types | ✅ Uses layout_change, embodiment_change, integration_change and classifyProposalLane({ proposal_type }). |
| Chat name proposals use canon type | ✅ Use embodiment_change and insert with proposal_type/proposal_role. |
| Runtime simulation uses canon type | ✅ Concept path uses proposal_type: "layout_change". |

---

## 2. Classification and fallback

| Check | Status / how to verify |
|-------|------------------------|
| Happy path does not hit deprecated fallback | ✅ All callers pass proposal_type; closure tests use proposal_type only. |
| Fallback gated by env | ✅ ALLOW_LEGACY_PROPOSAL_LANE_FALLBACK; when unset, fallback still returns but logs. |
| Instrumentation for fallback hits | ✅ logLegacyFallbackHit in classifyProposalLane (non-test env). |

---

## 3. Staging

| Check | Status / how to verify |
|-------|------------------------|
| Staging core is lane-native only | ✅ buildStagingBucketsLaneOnly returns lanes + totals.byLane; no bucket semantics. |
| Legacy shapes at edge only | ✅ toLegacyStagingBuckets adapts lane-native → buckets/legacy totals; buildStagingBuckets uses it. |
| Stageable lanes from canon | ✅ STAGEABLE_CANON_LANES (build_lane, promotion_lane); staging APIs filter by canon stageable. |
| getStagingReviewModel still returns full shape | ✅ Uses buildStagingBuckets (lane-native + legacy) so existing API unchanged. |

---

## 4. Review routing

| Check | Status / how to verify |
|-------|------------------------|
| Canonical route is /review/[laneId] | ✅ app/review/[laneId]/page.tsx; laneId from canon (build_lane, system_lane, audit_lane, promotion_lane, canon_lane). |
| Hub links to canonical lanes | ✅ review/page.tsx links to /review/${lane.lane_id}. |
| Compatibility aliases | ✅ /review/surface → redirect /review/build_lane; medium → audit_lane; system → system_lane. |
| Lane list from canon | ✅ [laneId] page validates lane via getLaneMap(); counts by db lane_type from canonLaneToDb(laneId). |

---

## 5. Counts API

| Check | Status / how to verify |
|-------|------------------------|
| Counts by lane_id | ✅ GET /api/proposals/counts returns byLane keyed by canon lane_id. |
| Optional byProposalType | ✅ Query by_proposal_type=1 returns byProposalType. |
| No Twin count keys | ✅ No identity_name, public_habitat_proposal, avatar_candidate in response. |

---

## 6. Behavior tests

| Test file | Coverage |
|-----------|----------|
| **canon-native-behavior.test.ts** | proposal_type validation; no DEPRECATED_LEGACY_FALLBACK on happy path; fallback gating; lane-native staging model; stageable lanes; deriveCanonLaneId. |
| **proposal-governance.test.ts** | Canon proposal_type classification; validateProposalType; authority. |
| **proposal-governance-closure.test.ts** | API-style classification with proposal_type only; no requested_lane in happy path. |

---

## Sign-off

- **Code changes:** Done in this pass (governance fallback gating + logging, chat/runtime-simulation/proposals/artifacts create-proposal, review [laneId] + redirects, staging lane-only core + legacy adapter, behavior tests).
- **Migration note:** `AGENT_9_REFACTOR_PASS2_MIGRATION_NOTE.md` — remaining shims and API contract changes.
- **Deletion list:** `AGENT_9_REFACTOR_PASS2_DELETION_LIST.md` — what to remove after rollout.
- **Acceptance:** This document; repo is canon-native for proposal creation, classification, staging core, review routing, and counts; escape hatches are gated or isolated at the edge.
