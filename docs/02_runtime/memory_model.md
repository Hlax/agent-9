# Memory Model

This document defines how the Twin stores, organizes, and uses memory across time.

The Memory Model allows the Twin to behave as a continuous creative system rather than a stateless generator.

It explains:

- what kinds of memory the Twin keeps
- how memory differs from artifacts and source items
- how memories are created during sessions
- how memories are retrieved during future sessions
- how memory supports recurrence, lineage, return behavior, and identity continuity

This document should be read alongside:

- `glossary.md`
- `data_model.md`
- `system_architecture.md`
- `creative_state_model.md`
- `session_loop.md`

---

# Watchouts

The following risks are common in long-running memory systems and should be considered during implementation.

## Memory Bloat

If every observation, summary, artifact, or reflection is stored with equal weight, the system will accumulate noise faster than meaning.

This causes retrieval quality to degrade and makes recurrence signals less trustworthy.

The Memory Model should favor:

- selective retention
- lightweight summarization
- importance scoring
- compression of low-value memory over time

The Twin should not remember everything equally.

---

## Memory Collapse

The opposite failure is compressing too aggressively and losing useful continuity.

If the system only stores shallow summaries, it may lose:

- why an idea mattered
- what was unresolved
- what changed between sessions
- what Harvey specifically approved or rejected

The goal is to preserve **meaningful continuity**, not maximum detail or maximum compression.

---

## Source / Artifact / Memory Confusion

Source items, artifacts, and memory records are related but not interchangeable.

The system must avoid treating:

- imported inspiration
- generated outputs
- stored observations

as if they are the same thing.

These distinctions are already part of the canonical model and should remain stable.

---

# 1. Purpose of Memory

The Twin’s memory system exists to preserve continuity across sessions.

Memory allows the Twin to:

- remember prior explorations
- detect recurring ideas
- track long-term creative development
- revisit paused work with context
- accumulate identity over time
- avoid behaving like a first-draft machine every session

The architecture already defines memory as one of the core system components and states that without memory the Twin would behave like a stateless generator. The session loop also depends on memory during initialization and during post-artifact updates. 

---

# 2. Memory in the Larger System

The Memory System is one of the Twin’s major subsystems.

At runtime, the system reads memory during session initialization and writes memory after artifact generation and at session reflection.

High-level flow:

Sources / Prior Artifacts / Archive / Identity / Memory  
↓  
Session Context  
↓  
Creative Work  
↓  
Evaluation  
↓  
Memory Update  
↓  
Future Retrieval

This means memory is both:

- an input to future sessions
- an output of prior sessions

Memory is therefore not passive storage. It actively shapes future creative decisions.

---

# 3. Canonical Memory Distinctions

The glossary and ontology already distinguish several related entities.

## Source Item
A seeded external or imported input available to the Twin.

Examples:
- prompt
- note
- transcript
- reference image
- fragment
- moodboard

A source item is something the Twin can use.

## Artifact
A generated output produced by the Twin.

Examples:
- a written piece
- an image draft
- an audio sketch
- a concept document

An artifact is something the Twin makes.

## Memory Record
A stored internal memory unit that captures something the Twin should remember.

Examples:
- a summary of a session
- a recurring pattern across artifacts
- a note that a certain direction has high pull
- a record that a theme is resurfacing
- a compact explanation of why something mattered

A memory record is something the Twin retains for future reasoning.

These distinctions must not collapse in implementation. Source items inform work, artifacts express work, and memory records preserve what should continue to matter. :contentReference[oaicite:2]{index=2}

---

# 4. What the Memory System Stores

At the architectural level, the Memory System stores:

- artifacts
- idea threads
- archive entries
- memory records
- source items
- session history

However, not all of these are the same kind of memory object.

For V1, the Memory System should be understood as a retrieval layer over several memory-bearing entities:

## Direct Memory-Bearing Records
- `memory_record`
- `creative_session`
- `creative_state_snapshot`
- `archive_entry`

## Indirect Memory-Bearing Records
- `artifact`
- `idea`
- `idea_thread`
- `human_feedback`
- `evaluation_signal`

This distinction is useful because some records are explicitly created **as memory**, while others become useful to memory retrieval because they preserve historical signal. The architecture and data dependencies already imply this layered behavior. 

---

# 5. Memory Types

For V1, memory should not be treated as a single undifferentiated bucket.

The `memory_record` entity already supports a flexible `memory_type` field in the data model. This document defines the intended conceptual use of that flexibility. :contentReference[oaicite:4]{index=4}

Recommended V1 memory types:

## session_reflection
A summary of what happened during a session.

Examples:
- what was explored
- what felt promising
- what remained unresolved
- what identity signals appeared

## pattern_memory
A stored observation about recurrence or repeated behavior.

Examples:
- a theme keeps resurfacing
- a certain medium repeatedly produces stronger pull
- a visual direction is emerging across separate sessions

## decision_memory
A compact memory of an important internal or external decision.

Examples:
- a thread was intentionally paused
- a project was deprioritized
- a direction was rejected for now but not permanently

