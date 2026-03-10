# Identity proposal → canon system: status vs external canon

This doc compares the **Twin_V1** implementation to the external design in `twin_identity_proposal_canon_system.md` (Identity Proposal → Canon). It answers: what’s already done, and what’s not.

**Core principle (unchanged):** The Twin must not silently mutate identity. All identity changes follow: **proposal → review → approval → canon**. Harvey is the approval authority.

---

## What we already did (Twin_V1)

### Name only: full flow

| External canon idea | Twin_V1 implementation |
|---------------------|-------------------------|
| Twin proposes a **name** when readiness passes a threshold | **Naming readiness:** `identity.naming_readiness_score`, `naming_readiness_notes`, `last_naming_evaluated_at`; evaluator in `apps/studio/lib/naming-readiness.ts`; POST `/api/identity/evaluate-naming-readiness`. Chat system prompt uses low / moderate / high readiness; high (e.g. ≥0.65) allows strong proposal. |
| Proposal → review → approval | **Proposals** use `proposal_record`: `lane_type=surface`, `target_type=identity_name`. Harvey reviews on Surface → Name proposals. |
| Harvey approves → canon | **Apply name:** POST `/api/proposals/[id]/approve` with `action: "apply_name"` sets `identity.name` and `identity.name_status = 'accepted'`. |
| No silent mutation; no repeated renaming | **Anti-renaming:** If `name_status === 'accepted'`, chat does not propose a new name unless Harvey explicitly asks. PATCH `/api/identity` rejects clearing/changing `name` when `name_status === 'accepted'`. |
| Rationale / transparency | Name proposal has `title` (proposed name) and `summary` (rationale). Identity has `name_rationale` for the last proposal. |

So for **name**, we have: proposal (via chat or proposal_record) → review (Surface name queue) → approval (apply_name) → canon (identity.name + name_status=accepted). No dedicated `identity_proposal` or `identity_canon` table; the canon is the `identity` row itself.

---

## What we did not do (yet)

### Dedicated tables

- **identity_proposal** — External doc specifies a table with `proposal_id`, `identity_id`, `proposal_type`, `proposed_value`, `definition`, `confidence_score`, `rationale`, `signal_sources` (JSONB), `status` (pending | approved | rejected). We do **not** have this table. Name proposals use `proposal_record` only.
- **identity_canon** — External doc specifies a table with `canon_id`, `identity_id`, `canon_type`, `canon_value`, `definition`, `origin_proposal_id`, `approved_at`. We do **not** have this table. “Canon” for name is stored directly on `identity` (name, name_status).

### Other proposal types

The external canon lists:

- **identity_trait** (e.g. analytical, curious, systems-oriented) — not implemented.
- **philosophy_update** — not implemented (we have `identity.philosophy` but no proposal flow for it).
- **motif** (e.g. precision melancholy, cinematic minimalism) — not implemented.
- **concept_definition** (canonical concepts with definitions) — not implemented.

We have no `proposal_type` or equivalent for these; only **name** flows through proposals today.

### Signal sources and canonization record

- **signal_sources** — External doc wants each proposal to record contributing seeds, artifacts, memory_records, evaluation_signals. We do not persist this on name proposals (we have rationale in `summary` only).
- **Canonization record** — External doc wants approved proposals to write a row to `identity_canon` with `origin_proposal_id`. We only update `identity` (name, name_status); we do not write to a separate canon table.

---

## Summary

| Area | Status |
|------|--------|
| Name: proposal → review → approval → canon | **Done** (via proposal_record + apply_name + identity.name / name_status). |
| Naming readiness threshold and evaluator | **Done**. |
| No silent identity mutation; no repeated renaming | **Done**. |
| identity_proposal table | **Not done.** |
| identity_canon table | **Not done.** |
| Proposal types: trait, philosophy_update, motif, concept_definition | **Not done.** |
| signal_sources on proposals | **Not done.** |
| Formal canonization step writing to identity_canon | **Not done.** |

---

## If we extend to the full canon later

To align with the external doc we could:

1. Add **identity_proposal** (and optionally **identity_canon**) in a migration; keep name flow as-is but optionally also write name approvals into identity_canon for traceability.
2. Introduce **proposal_type** (or equivalent) and flows for identity_trait, philosophy_update, motif, concept_definition, each going through proposal → review → approval.
3. On approval, write to **identity_canon** and/or update the relevant `identity` fields (e.g. philosophy, or a new traits/motifs structure) so only approved canon affects runtime.
4. Add **signal_sources** (e.g. JSONB) to identity_proposal when that table exists.

Until then, the **name** path remains the only identity proposal → canon path, and it is implemented without the dedicated identity_proposal / identity_canon tables.
