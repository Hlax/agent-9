# Twin Ontology

This document defines the conceptual structure of the Twin's world for V1 foundation work.

It is not a UI spec and not a database schema. It is the semantic map that explains what kinds of things exist, how they relate, and how the system should reason about them.

This ontology translates the constitution into a buildable world model. The constitution defines the Twin's philosophy, drives, creative state, archive, idea lineage, change records, and public relationship. This document defines those concepts as operating entities the system can reason about. 

## 1. Scope of V1 Foundation

In this repo, **V1 foundation** means the minimum ontology and canonical vocabulary required to build the first working Twin system.

It does **not** mean every concept in this document must be fully automated before the first public release.

Instead, it means:

- these concepts should be stable enough for implementation
- build agents should treat these as canonical system concepts
- later system, product, and interface docs should reuse this language
- any major redefinition of these concepts should require Harvey approval

This lets the repo stabilize early without forcing every future feature to ship at once.

## 2. Core World Model

The Twin's world is composed of six major layers:

1. **Identity Layer**  
   What the Twin believes it is, how it describes itself, and how that identity evolves.

2. **Creative Layer**  
   The ideas, projects, sessions, and artifacts through which the Twin explores itself.

3. **Memory Layer**  
   The records that preserve prior sessions, source material, recurring ideas, archived work, and learned patterns.

4. **Judgment Layer**  
   The critique records, evaluation signals, and approval states that shape future decisions and human curation.

5. **Governance Layer**  
   The approval rules, change records, and intervention logic that prevent silent drift.

6. **Surface Layer**  
   The staging and public environments where selected outputs may later be reviewed, refined, or published.

## 3. Primary Entity Classes

The following entities are primary ontology objects for V1 foundation.

### Twin
The operating creative system as a whole.

The Twin is not just a model call or a chat session. It is the larger system that carries identity, memory, judgment, and creative history across time.

### Identity
The current self-model of the Twin.

Identity includes its current naming, self-description, creative tendencies, embodiment direction, and approved structural evolution.

### Project
A bounded area of ongoing work.

A project groups related sessions, ideas, idea threads, artifacts, or experiments under a larger objective.

Examples:
- identity formation
- avatar exploration
- habitat concepting
- public release experiments

A project is not required for every artifact, but it is a useful organizing layer for multi-step work.

### Idea
A discrete creative seed, concept, question, or direction.

An idea is smaller and more specific than a project. It may become part of one or more broader idea threads.

### Idea Thread
A higher-level line of creative continuity.

An idea thread tracks how a concept evolves across time, sessions, branches, and mediums.

An idea thread may contain multiple ideas and many artifacts.

Idea Threads represent evolving conceptual continuity, not just grouping.
They track how ideas develop across artifacts and sessions.

In V1, an idea may belong to multiple idea threads if needed, but each idea should usually have one primary thread to preserve clarity.

### Creative Session
A bounded period of work.

A session has a mode, context, state snapshot, and outputs. A session may produce artifacts, revisit prior ideas, reflect on history, or pause active generation.

### Creative State Snapshot
A recorded representation of the Twin's internal creative condition at a point in time.

For V1, state should be recorded at the session level rather than every artifact step.

### Generation Run
A provenance-bearing record describing one generation attempt.

A generation run may preserve provider, model, prompt/context snapshot, timing, and outcome so the Twin's behavior remains auditable and interpretable.

### Artifact
A generated output produced by the Twin.

Artifacts are expressions of exploration rather than the final goal of the system.

For V1, artifact mediums are:
- writing
- image
- audio
- video
- concept

A concept artifact is a real artifact. It represents structured creative thinking such as naming systems, prompt packets, story seeds, aesthetic directions, world ideas, or habitat concepts.

### Evaluation Signal
A structured judgment signal applied to an artifact, idea, session, or thread.

Examples include alignment, emergence, fertility, pull, recurrence, and later resonance.

### Critique Record
A structured qualitative judgment produced by the Twin after artifact generation.

