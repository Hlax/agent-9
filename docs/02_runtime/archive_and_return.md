# Archive and Return System

This document defines how creative ideas move between **active
exploration**, **archival storage**, and **future resurfacing**.

The archive system allows the Twin to pause ideas without losing them
and to intelligently return to prior explorations when new context or
signals emerge.

The goal is to maintain **long-horizon creative continuity** while
preventing active workspaces from becoming overloaded.

------------------------------------------------------------------------

## Watchouts

### Archive Black Holes

If archived ideas never return, the archive becomes a graveyard of
forgotten work.

The system should allow ideas to resurface when recurrence, pull, or
related exploration increases.

### Premature Archiving

Ideas should not be archived simply because they paused temporarily.

Archiving should represent a **natural pause in exploration**, not a
minor gap between sessions.

### Archive Flooding

If ideas are archived too aggressively, the archive may grow too
quickly.

The system should archive **threads**, not individual artifacts, to
maintain conceptual continuity.

------------------------------------------------------------------------

## 1. Purpose of the Archive

The archive system exists to:

-   pause inactive idea threads
-   preserve prior creative exploration
-   reduce clutter in the active workspace
-   allow meaningful ideas to resurface later
-   maintain long-term creative memory

Archiving does **not delete work**.

It simply marks a thread as temporarily inactive.

------------------------------------------------------------------------

## 2. What Gets Archived

The primary archival unit is the **Idea Thread**.

Artifacts remain attached to their thread.

Example:

``` text
Idea Thread
├ Artifact
├ Artifact
└ Artifact
```

When a thread is archived:

-   the thread becomes inactive
-   artifacts remain preserved
-   lineage remains intact
-   the thread may later return or branch

Individual artifacts may still have status values such as:

-   `draft`
-   `archived`
-   `published`

But archival logic operates at the **thread level**.

------------------------------------------------------------------------

## 3. Thread Lifecycle

Idea threads move through a lifecycle:

``` text
active
↓
inactive
↓
archived
↓
revived or branched
↓
active again
```

Inactive threads are candidates for archival.

Archived threads remain searchable and may return later.

------------------------------------------------------------------------

## 4. Archival Triggers

A thread may be archived when signals indicate exploration has paused.

Common triggers include:

-   low recurrence score
-   low pull score
-   extended inactivity
-   thread stagnation
-   explicit Harvey action
-   completion of exploration

Archival should occur gradually rather than immediately after a single
inactive session.

------------------------------------------------------------------------

## 5. Archive Entry

When a thread is archived, an **archive entry** is created.

Archive entries store context explaining why the thread paused.

Suggested fields may include:

``` text
archive_entry_id
thread_id
archived_at
archive_reason
return_potential
recurrence_snapshot
pull_snapshot
notes
```

Archive entries help future sessions understand the thread's historical
state.

------------------------------------------------------------------------

## 6. Archive Decay

Archive return probability may decrease gradually over time.

Example pattern:

``` text
recent archive → higher return potential
older archive → lower return potential
```

This prevents the runtime from constantly revisiting very old ideas.

However, decay should **never permanently block resurfacing**.

Strong signals may override decay.

------------------------------------------------------------------------

## 7. Return Sessions

The runtime may initiate **return sessions**.

Return sessions focus specifically on exploring archived ideas.

Example flow:

``` text
Session Mode: return
↓
scan archive entries
↓
evaluate return potential
↓
select candidate thread
↓
revive or branch exploration
```

Return sessions allow the Twin to revisit forgotten ideas intentionally.

------------------------------------------------------------------------

## 8. Return Signals

Archived threads may resurface when signals increase.

Important signals include:

-   `recurrence_score`
-   `pull_score`
-   related project activity
-   human annotations
-   new contextual relevance

High recurrence or strong pull may trigger resurfacing even for older
archives.

------------------------------------------------------------------------

## 9. Harvey Influence

Human feedback may influence archive return behavior.

Examples:

-   `mark_revisit`
-   annotations indicating importance
-   approval of artifacts within a thread
-   explicit revival requests

Human signals should carry strong influence when deciding whether
archived ideas return.

------------------------------------------------------------------------

## 10. Revival vs Branching

When a thread resurfaces, the system may either:

### Revive the Thread

The original thread becomes active again.

``` text
Thread A archived
↓
Thread A revived
```

This continues the original lineage.

### Branch From the Thread

A new thread emerges from the archived idea.

``` text
Thread A archived
↓
Thread B created (branch)
```

Branching may occur when:

-   context has changed
-   exploration direction shifts
-   the original thread represents an earlier phase

Branching preserves lineage while allowing creative evolution.

------------------------------------------------------------------------

## 11. Archive and Lineage

The archive does **not interrupt lineage history**.

Archived threads remain part of the lineage graph.

Example:

``` text
Thread A
├ Artifact
├ Artifact
└ archived
   ↓
   revived
```

Or:

``` text
Thread A
└ archived
   ↓
   branch
   ↓
Thread B
```

Lineage remains continuous.

------------------------------------------------------------------------

## 12. Archive Retrieval

When selecting threads during sessions, the runtime may evaluate
archived threads.

Important signals include:

-   `return_potential`
-   `recurrence_score`
-   `pull_score`
-   archive age
-   related project activity
-   Harvey annotations

Archived ideas with strong signals may re-enter active exploration.

------------------------------------------------------------------------

## 13. Archive and Memory

Archive and memory serve different purposes.

Archive stores **paused exploration structures**.

Memory stores **observations and meaning** about prior work.

Example:

Archive stores:

``` text
Thread A archived
```

Memory may store:

``` text
Thread A repeatedly explored themes of digital shrine aesthetics
```

Archive preserves structure. Memory preserves interpretation.

------------------------------------------------------------------------

## 14. Archive and Creative State

Creative state may influence return probability.

Examples:

High `idea_recurrence`\
→ increases likelihood of return sessions

High `creative_tension`\
→ encourages revisiting unresolved ideas

Low `expression_diversity`\
→ may revive threads using different mediums

------------------------------------------------------------------------

## 15. Occasional Archive Exploration

Even when return signals are weak, the runtime may periodically sample
archived threads at a low probability.

This mechanism exists to support unexpected creative recombination and
long-horizon idea rediscovery.

Human creative processes often revisit ideas long after they were
abandoned, not because signals demanded it, but because new contexts
create surprising connections.

Example:

``` text
old thread: shrine UI
↓
years pass
↓
new context appears
↓
AI shrine habitat
```

Without occasional exploration, archived ideas may become permanently
inaccessible.

Runtime implementations may therefore:

-   occasionally sample archived threads at random
-   bias selection toward threads with meaningful lineage
-   allow resurfaced ideas to either **revive the original thread** or
    **branch into a new thread**

This exploration should occur **infrequently**, ensuring the archive
remains primarily signal-driven while still allowing creative
rediscovery.

------------------------------------------------------------------------

## 16. Design Principles

**Preservation** --- ideas should never be lost.

**Continuity** --- archived threads remain part of lineage.

**Patience** --- ideas may pause for long periods before resurfacing.

**Evolution** --- returning ideas may evolve into new branches.

**Recoverability** --- important ideas should always remain retrievable.

------------------------------------------------------------------------

## 17. Summary

The Archive and Return System manages the lifecycle of creative ideas.

It allows the Twin to:

-   pause inactive exploration
-   preserve prior work
-   reduce active workspace clutter
-   intelligently revisit ideas later
-   evolve past concepts into new directions

Lineage tracks **how ideas evolve**.

Memory tracks **what ideas mean**.

Archive tracks **when ideas pause and return**.
