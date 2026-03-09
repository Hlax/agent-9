# Versioning Policy

This document defines how the Twin's canonical artifacts, policies, and foundational documents should be versioned over time.

Versioning exists to preserve continuity while still allowing evolution.

For this project, versioning should support both:

- creative artifacts
- system / governance / policy documents

This is important because later agent development will not only create new outputs.
It will also refine rules, workflows, judgment systems, and identity structures.

---

## Watchouts

### Overwriting Canon

If a document is updated in place without version awareness, the project loses the ability to answer:

- what changed?
- when did it change?
- which version was active at the time?
- what behavior depended on that version?

### Versioning Everything Too Aggressively

Not every punctuation change needs a formal version increment.

Versioning should preserve meaningful history, not create noise that becomes unusable.

### Mixing Artifact Revision with Policy Evolution

A revised image draft and a revised approval policy are both "versions," but they are not the same kind of version.

The system should treat them as related but distinct lanes.

### Version Labels Without Change Meaning

A version number alone is not enough.

Major changes should also have:

- a changelog note
- or a change record
- or both

---

## 1. Purpose of Versioning

The Versioning Policy helps the Twin and Harvey preserve:

- continuity
- auditability
- rollback paths
- historical interpretation
- cleaner future development

It helps answer:

- which version is current?
- what older versions existed?
- which rules were active during a given session or artifact review?
- what changed between versions?
- was the change merely editorial or behaviorally meaningful?

---

## 2. Scope of This Policy

In V1, this policy applies to two lanes.

## A. Artifact Versioning
Creative outputs and their revisions.

Examples:
- writing drafts
- image iterations
- audio revisions
- edited concept artifacts

## B. System and Document Versioning
Canonical docs and rule-bearing structures.

Examples:
- constitution
- ontology notes
- glossary
- data model
- approval rules
- intervention rules
- evaluation system docs
- identity or governance specs

This second lane is essential for future agent development and self-improvement.
If system docs are not versioned, later changes become harder to trust and debug.

---

## 3. Why This Helps Future Agent Development

Yes — versioning policies and docs will help agent development later.

Key reasons:

### Stable reference points
Developers and agents can reliably know which policy or schema version they are implementing against.

### Better debugging
If behavior changes after a policy revision, the team can compare versions and identify the likely cause.

### Safer self-improvement
The Twin may later propose refinements to governance, memory, evaluation, or workflow logic.
Versioning ensures those proposals become traceable iterations rather than silent rewrites.

### Cleaner rollbacks
If a new policy causes confusion, you can revert or supersede it without losing the historical path.

### Better eval interpretation
You can analyze outputs against the version of the rules that governed them at the time.

This is especially important once the Twin becomes more agentic and starts participating in its own refinement.

---

## 4. Artifact Versioning Rules

Artifact versioning tracks creative revisions of the same underlying work.

Recommended principles:

- preserve the initial artifact as a real historical event
- allow later revisions without overwriting the original
- keep lineage links between versions
- preserve critique and approval context for important versions
- do not assume the latest version is always the best one

Examples:

- poem draft 1 → poem draft 2
- image concept A → annotated revision B
- voice note version 1 → edited version 2

Recommended artifact metadata later:

```yaml
artifact_id: uuid
parent_artifact_id: uuid | null
version_label: string | null
is_current_version: boolean
revision_reason: text | null
```

V1 does not need full implementation yet, but the policy should be explicit.

---

## 5. System and Document Versioning Rules

System and document versioning tracks evolution of canonical project docs and governing rules.

This includes foundational markdown docs, schema references, and policy-bearing documents.

Recommended principles:

- preserve meaning-bearing versions
- do not silently replace canonical governance
- keep old versions retrievable when meaning changes
- pair major version changes with changelog notes or change records
- make clear which version is currently active

Examples:

- `constitution.md` with internal version label changing from `v1.0` to `v2.0`
- `approval_rules.md` revised to a new canonical version
- `data_model.md` updated after schema meaning changes

If a document's meaning materially changes, treat that as a real version event.

---

## 6. What Counts as a Version Increment

### Patch-level change
Use for edits that do not materially change meaning.

Examples:
- typo fixes
- formatting cleanup
- wording polish with unchanged semantics

These may be tracked in git without requiring a major canonical rename.

### Minor version change
Use for meaningful clarification or expansion that preserves the same overall model.

Examples:
- adding a clearer rule explanation
- extending examples
- clarifying field usage
- adding a compatible new section

### Major version change
Use when behavior, semantics, governance meaning, or implementation expectations materially change.

Examples:
- changing approval logic
- redefining evaluation signals
- changing the constitution's core purpose meaningfully
- changing what counts as intervention or publication gating
- changing data model semantics in a way that affects implementation

Major changes should usually create:

- a new version label
- a changelog note or summary
- a change record if governance meaning changed

---

## 7. Suggested Naming Approach for Docs

For foundational docs, a practical V1 naming approach is:

- stable canonical filename in repo for the active doc
- version label inside the doc header or metadata
- optional archived copies for major historical versions when needed

Example approaches:

### Option A — stable filename + internal version label
- `approval_rules.md`
- inside doc: `Version: v1.1`

### Option B — explicit versioned filename for major milestones
- `constitution.md` with internal version label `v1.0`
- archived prior major version copy only when meaning changed materially

Recommended V1 default:

- use stable filenames for most active policy docs
- use explicit versioned filenames for major foundational milestones
- rely on git history plus change records for smaller transitions

This keeps the repo readable without losing traceability.

---

## 8. Relationship to Git

Git is the technical history layer.

But git alone is not enough as a governance layer.

Git tells you:
- that files changed
- who changed them
- when commits happened

Policy versioning should also tell you:
- whether the change was meaningful
- whether Harvey approved it
- whether it changed system behavior
- which version became canonical

So the rule is:

> git preserves raw history; versioning policy preserves canonical interpretation.

---

## 9. Relationship to Change Records

Versioning and change records should work together.

### Use versioning to identify the revision
Examples:
- v0
- v1.1
- v2

### Use change records to explain major meaning
Examples:
- approval logic separated from publication logic
- intervention policy tightened
- evaluation signal interpretation updated

Recommended rule:

- not every version bump needs a change record
- every major governance or behavior change should usually have one

---

## 10. Retrieval Rules

When the system references a rule-bearing document, it should be possible to know:

- the current active version
- whether older versions exist
- whether a change record explains major transitions
- which version governed the relevant session or artifact if that matters

This becomes more important as the Twin gains longer memory and more system complexity.

---

## 11. V1 Canonical Rules

For V1, the following rules should hold:

- both artifacts and system/policy docs are versionable
- artifact revisions should not overwrite meaningful historical versions
- governance and foundational docs should not change meaning silently
- major policy or semantics changes should create a clear version event
- major governance changes should usually also create change records
- current canonical versions should be easy to identify
- old versions should remain retrievable when meaning changed materially

---

## 12. Recommended Future Extensions

Possible later additions:

- explicit document metadata block with `version_label`, `status`, and `supersedes`
- artifact revision tables
- document changelog files
- version-aware retrieval in the runtime
- session records that reference governing policy versions
- rollback helpers for policy experimentation

These are useful later, but the V1 policy should establish the principle now.

---

## 13. Canonical Summary

Versioning preserves the Twin's continuity across both creation and self-revision.

It matters not only for artifacts, but for the rules and documents that shape the Twin's future behavior.

As the system becomes more agentic, versioning becomes part of governance, not just file management.