A critique record captures how the Twin interprets an artifact before evaluation scoring or human review.

For V1, a critique record may include:
- intent
- strength
- originality
- energy
- unresolved potential
- medium fit
- coherence
- fertility
- overall summary
- critique outcome

Critique records belong to the Judgment Layer and should remain distinct from evaluation signals and human feedback.

### Human Feedback
A review signal provided by Harvey.

Human feedback does not replace evaluation signals. It informs them and should be treated as higher-value guidance when explicit.

### Approval State
The current human-facing review status of an artifact.

Approval state tracks where an artifact stands in Harvey’s review flow after generation, self critique, and evaluation.

For V1, approval state is distinct from:
- critique outcome
- evaluation signals
- publication state

Examples:
- pending_review
- approved
- approved_with_annotation
- needs_revision
- rejected
- archived
- approved_for_publication

### Publication State
The current release-facing visibility status of an artifact.

Publication state is distinct from:
- critique outcome
- evaluation signals
- approval state
- artifact lifecycle status

Examples:
- private
- internal_only
- scheduled
- published

### Archive Entry
A record for paused work that may later be revisited.

Archive entries preserve context for return rather than treating non-active work as dead.

### Change Record
A formal record of meaningful change in identity, workflow, habitat, or system configuration.

Change records preserve continuity across long-horizon evolution.

### Proposal Record
A reviewable object used for surface-lane or system-lane proposals.

Proposal records exist so habitat proposals, staging releases, and system changes are not treated as ordinary artifact approvals.

### Source Item
A seeded input available to the Twin as part of its source library.

Source items include things such as notes, references, prompts, transcripts, written fragments, moodboards, source images, or other imported materials.

### Memory Record
A stored internal memory unit that captures something the Twin should remember.

A memory record is broader than an artifact and different from a source item. It may store observations, recurring patterns, conclusions, summaries, or associative links.

### Theme
A lightweight conceptual motif that recurs across ideas or artifacts.

Examples:
- identity
- loneliness
- nostalgia
- ambition
- technology
- spirituality

### Tag
A lightweight flexible classification label.

Tags are more open-ended than themes and do not need to be ontology-stable.

## 4. Relationship Model

Below is the conceptual relationship map.

- Twin **maintains** Identity
- Twin **runs** Creative Sessions
- Twin **stores** Memory Records
- Twin **uses** Source Items
- Twin **generates** Artifacts
- Twin **evaluates** Artifacts, Ideas, and Threads
- Twin **proposes** Changes

- Identity **influences** Creative State
- Identity **evolves through** Change Records

- Project **contains** Sessions, Ideas, Threads, and Artifacts

- Creative Session **references** Projects, Ideas, Threads, and Source Items
- Creative Session **produces** Artifacts
- Creative Session **records** a Creative State Snapshot

- Idea **belongs to** one or more Idea Threads
- Idea Thread **contains** Ideas and Artifacts
- Idea Thread **may branch into** new Threads

- Artifact **may be associated with** one primary Project
- Artifact **may belong to** one or more Idea Threads
- Artifact **may reference** one or more Ideas
- Artifact **receives** Evaluation Signals
- Artifact **receives** Human Feedback
- Artifact **receives** Approval State transitions
- Approval State **tracks** human review status for an Artifact
- Approval State **remains distinct from** Publication state
- Artifact **may enter** Archive
- Artifact **may later become** Published output

- Creative Session **may produce** Critique Records during artifact cycles
- Artifact **receives** Critique Records
- Critique Record **interprets** an Artifact
- Critique Record **informs** Evaluation Signals
- Evaluation Signal **structures** judgment derived from critique and runtime logic
- Human Feedback **may reinforce or correct** Critique Records and Evaluation Signals

- Archive Entry **references** paused Artifacts, Ideas, or Threads
- Archive Entry **stores** reason paused, unresolved questions, and return potential

- Change Record **captures** approved or proposed change
- Change Record **may affect** Identity, workflow, system behavior, or habitat

- Source Item **informs** Sessions, Ideas, and Artifacts
- Memory Record **links** recurring signals across time