## identity_memory
A memory related to the Twin’s self-model.

Examples:
- naming direction signals
- embodiment tendencies
- recurring philosophical tone
- identity tensions noticed across work

## review_memory
A compressed memory of Harvey’s feedback that should remain influential.

Examples:
- repeated annotated rejection of a direction
- repeated approval of a certain mode or signal
- notes about what counts as strong alignment

## return_memory
A memory that increases the chance of future resurfacing.

Examples:
- unfinished but fertile direction
- idea with strong pull but weak execution
- paused artifact with unresolved energy

## synthesis_memory
A higher-level summary that compresses multiple related memories.

Examples:
- “three recent sessions all point toward a darker, quieter visual identity”
- “return behavior is clustering around two idea threads”

These are conceptual categories, not necessarily required enums on day one.

---

# 6. Memory Creation Moments

The session loop already implies three major moments when memory should be created.

## A. During Session Initialization
The runtime loads recent and relevant memory into the session context.

This does not create new memory, but it determines which prior memory remains active in the present session.

## B. After Each Artifact Cycle
After generation, critique, and evaluation, the runtime may record:

- artifact record
- evaluation signals
- memory record
- idea lineage updates

This is where short-horizon memory gets formed. 

## C. At Session Reflection
When the session ends, the reflection summary becomes a memory record.

This is where higher-level session memory gets formed. The creative state model also explicitly says session reflection becomes a memory record used in future sessions. 

---

# 7. Memory Formation Rules

Not every event should become a strong memory.

For V1, memory creation should follow selective rules.

## Strong Memory Candidates
Create or strengthen memory when:

- an artifact has high pull
- an idea recurs across sessions
- a session produces a meaningful reflection
- Harvey provides annotated feedback
- a direction is paused with unresolved potential
- a strong identity signal appears
- a branch or return event occurs

## Weak Memory Candidates
Store lightly or compress when:

- the artifact is low energy and low fertility
- the session produced little novelty
- a review action is unannotated and low-signal
- the record is only useful as short-lived execution history

This keeps memory meaningful instead of bloated.

---

# 8. Memory Strength and Retention

The data model already supports `importance_score` and `recurrence_score` on memory records. For V1, these should be the main retention signals. :contentReference[oaicite:7]{index=7}

## importance_score
Represents how valuable this memory is for future reasoning.

Importance may increase when:
- Harvey annotates or strongly reacts
- the memory relates to identity or long-term direction
- the memory captures a significant turning point
- the memory repeatedly proves useful in future sessions

## recurrence_score
Represents how often the underlying idea or pattern returns.

Recurrence may increase when:
- the same idea thread keeps resurfacing
- related artifacts appear in multiple sessions
- a paused idea regains relevance later
- a pattern appears across mediums

## Retention Guidance

High importance + high recurrence  
→ keep strongly accessible

High importance + low recurrence  
→ preserve as meaningful historical memory

Low importance + high recurrence  
→ compress into pattern memory or synthesis memory

Low importance + low recurrence  
→ eligible for summarization, pruning, or cold storage later

---

# 9. Memory Retrieval

Memory should be retrieved in layers, not dumped indiscriminately into every session.

For V1, retrieval should bias toward relevance, recency, and recurrence.

## Retrieval Layers

### Immediate Session Context
Recently relevant items such as:
- latest state snapshot
- recent sessions
- recent artifacts
- current project records
- current thread records

### Active Continuity Context
Items tied to the selected project, idea thread, or archive entry.

Examples:
- prior artifacts in the same thread
- prior reflections about that thread
- unresolved questions from archive
- prior feedback on similar work

### Long-Horizon Pattern Context
Broader memories that may influence direction.

Examples:
- recurring themes
- identity trends
- repeated feedback patterns
- medium preferences that keep emerging

This layered retrieval prevents the system from becoming either forgetful or overloaded.

---

# 10. Retrieval Priority Signals

The runtime should favor memories using signals such as:

- project relevance
- idea thread match
- recurrence_score
- importance_score
- recency
- unresolved status
- Harvey annotation presence
- archive return potential

Example conceptual weighting:

high thread match + high recurrence  
→ likely retrieve

moderate relevance + high Harvey annotation  
→ likely retrieve

high recency but low importance  
→ retrieve only in short-horizon context

old memory + no recurrence + no importance  
→ usually not retrieve

This keeps retrieval focused on what is meaningfully alive.

---

# 11. Memory and Creative State

Memory directly influences creative state.

The creative state model already says state is influenced by:

- recent artifacts
- idea recurrence
- unfinished work
- evaluation signals
- archive signals
- human feedback

Most of these are memory-mediated. :contentReference[oaicite:8]{index=8}

Examples:

- repeated unfinished work increases continuation pressure
- recurring ideas raise return weighting
- repeated low-novelty memory can raise reflection need
- repeated high-pull memories can raise creative tension
- repeated feedback patterns can influence coherence or curation pressure

Memory is therefore one of the hidden engines behind state evolution.

