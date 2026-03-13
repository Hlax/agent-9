## Description

<!-- What does this PR do? -->

---

## Implementation Checklist (architecture-sensitive changes)

If this PR touches **routes, proposal contracts, snapshot logic, governance, staging/public read paths, or promotion**, confirm below. See **docs/05_build/IMPLEMENTATION_CHECKLIST.md** for full checklist.

- [ ] **Ownership:** Module owning this change is identified (Runtime / Governance / Staging / Promotion / Public).
- [ ] **Contract:** No contract change, OR contract change is documented.
- [ ] **Public truth:** Public read path remains snapshot-backed; no new source of public truth.
- [ ] **Governance:** No governance bypass; transitions use canonical helpers.
- [ ] **Runtime:** Runtime remains proposal-only (no approve/publish/snapshot).
- [ ] **Staging:** Staging remains candidate-only (does not define public truth).
- [ ] **Promotion:** Promotion creates new snapshot row only; existing snapshots not modified.
- [ ] **Projections:** No projection table treated as canonical.
- [ ] **Data flow:** Flow follows Runtime → Proposal → Governance → Staging → Promotion → Public Snapshot (no skips).
- [ ] **Docs:** Architecture docs updated if contracts or boundaries changed.
- [ ] **Tests:** Tests added or updated for touched contracts.

---

## Notes

<!-- Optional: link to checklist run, doc updates, test files. -->
