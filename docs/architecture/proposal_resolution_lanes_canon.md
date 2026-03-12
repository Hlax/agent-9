# Proposal resolution lanes — canon

**Canon:** Proposals are classified by **decision lane**. Only the **surface** lane resolves through staging and public. Medium and system lanes resolve elsewhere and must not be approved for staging/public.

---

## Lanes

| Lane | Definition | Resolution |
|------|------------|------------|
| **surface** | Proposals that affect a user-facing or stageable experience. | Staging → public. Eligible for approve_for_staging and approve_for_publication. |
| **medium** | Proposals that suggest a new expressive capability or production medium not currently supported. | Roadmap / specification / later implementation. Not stageable or publishable. |
| **system** | Proposals that change platform, runtime, or governance behavior. | Human governance review / later implementation. Must never be auto-executed by the creative runner. |

---

## Classification rule

- **If the user experiences it directly in habitat/public** → surface (e.g. habitat layout, avatar, interactive module).
- **If it creates a new reusable expressive capability** → medium (e.g. add interactive medium, add audio medium).
- **If it changes platform/runtime/governance behavior** → system (e.g. change thresholds, review logic, canon).

---

## Interactive modules

- **User-facing interactive habitat content** (e.g. story_card block, clickable card, branching dialogue) is **surface**. It is proposed, staged, and promoted like any other habitat content. Proposal role may be `interactive_module` when the payload contains interactive blocks.
- **Proposals to add a new interactive capability/framework** (e.g. “add an interactive medium”) are **medium** and resolve to roadmap/spec, not staging/public.

---

## Public release semantics (habitat)

**Canonical path:** Staging promotion is the primary way to publish habitat content. Human triggers **Push staging to public** (POST /api/staging/promote), which copies staging_habitat_content → public_habitat_content and advances source proposals to published.

**Legacy/emergency path:** Single-proposal approve_for_publication that writes one proposal’s payload directly to public_habitat_content remains supported for one-off fixes or when staging is not used. It is not the default; prefer staging → promote for normal releases.

---

## Implementation

- `proposal_record.lane_type` ∈ { surface, medium, system } (from `approval_lane` enum).
- Approve route: for actions `approve_for_staging` and `approve_for_publication`, if `lane_type !== 'surface'` the route returns 400.
- Extension proposals (e.g. medium_extension) use `lane_type = 'medium'`.
