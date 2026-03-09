# Idea Lineage

This document defines how ideas evolve across time within the Twin
system.

Idea Lineage tracks the structural history of creative development
across:

-   ideas
-   idea threads
-   artifacts
-   sessions
-   branches
-   returns

While the Memory Model preserves meaning and observations about past
work, Idea Lineage preserves the **structural evolution of creative
exploration**.

Lineage answers questions such as:

-   What ideas evolved from this one?
-   Which artifacts belong to the same conceptual thread?
-   When did an idea branch into a new direction?
-   When was an archived idea revived?
-   How has a theme evolved across sessions?

The lineage system allows the Twin to behave as a **long-horizon
creative system** rather than a generator that forgets where ideas came
from.

------------------------------------------------------------------------

## Watchouts

### Thread Explosion

Autonomous systems tend to generate new threads too easily. If every
small variation becomes a new thread, the lineage graph becomes
fragmented.

Mitigation:

-   bias continuation of existing threads
-   prioritize high‑recurrence ideas
-   limit new threads when density is high

### False Lineage

Not every artifact belongs to the same conceptual path. Incorrect
linking weakens lineage meaning.

Artifacts should only link when they share:

-   conceptual continuity
-   recurring theme
-   deliberate continuation
-   meaningful evolution

------------------------------------------------------------------------

## 1. Purpose of Idea Lineage

Idea Lineage tracks how creative exploration unfolds across time.

It allows the Twin to:

-   evolve ideas across sessions
-   branch directions from existing work
-   detect recurring concepts
-   return to earlier ideas intelligently
-   preserve conceptual continuity

Without lineage tracking, the Twin would generate artifacts without
understanding their relationship across time.

------------------------------------------------------------------------

## 2. Core Lineage Entities

### Idea

A discrete creative seed or direction.

Examples:

-   minimalist shrine-like digital habitat
-   AI narrator remembering prior viewers
-   nostalgic memory fragments as interface elements

### Idea Thread

A long-running conceptual continuity containing multiple ideas and
artifacts.

Example thread: *Digital shrine aesthetic*

Ideas inside thread:

-   monochrome scroll layout
-   memory fragments as design objects
-   quiet ambient audio environments

### Artifact

A concrete output generated during a session.

Examples:

-   concept document describing a UI layout
-   image draft exploring visual direction
-   written narrative fragment

Artifacts express ideas and attach to threads.

------------------------------------------------------------------------

## 3. Lineage Structure

The lineage model is a **directed evolutionary graph**.

Example:

    Thread A
    ├ Artifact 1
    ├ Artifact 2
    └ Branch → Thread B
                ├ Artifact 3
                └ Artifact 4

Threads may:

-   extend
-   branch
-   merge (rare)
-   revive from archive

------------------------------------------------------------------------

## 4. Thread Evolution

Typical evolution:

    Idea introduced
    ↓
    Artifact exploration
    ↓
    More artifacts in thread
    ↓
    Recurrence increases
    ↓
    Thread stabilizes

Signals strengthening a thread:

-   recurring artifacts
-   strong pull scores
-   repeated session returns
-   Harvey approval

------------------------------------------------------------------------

## 5. Thread Branching

Branch when exploration diverges significantly.

Triggers:

-   new conceptual direction
-   medium change alters context
-   conceptual tension appears
-   intentional alternate exploration

Example:

    Thread: Digital shrine aesthetic
    ↓
    Branch: Interactive memory shrine

Branch threads store origin via `parent_thread_id`.

A new artifact should **not** create a new thread if it is only a
refinement, variation, or continuation of the same conceptual direction.

------------------------------------------------------------------------

## 6. Branching Signals

Branching may occur when:

-   emergence score is high
-   recurrence drops
-   a new idea repeatedly diverges
-   artifacts split thematically

Branching should represent meaningful conceptual divergence.

------------------------------------------------------------------------

## 7. Thread Revival

Archived threads may revive when:

-   recurrence increases
-   new context appears
-   related project emerges
-   Harvey explicitly marks return

Example:

    Thread A active
    ↓
    Thread A archived
    ↓
    Recurrence detected
    ↓
    Thread A revived

Revived threads continue lineage rather than restarting.

------------------------------------------------------------------------

## 8. Idea Attachment

Artifacts usually reference:

**Primary Idea**

-   central concept explored

**Secondary Ideas**

-   optional additional connections

------------------------------------------------------------------------

## 9. Thread Association

Artifacts typically belong to one primary thread.

They may also link to additional threads when:

-   synthesizing ideas
-   bridging conceptual areas

Primary assignment keeps lineage readable.

------------------------------------------------------------------------

## 10. Recurrence Tracking

Example recurrence growth:

-   1 appearance → 0.20
-   2 appearances → 0.40
-   3 appearances → 0.55
-   multiple sessions → 0.70+

Higher recurrence increases likelihood of:

-   continuation
-   return sessions
-   branching

------------------------------------------------------------------------

## 11. Lineage Events

**Extend**

-   artifact continues thread

**Branch**

-   new thread emerges

**Revive**

-   archived thread resumes

**Merge (rare)**

-   threads converge

**Synthesize**

-   artifact connects threads

------------------------------------------------------------------------

## 12. Lineage Updates During Sessions

After artifact generation:

1.  artifact saved
2.  evaluation signals applied
3.  idea associations recorded
4.  thread associations recorded
5.  recurrence updated

If branching:

1.  new thread created
2.  `parent_thread_id` set
3.  artifact becomes first item

------------------------------------------------------------------------

## 13. Lineage vs Memory

Lineage records structural relationships.

Memory records meaningful observations.

Lineage answers **what happened**.\
Memory answers **why it mattered**.

------------------------------------------------------------------------

## 14. Lineage vs Archive

Archive stores paused work.

Lineage preserves structural history.

Revived threads continue their lineage.

------------------------------------------------------------------------

## 15. Lineage Retrieval

Runtime considers signals such as:

-   recurrence_score
-   pull_score
-   thread activity
-   archive return potential
-   Harvey annotations
-   project priority

Strong lineage signals bias continuation.

------------------------------------------------------------------------

## 16. Visualization Potential (Future)

Possible visualizations:

-   thread trees
-   artifact timelines
-   recurrence heatmaps
-   branch maps
-   idea evolution graphs

------------------------------------------------------------------------

## 17. Design Principles

**Continuity** --- ideas evolve across sessions\
**Evolution** --- branching allowed\
**Clarity** --- threads represent real conceptual paths\
**Stability** --- avoid excessive fragmentation\
**Recoverability** --- archived ideas remain accessible

------------------------------------------------------------------------

## 18. Summary

Idea Lineage tracks how ideas evolve over time.

It enables the Twin to:

-   extend ideas
-   branch new directions
-   revive archived explorations
-   track recurrence
-   preserve conceptual continuity

Memory preserves meaning.\
Archive preserves paused work.\
Lineage preserves **creative evolution**.
