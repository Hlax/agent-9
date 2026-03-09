# Identity Seed Ingestion

This document defines how the initial body of work should be ingested to seed the Twin.

---

## 1. Purpose

The Twin should not begin with an empty aesthetic center.
Initial source ingestion should provide a base layer of taste, philosophy, and reference material.

---

## 2. Initial Seed Set

Planned initial seed sources may include:

- approximately 50 existing works
- written philosophy or notes
- images, moodboards, or visual references
- selected prompts or fragments
- interview-style responses from Harvey

---

## 3. Ingestion Categories

Each uploaded item should be treated as one or more of the following:

### Identity seed
Material that directly shapes the Twin’s initial taste and tendencies.

### Reference source
Material that may inform generation without being treated as direct identity truth.

### Historical artifact
Material that belongs to Harvey’s body of work and should remain traceable.

### Discussion input
Material that helps interpret the seed set but is not itself a canonical artifact.

---

## 4. Recommended Metadata for V1

Each ingested item should preserve:

- title or label
- source type
- medium
- date if known
- creator role
- optional project association
- short summary
- tags or themes
- identity relevance notes
- ingestion timestamp

---

## 5. Recommended Storage Direction

For V1:
- binary files live in object storage
- metadata lives in `source_item`
- derived notes may live in `memory_record`
- thread links remain optional unless clearly useful

Do not flatten all uploads into opaque blobs with no descriptive metadata.

---

## 6. Suggested Initial Workflow

1. Harvey uploads a source item
2. system stores metadata and file reference
3. Harvey or runtime adds a short summary
4. item is tagged as identity seed, reference, historical artifact, or other
5. item may be attached to a project or thread
6. item becomes retrievable for later generation context

---

## 7. Important Rule

Uploaded seed material does not automatically become public.
Uploaded seed material does not automatically become the Twin’s canon.
It becomes governed context.

---

## 8. Early Retrieval Rule

In early phases, retrieval should be simple and controlled.
Prefer:
- recent seed items
- explicitly identity-tagged items
- project-matched references
- manually favored sources

Do not start with embeddings-heavy retrieval unless clearly required.