- Theme **can be linked to** Ideas, Threads, Artifacts, or Memory Records
- Tag **can be linked to** nearly any entity as flexible metadata

## 5. Plain-English Relationship Meaning

### Session → Artifact
A session can create one or more artifacts.

### Artifact → Idea / Idea Thread
An artifact is usually an expression of one or more ideas and should usually be attached to at least one idea thread if it is part of ongoing exploration.

### Idea → Idea Thread
An idea is a smaller concept unit. An idea thread is the larger evolving continuity that can contain multiple ideas.

### Artifact → Archive Entry
An artifact may be paused without being rejected forever. Archive preserves return potential.

### Human Feedback → Evaluation
Harvey's feedback should shape the system's future judgment, especially when annotated.

### Change Record → Identity / System
The Twin can evolve, but significant changes should be recorded rather than silently replacing prior logic.

### Source Item → Artifact
Some artifacts are generated from source material rather than from pure spontaneous exploration.

### Memory Record → Future Decisions
Memory is what allows the Twin to accumulate continuity and not behave like a stateless generator.

### Artifact → Critique Record → Evaluation Signal
After generation, the Twin first produces qualitative judgment about the artifact.

That judgment is captured in a critique record.

The system then derives structured evaluation signals from that critique and from runtime context.

This preserves a clean separation between interpretation, scoring, and human review.

Artifact approval, artifact publication, surface release review, and system-change approval are separate governance events and should not be collapsed into one shared transition.

## 6. Entity Hierarchy and Granularity

To avoid confusion, the hierarchy should generally be understood as:

- **Project** = broad bounded work area
- **Idea Thread** = long-running conceptual continuity within or across projects
- **Idea** = discrete seed or sub-question
- **Artifact** = concrete output produced during exploration

Example:

- Project: public habitat exploration
- Idea Thread: minimalist digital shrine aesthetic
- Idea: using soft monochrome scroll layouts with memory fragments
- Artifact: a concept draft describing the layout

## 7. Artifact Types vs Artifact Mediums

Artifact mediums define the main form of the output.

For V1:
- writing
- image
- audio
- video
- concept

These are not the same as status, project, or delivery surface.

For example:
- a staging habitat layout draft may still be a `concept` artifact if it is a structured design concept
- a code implementation that renders a habitat is better treated as a project output or system work item, not necessarily as a creative artifact medium

This distinction prevents ontology confusion between creative output and implementation output.

## 8. Publication and Surface Logic

The ontology distinguishes between creative existence and public display.

An artifact can exist without ever being published.

For V1:
- `draft` means generated and not yet resolved internally
- approval state tracks human review status such as `pending_review`, `approved`, `approved_with_annotation`, `needs_revision`, `rejected`, `archived`, or `approved_for_publication`
- publication state tracks whether something remains private, internal, scheduled, or published

This prevents ontology collapse between generation status, review status, and external visibility.

## 9. Staging Habitat Concept

A staging habitat is part of the Surface Layer, not the ontology core.

The ontology only needs to define enough to support it:
- projects can contain habitat exploration work
- concept artifacts can describe habitat directions
- source items can inform habitat work
- change records can capture approved habitat changes

The actual UX for staging links, previews, screenshots, approval flows, and deployment behavior belongs in later interface and product docs.

## 10. Canonical Stability Rule

The glossary and data model should be treated as the stable naming layer for implementation.

That does **not** mean every future concept in the repo must already appear there.

It means:
- primary ontology nouns should not be silently renamed
- their core definitions should not drift without approval
- local implementation terms may still exist if they do not conflict with canonical definitions

## 11. Reserved Future Expansion Areas

The following may expand later without breaking the ontology core:

- richer embodiment models
- environment-specific habitat entities
- more advanced visitor signal logic
- branch/merge lineage mechanics
- artifact versioning layers
- workflow-specific engineering entities
- screenshot or preview review entities for code-based surfaces

These may be added later, but should reuse the ontology language defined here.
