# Twin Glossary

This glossary defines the Twin's canonical vocabulary for V1 foundation work.

These terms should remain stable across system docs, schema design, implementation, and agent instructions unless Harvey approves a redefinition.

## Artifact
A generated creative output produced by the Twin.

Artifacts are expressions of exploration, not the end goal of the system.

For V1, artifact mediums are:
- writing
- image
- audio
- video
- concept

## Artifact Medium
The primary form of an artifact.

For V1:
- `writing` = text-based creative output
- `image` = still visual output
- `audio` = sound-based output
- `video` = moving-image output
- `concept` = structured creative thinking output that is still treated as a real artifact

## Artifact Lifecycle Status
The storage/version lifecycle condition of an artifact record.

Artifact lifecycle status is not human judgment and is not public-release state.

For V1 artifact lifecycle status values are:
- `draft`
- `current`
- `superseded`

Approval-related outcomes are represented through **Approval State**.
Public-release outcomes are represented through **Publication State**.

## Twin
The full creative system across time.

The Twin includes identity, memory, sessions, judgment, governance, and outputs. It is larger than any single generation call or chat.

## Identity
The Twin's current self-model.

Identity may include self-description, naming, creative values, embodiment direction, approved changes, and other coherent signals of who the Twin is becoming.

## Project
A bounded area of work that groups related sessions, ideas, threads, and artifacts.

Projects help organize larger efforts that span multiple outputs.

## Idea
A discrete concept seed, question, direction, or creative proposition.

Ideas are smaller units than projects or idea threads.

## Idea Thread
A larger line of creative continuity that tracks how related ideas and artifacts evolve across time.

An idea thread may contain multiple ideas and many artifacts.

## Creative Session
A bounded period of work performed by the Twin.

A session may explore, continue, return, reflect, or rest.

Sessions may reference prior work, source items, or projects and may produce artifacts.

## Session Mode
The operating mode of a creative session.

For V1:
- `continue`
- `return`
- `explore`
- `reflect`
- `rest`

## Creative Drive
A motivating force that influences what the Twin chooses to do.

Constitutional examples include coherence, expression, emergence, expansion, return, reflection, curation, and habitat.

## Creative State
The Twin's internal creative condition.

Creative state affects task selection, exploration behavior, and return logic.

## Creative State Snapshot
A recorded representation of creative state at a point in time.

For V1, snapshots are stored at the session level.

## Self Critique
The Twin’s internal post-generation review step.

Self critique happens after an artifact is generated and before evaluation scoring or human review.

Its purpose is to describe what the artifact attempted, what worked, what failed, and whether the direction should continue, branch, shift medium, archive, or stop.

## Critique Record
A structured record produced by self critique.

A critique record captures qualitative judgment about an artifact, such as intent, strength, originality, energy, unresolved potential, medium fit, coherence, fertility, and an overall recommendation.

A critique record is not the same as an evaluation signal.

## Critique Outcome
The practical next-step recommendation produced by a critique record.

For V1, critique outcomes may include:
- `continue`
- `branch`
- `shift_medium`
- `reflect`
- `archive_candidate`
- `stop`

## Evaluation Signal
A structured judgment signal used to evaluate an artifact, idea, thread, or related output.

Evaluation signals are the scored or structured layer of judgment that follows self critique.

Core canonical examples include:
- alignment score
- emergence score
- fertility score
- pull score
- recurrence score

Future optional signals may include:
- resonance score

Evaluation signals are not the same as critique records.

## Proposal Record
A reviewable record for a surface proposal or system proposal.

Proposal records exist so staging releases, habitat changes, and system changes do not get forced into artifact approval language.

## Approval State
The human-facing review status of an artifact after generation, self critique, and evaluation.

Approval state is not the same as critique outcome, evaluation signal, artifact status, or publication state.

For V1, approval states may include:
- `pending_review`
- `approved`
- `approved_with_annotation`
- `needs_revision`
- `rejected`
- `archived`
- `approved_for_publication`

## Publication State
The release-facing visibility state of an artifact.

Publication state is not the same as critique outcome, evaluation signal, artifact lifecycle status, or approval state.

For V1, publication states are:
- `private`
- `internal_only`
- `scheduled`
- `published`

## Approval Lane
The review category a decision belongs to.

For V1, the canonical lanes are:
- `artifact`
- `surface`
- `system`

A decision in one lane should not silently apply to another lane.

## Approved With Annotation
An artifact that is accepted, but preserved with meaningful Harvey context, guidance, or framing attached.

## Needs Revision
An artifact that is not rejected, but should be revised before approval or release.

## Approved for Publication
An artifact that is approved for external-facing release.

This is not the same as already being published.

## Human Feedback
A review signal provided by Harvey.

Examples may include approval, rejection, ranking, annotation, tagging, and comments.

Human feedback has stronger influence when explicit and annotated.

## Archive Entry
A record of paused work that may later be revisited.

Archive preserves return potential rather than treating inactive work as permanently dead.

## Change Record
A formal record describing a meaningful change to identity, workflow, system logic, habitat, or another important area.

Change records preserve continuity and explain why change occurred.

## Source Item
A seeded piece of input material that the Twin can use during creative work.

Examples may include notes, prompts, transcripts, images, references, fragments, or imported assets.

## Memory Record
A stored internal memory unit that captures something the Twin should remember.

A memory record is not the same as a source item or artifact.

## Theme
A lightweight recurring motif or conceptual pattern.

Themes help the Twin track long-term recurrence across ideas and artifacts.

## Tag
A flexible classification label.

Tags are lightweight metadata and do not need to be ontology-stable.

## Publication
The act of intentionally surfacing an artifact to a public-facing environment.

Publication is governed by Harvey approval and is separate from generation quality.

## Draft
An artifact that has been generated but not yet resolved through review.

## Approved
An approval-state outcome meaning the artifact is worth keeping, developing, or preserving.

Approved is not the same as published.

## Rejected
An approval-state outcome meaning the artifact is not approved for its intended role in its current form.

Rejected is not the same as deletion.

## Archived
Paused work that may later be revived.

For artifacts, `archived` is a lifecycle state.
In approval flow, `archived` is a human review state meaning the artifact is intentionally preserved but not active.
Archived is not equivalent to deletion or rejection.

## Published
An artifact that has been intentionally surfaced publicly.

## Canonical Term
A vocabulary term whose meaning should remain stable across docs and implementation.

Build agents should not silently redefine canonical terms.

## Generation Run
A provenance record describing one generation attempt.

A generation run may preserve provider, model, prompt snapshot, context snapshot, and timing metadata so the runtime remains auditable and replay-friendly.
