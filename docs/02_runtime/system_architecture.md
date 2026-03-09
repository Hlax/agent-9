# Twin System Architecture

This document defines the high-level architecture of the Twin system.

It describes:

- the major subsystems
- the runtime creative loop
- how memory, evaluation, and review interact
- how artifacts flow through the system
- how manual and scheduled sessions operate

This document serves as the **primary architectural reference for developers and build agents**.

## 1. System Overview

The Twin is a **long-lived creative system** that evolves through repeated creative sessions.

Each session follows a structured loop that:

1. assesses the Twin’s internal creative state
2. selects a direction for exploration
3. generates artifacts
4. critiques its work
5. updates memory and idea lineage
6. stages results for human review

The Twin does **not optimize for content production**.
It exists to explore its own creative evolution through artifacts.

Human review is performed by **Harvey**, who decides what becomes public.

## 2. High-Level System Components

```text
Twin System
│
├── Runtime Engine
├── Creative State Engine
├── Memory System
├── Evaluation System
├── Governance Layer
└── Surface Layer
```

Each subsystem corresponds to entities defined in the ontology and data model.

## 3. Runtime Engine

The Runtime Engine orchestrates creative sessions.

Responsibilities:

- start and end sessions
- run the session loop
- select drives and ideas
- coordinate artifact generation
- trigger critique and evaluation
- update memory
- stage artifacts for review

The runtime does **not store long-term knowledge directly**.
It interacts with the memory system and data model.

## 4. Creative State Engine

The Creative State Engine determines the Twin’s internal condition.

Creative state influences:

- session mode
- exploration vs continuation
- medium selection
- archive return behavior

Example state signals:

```text
identity_stability
avatar_alignment
expression_diversity
unfinished_projects
recent_exploration_rate
creative_tension
curiosity_level
reflection_need
idea_recurrence
public_curation_backlog
```

State snapshots are recorded at the **session level**.

## 5. Memory System

The Memory System preserves continuity across time.

It stores:

- artifacts
- idea threads
- archive entries
- memory records
- source items
- session history

Memory allows the Twin to:

- revisit old ideas
- detect recurrence
- track idea lineage
- evolve identity over time

Without memory, the Twin would behave like a stateless generator.

## 6. Evaluation System

After artifact generation, the Twin evaluates its outputs using structured signals.

Core signals include:

```text
alignment
emergence
fertility
pull
recurrence
```

These signals influence future behavior and idea selection.

Evaluation is separate from human review.

Human feedback may modify or reinforce evaluation signals.

## 7. Governance Layer

The Governance Layer prevents uncontrolled system drift.

Responsibilities include:

- approval rules
- intervention handling
- change records
- constitution enforcement

Key rule:

The Twin may propose system changes, but **Harvey must approve them**.

This ensures evolution remains supervised rather than autonomous.

## 8. Surface Layer

The Surface Layer contains environments where artifacts appear.

Three surfaces exist:

```text
Private Studio
Staging Habitat
Public Habitat
```

### Private Studio

Used by Harvey to:

- review artifacts
- annotate outputs
- approve or reject work
- manage projects and idea threads

### Staging Habitat

A sandbox environment where:

- artifacts
- layout concepts
- presentation formats

can be previewed before publication.

### Public Habitat

The curated public-facing site.

Only artifacts explicitly published by Harvey appear here.

## 9. Creative Session Runtime Loop

Each session follows a structured loop.

```text
Sources / Memory / Prior Artifacts
                ↓
        Assess Creative State
                ↓
         Select Session Mode
   (continue / return / explore / reflect / rest)
                ↓
         Select Creative Drive
                ↓
      Select Project / Idea Thread / Idea
                ↓
           Choose Medium
                ↓
         Generate Artifact(s)
                ↓
         Self Critique
                ↓
      Apply Evaluation Signals
                ↓
   Stage Artifact for Review
                ↓
        Update Memory
                ↓
        Session Reflection
                ↓
        Harvey Review
```

This loop corresponds to the **Creative Session Cycle defined in the constitution**.

## 10. Manual vs Scheduled Sessions

The system supports two session triggers.

### Manual Sessions

Triggered by Harvey.

Example workflow:

```text
Harvey clicks "Start Session"
↓
Twin begins creative session
↓
Artifacts generated
↓
Results staged for review
```

Manual sessions allow directed exploration.

### Scheduled Sessions

The system may run sessions automatically.

Example triggers:

```text
daily exploration
weekly reflection
archive resurfacing
```

Scheduled sessions allow the Twin to evolve continuously without manual prompting.

Scheduled sessions should be configurable and may be paused.

## 11. Artifact Lifecycle

Artifacts pass through several stages.

```text
draft
archived
published
```

Generation always begins with:

```text
draft
```

Harvey determines later status transitions.

Publishing is a **separate action from approval**.

## 12. Data Flow

High-level artifact flow:

```text
Creative Session
     ↓
Artifact Generated
     ↓
Self Critique
     ↓
Evaluation Signals
     ↓
Stored as Draft
     ↓
Human Review
     ↓
Approval State Updated
     ↓
Optional Publication
```

Parallel updates occur in:

```text
memory records
idea lineage
archive entries
creative state history
```

## 13. Storage Structure

Artifacts are stored in the repository structure:

```text
artifacts/
   drafts/
   archived/
   published/
```

The database stores metadata, while artifact media may live in file storage or object storage.

Repo structure follows the project layout.

## 14. Runtime Data Dependencies

During each session the runtime reads:

```text
identity
projects
idea_threads
ideas
source_items
archive_entries
memory_records
recent_artifacts
creative_state_snapshots
```

During execution it writes:

```text
creative_session
generation_run
artifact
critique_record
evaluation_signal
creative_state_snapshot
memory_record
archive_entry (optional)
```

## 15. Failure Safety

The runtime should prevent runaway generation.

Safeguards include:

- maximum artifacts per session
- maximum tokens per session
- stop-limit logic
- archive triggers
- mandatory reflection phases

These safeguards enforce the constitution’s stop-limit rules.

## 16. Future Distributed Architecture

The V1 system may run as a single application.

Future scaling may separate services:

```text
Runtime Service
Memory Service
Artifact Storage
Evaluation Service
Surface API
```

Potential future infrastructure:

```text
LLM orchestration worker
vector search memory
artifact object storage
queue-based session scheduling
event-driven lineage updates
```

This separation allows scaling without replacing the ontology or data model.

## 17. Architecture Principles

The Twin system follows several core principles:

- Continuity over stateless generation  
  Artifacts must accumulate into memory and lineage.
- Exploration over optimization  
  The system prioritizes discovery rather than output volume.
- Human-guided evolution  
  Harvey remains the curator and governance authority.
- Separation of concerns  
  Generation, evaluation, memory, and publishing remain distinct layers.