---

# 12. Memory and Identity Continuity

The constitution says the Twin’s identity evolves through generated artifacts and Harvey approval, while core memory remains preserved. :contentReference[oaicite:9]{index=9}

That means memory should support identity in two ways:

## Identity Preservation
Memory preserves:
- prior self-descriptions
- recurring values
- embodiment tendencies
- long-term themes
- records of meaningful change

## Identity Evolution
Memory also helps detect:
- when identity signals are becoming clearer
- when embodiment direction is drifting
- when old self-model assumptions no longer fit
- when change proposals may be justified

Memory should not freeze identity, but it should prevent incoherent reinvention.

---

# 13. Memory and Return Behavior

One of the Twin’s core constitutional behaviors is returning to old work when it still carries energy, recurrence, pull, or new context. :contentReference[oaicite:10]{index=10}

The Memory Model supports this by preserving:

- unresolved questions
- prior critique
- recurrence patterns
- creative pull history
- archive-linked summaries
- return-specific memory records

This is what allows “return” to be intelligent rather than random nostalgia.

A future return decision should be able to answer:

- Why was this paused?
- What still feels alive here?
- What changed since the last attempt?
- Is the return driven by recurrence, by new context, or by unresolved pull?

---

# 14. Memory Compression

The system should gradually compress memory without erasing important continuity.

Recommended V1 approach:

## Keep Verbatim
Preserve directly when:
- Harvey annotations are important
- the memory is identity-relevant
- the memory captures a major shift
- the memory is likely to inform future governance

## Summarize
Compress when:
- several low-level memories say essentially the same thing
- many session notes point to one broader pattern
- repeated artifact results can be represented as a pattern memory

## Prune or Cool
Deprioritize when:
- the memory has low importance
- it shows no recurrence
- it has not influenced later work
- it duplicates stronger retained memory

The goal is to compress noise, not erase lineage.

---

# 15. Memory Access Boundaries

The runtime should not pull the entire database into every session.

For V1, memory access should remain bounded.

Recommended practical limits:

- retrieve only the most relevant recent sessions
- retrieve only memories related to the selected project or thread
- retrieve a small number of high-value long-horizon pattern memories
- avoid low-signal records when review backlog is already high
- prefer summaries over raw history when enough context already exists

This keeps session prompts coherent and affordable.

---

# 16. Memory Update Flow

A practical V1 memory update sequence after each artifact cycle could be:

1. save artifact
2. save evaluation signals
3. decide whether a memory record should be created
4. update recurrence-related memory if the idea resurfaced
5. update return potential if the work was paused
6. update thread-linked pattern memory if a broader pattern is becoming visible

At session end:

1. generate session reflection
2. store reflection as memory record
3. optionally generate a higher-level synthesis memory
4. make the memory available for future session retrieval

This aligns with the runtime structure already defined in the session loop. 

---

# 17. Relationship to Idea Lineage and Archive

Memory is not the same thing as lineage or archive, but it supports both.

## Memory vs Idea Lineage
Idea lineage tracks how ideas and threads evolve across time.

Memory stores what should remain cognitively available about that evolution.

Lineage answers:
- what connected to what

Memory answers:
- what should still matter about those connections

## Memory vs Archive
Archive stores paused work and return context.

Memory helps decide:
- whether a paused item still has energy
- whether it is resurfacing
- whether it should remain dormant
- whether a new context now makes it relevant again

So lineage is structural continuity, archive is paused continuity, and memory is usable continuity.

---

# 18. V1 Implementation Guidance

The repo structure already anticipates a dedicated package for memory helpers. :contentReference[oaicite:12]{index=12}

For V1, implementation should stay simple:

- use the existing `memory_record` model as the explicit memory layer
- treat artifacts, sessions, archive entries, threads, and feedback as memory-bearing records
- avoid premature vector-only memory design
- support rule-based retrieval first
- optionally add embeddings later for fuzzy recall
- preserve canonical distinctions from the glossary and data model

Good V1 implementation order:

1. session reflection memory
2. recurrence-aware retrieval by thread / project
3. return-aware archive memory
4. pattern memory synthesis
5. optional semantic retrieval later

That sequence is enough for a strong first runtime without overengineering.

---

# 19. Design Principles

## Continuity over accumulation
Memory should preserve what matters, not store everything equally.

## Retrieval over hoarding
A useful memory system is defined by what can be surfaced intelligently.

## Distinction over collapse
Source items, artifacts, archives, lineage, and memory records should remain conceptually distinct.

## Compression without amnesia
The system should summarize aggressively enough to stay useful but not so aggressively that it loses meaning.

## Identity-preserving evolution
Memory should allow growth without incoherent resets.

---

# 20. Summary

The Twin’s Memory Model gives the system continuity across time.

It allows the Twin to:

- retain meaningful reflections
- recognize recurring ideas
- remember why work mattered
- revisit paused directions with context
- preserve identity continuity while still evolving

Without this layer, the Twin would only generate.
With it, the Twin can accumulate creative history.