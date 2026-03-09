# Approval Rules

This document defines the rules Harvey uses to review, approve, reject, annotate, hold, or publish artifacts and governance proposals.

The Approval Rules document is different from the Approval State Machine.

- the state machine defines allowed review states
- approval rules define how decisions should be made

The goal is consistent human governance without flattening creative ambiguity.

---

## Watchouts

### Approval as Taste Policing

Approval is not meant to reward only safe or conventional output.

The Twin exists to explore.
Approval should preserve meaningful work, not force every artifact into immediate public usefulness.

### Collapsing Retention and Publication

Something can be worth keeping without being worth publishing.

A strong internal artifact may still remain:

- private
- experimental
- unfinished
- personally revealing
- context-dependent

### Binary Review Logic

Review decisions should not be only yes or no.

The system needs room for:

- hold
- annotate
- revise
- preserve privately
- publish later

### Rewriting History by Overwriting State

The latest approval state should not erase the review path.

Review history matters.

---

## 1. Purpose of Approval Rules

Approval Rules define how Harvey should interpret and act on artifacts or proposals once they reach review.

They exist to answer:

- what should be approved for retention?
- what should remain internal?
- what needs annotation?
- what should be revised before approval?
- what is not approved for publication?
- what kinds of system changes require explicit human approval?

Approval is a governance action.
It is not a synonym for quality.

---

## 2. Scope of Approval

In V1, approval rules apply to two classes of things:

### A. Creative artifacts
Examples:
- writing
- images
- audio
- video
- concepts

### B. Governance or system proposals
Examples:
- identity changes
- workflow updates
- approval logic changes
- intervention changes
- versioning changes
- constitution changes

These two classes use the same principle — Harvey approval gates adoption — but not always the same review criteria.

---

## 3. Core Principle

The Twin may generate, critique, evaluate, and propose.

Harvey decides:

- what is canonically retained
- what is annotated
- what becomes publishable
- what system evolution is adopted

This preserves the Twin's exploratory autonomy while keeping governance supervised.

---

## 4. Approval Decision Layers

Harvey should think through approval in layers.

### Layer 1: Preserve or not?
Is this worth keeping in the Twin's history, memory, or lineage?

### Layer 2: Approve as-is or with framing?
Does it need annotation, context, or revision?

### Layer 3: Internal only or publishable?
Even if approved, should it remain private, internal, staged, or public?

### Layer 4: If this is a system proposal, should it become active?
A proposal may be interesting but not yet safe to adopt.

This layered approach prevents premature collapse into a single yes/no judgment.

---

## 5. Base Review Criteria for Creative Artifacts

Harvey does not need numeric scoring to approve something.
But these criteria help structure judgment.

### Creative force
Does the artifact feel alive, compelling, or directionally meaningful?

### Identity relevance
Does it reveal something true about the Twin's emerging tendencies, even if imperfectly?

### Novelty or emergence
Does it open new territory, not just repeat surface patterns?

### Fertility
Does it create useful next steps, branches, or return potential?

### Coherence
Does the medium and form support what the artifact is trying to do?

### Retention value
Would losing this artifact weaken the Twin's history or self-understanding?

### Publication suitability
Would externalizing this artifact be appropriate, understandable, and aligned with Harvey's curation goals?

Not every approved artifact needs to score high on all criteria.
Sometimes a rough but revealing artifact should still be approved for retention.

---

## 6. Base Review Criteria for Governance or System Proposals

When Harvey reviews a proposed change, the criteria shift.

### Clarity
Is the proposed change understandable and well scoped?

### Need
Does it solve a real problem, confusion, or drift risk?

### Alignment
Does it fit the constitution and existing ontology?

### Safety
Could it weaken supervision, blur boundaries, or create uncontrolled autonomy?

### Traceability
Can the change be documented, versioned, and explained later?

### Reversibility
If the change turns out to be weak, can it be rolled back or superseded cleanly?

A proposal should not become active just because it is elegant or ambitious.
It should become active because it is useful, aligned, and governable.

---

## 7. Recommended Approval Actions

In V1, Harvey should choose among the following actions.

### Approve
Use when the artifact or proposal should be accepted as valid and retained.

### Approve with annotation
Use when approval is appropriate, but future retrieval should preserve Harvey's framing, caution, or interpretation.

### Needs revision
Use when the direction is valuable but the current form is not ready.

### Reject
Use when the item is not approved for the intended use.
For artifacts, rejection should usually mean not approved for this use, not automatic erasure.
For system proposals, rejection means not adopted.

### Archive
Use when something should remain preserved but not remain active in the current working flow.

### Approve for publication
Use only after the artifact is already acceptable for retention and external release is intentionally desired.

---

## 8. Retention Rules

Recommended V1 retention logic:

### Preserve by default when an artifact has historical or diagnostic value
Examples:
- revealing experiments
- branch points
- artifacts tied to strong critique
- outputs with high pull but low polish
- artifacts with Harvey annotation

### Do not erase simply because something is weak
Weakness may still be informative.

### Reject publication more often than retention
This keeps internal exploration rich while public curation stays selective.

### Preserve review context
If Harvey annotates or redirects something, preserve that context with the artifact.

---

## 9. Publication Rules

Publication is downstream of approval.

Before approving for publication, Harvey should ask:

- does this represent the Twin well?
- does it need context or framing?
- is it too raw, private, or incomplete for public release?
- would publication distort what the artifact actually is?
- does the surface match the artifact's maturity?

Publication should remain more selective than retention.

Recommended principle:

> many artifacts may be approved internally; fewer should be approved for publication.

---

## 10. Rules for Governance and System Changes

The following must require Harvey approval before adoption:

- constitution changes
- approval rule changes
- intervention rule changes
- evaluation interpretation changes
- creative state model meaning changes
- memory model logic changes when behavior materially changes
- versioning policy changes
- identity redefinitions that affect future runtime interpretation

Minor wording cleanup may be merged without a formal governance event only if meaning does not change.
If meaning changes, approval and change recording are required.

---

## 11. Approval History Rules

The system should preserve review history over time.

Recommended V1 rules:

- do not overwrite meaningful prior approval decisions without preserving history
- keep annotation attached to the relevant artifact or proposal
- preserve transitions such as `pending_review` → `needs_revision` → `approved`
- keep publication status separate from approval state

This matters because the path of review often explains later decisions better than the final label alone.

---

## 12. Fast Heuristics for Harvey

When uncertain, Harvey can use this lightweight decision frame.

### For artifacts
- Is it worth preserving?  
- Does it need context or revision?  
- Should it stay private?  
- Is it actually publishable yet?

### For system proposals
- Is it necessary?  
- Is it aligned?  
- Is it safe?  
- Can it be traced and reversed?

If the answer to preservation is yes but publication is no, approve internally and keep it private.
If the answer to adoption is not yet, reject or hold the proposal rather than half-adopting it.

---

## 13. V1 Canonical Rules

For V1, the following rules should hold:

- approval is a human governance action
- approval state is separate from critique, evaluation, and publication state
- retention and publication should be judged separately
- governance changes require Harvey approval before adoption
- artifacts with historical, diagnostic, or lineage value should usually be preserved even if not publishable
- annotation should remain attached when it materially affects interpretation
- meaningful review history should be preserved

---

## 14. Canonical Summary

Approval Rules tell Harvey how to govern what the Twin creates and what the Twin may become.

They exist to keep curation:

- selective without being reductive
- supervised without killing exploration
- historically traceable
- clearly separated from critique, evaluation, and publication
