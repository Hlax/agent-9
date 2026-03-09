# Runtime Invariants

These rules are mandatory implementation invariants for the Twin scaffold.

If code behavior conflicts with any invariant below, the code should be treated as incorrect.

---

## 1. Judgment Separation

- self critique is not evaluation
- evaluation is not approval
- approval is not publication
- publication is not deletion

No service or UI action should collapse these layers.

---

## 2. Artifact Lifecycle Invariants

- new artifacts begin as `draft`
- review-eligible artifacts may enter `pending_review`
- Harvey approval changes approval state
- publication changes publication state
- `approved_for_publication` does not make an artifact public by itself
- `published` must only occur after an intentional human-triggered release action

---

## 3. Retention Invariants

- `rejected` does not mean deleted
- `archived` does not mean deleted
- artifacts may remain historically significant without being active or public
- approval history must remain auditable

---

## 4. Surface Invariants

- staging habitat is not the public habitat
- staging previews are not publication
- public habitat must read only intentionally published items
- habitat changes require a staged review path
- the Twin must not directly rewrite the production habitat

---

## 5. Governance Invariants

- Harvey approval gates adoption of system changes
- Harvey approval gates promotion of public habitat releases
- coding agents must not silently redefine canonical entities or enums
- coding agents must not treat pseudocode as production law

---

## 6. Memory Invariants

- runtime events may update memory before Harvey review
- memory updates do not imply approval
- thread association should preserve continuity when possible
- a new thread should not be created automatically unless justified

---

## 7. Observability Invariants

The system must log or preserve records for:

- session start and end
- artifact creation
- critique creation
- evaluation creation
- approval transitions
- publication transitions
- staging promotion decisions
- change proposal decisions

---

## 8. Release Invariants

### Artifact release
Artifact release is a data/state change.
It may update what appears in public habitat.

### Surface release
Surface release is a code/config/deployment promotion event.
It must pass through staging before public promotion.

These are not the same release type and must not be treated interchangeably.
