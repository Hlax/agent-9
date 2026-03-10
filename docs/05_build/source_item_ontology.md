# Source Item Ontology

This document defines the types, roles, and annotation vocabulary for the Twin's source library. It aligns with [source_item_schema_v2.md](c:\Users\guestt\OneDrive\Desktop\harveylacsina.com\AAA_Twinning_Documentation\source_item_schema_v2.md), [identity_seed_ingestion.md](identity_seed_ingestion.md), and [media_ingestion_architecture.md](c:\Users\guestt\OneDrive\Desktop\harveylacsina.com\AAA_Twinning_Documentation\media_ingestion_architecture.md).

---

## 1. source_type (broad classification)

**What it is:** High-level classification of the source. Used for filtering, retrieval, and eligibility for identity bootstrap.

| Value | Meaning | Used in context? | Used in bootstrap? |
|-------|---------|-------------------|---------------------|
| **identity_seed** | Material that directly shapes the Twin's initial taste and tendencies. | Yes | Yes |
| **reference** | Material that may inform generation without being treated as direct identity truth. | Yes | Yes |
| **note** | Operator note or freeform fragment. | Optional (configurable) | No (by default) |
| **prompt** | Prompt or directive fragment. | Optional | No |
| **fragment** | Short excerpt or snippet. | Optional | No |
| **upload** | File or pasted upload (generic). | Optional | No |
| **research** | Research or background material. | Optional | No |

**Canonical rule:** Only `identity_seed` and `reference` are included in session/chat context and in identity bootstrap by default. Other types are stored and can be filtered in the UI or included in future retrieval.

---

## 2. source_role (runtime role)

**What it is:** How the system should treat this source at runtime (retrieval, weighting). Can refine or override the intent of `source_type`.

| Value | Meaning |
|-------|---------|
| **identity_seed** | Treat as direct identity-shaping evidence. |
| **reference** | Use as reference only; inform but do not treat as identity truth. |
| **inspiration** | Inspirational; may influence tone or direction without being canonical. |
| **contextual** | Provides context (e.g. project background) rather than aesthetic identity. |
| **archive_only** | Preserve for traceability; do not use in normal context or bootstrap. |

**Usage:** Optional. When null, behavior is derived from `source_type`. When set, it can narrow how the item is used (e.g. `source_type: reference` + `source_role: inspiration`).

---

## 3. Tags (flexible retrieval labels)

**What they are:** Free-form labels for retrieval and filtering. Not ontology-stable; Harvey chooses them.

**Examples (from schema v2):**
- Aesthetic: `cinematic`, `melancholy`, `quiet-tension`, `urban-loneliness`
- Process: `process`, `editorial`, `moodboard`
- Conceptual: `nostalgia`, `memory`, `identity`, `pressure`, `intimacy`, `solitude`

**Usage:** Stored as `source_item.tags` (array). Included in session/chat context so the Twin sees how sources are tagged. No fixed enum; add whatever is useful.

---

## 4. Themes (canonical motifs) — optional

**What they are:** More stable, recurring conceptual motifs. Schema v2 suggests a separate `themes` array or later normalization to a `theme` table.

**Examples:** `identity`, `memory`, `pressure`, `intimacy`, `solitude`, `loneliness`, `ambition`, `technology`, `spirituality`

**Current implementation:** V1 uses `tags` only. Themes can be added as a separate field or as a subset of tags (e.g. tag with prefix `theme:`). Future: normalize to `theme` table with descriptions.

---

## 5. Annotation fields (semantics)

| Field | Meaning |
|-------|---------|
| **ontology_notes** | What the terms (tags, themes) mean in this system. Definitions or glossary for this source. |
| **identity_relevance_notes** | Why this source matters to the Twin's identity formation. Human explanation the model can use. |
| **general_notes** | Freeform operator note. Not necessarily identity-specific. |
| **identity_weight** | 0.0–1.0. How strongly this source should influence identity aggregation in bootstrap. |

---

## 6. media_kind (what was ingested)

| Value | Meaning |
|-------|---------|
| **text** | Plain text or pasted content. |
| **webpage** | Ingested from a URL (HTML → extracted text). |
| **image** | Image; description or analysis in `extracted_text`. |
| **video** | Video; transcript in `transcript_text`, frame/screen summary in `extracted_text`. |
| **audio** | Audio; transcript in `transcript_text`. |
| **document** | PDF or document; extracted text in `content_text` or `extracted_text`. |

---

## 7. Summary: identity vs reference

- **Identity seed:** Directly shapes who the Twin is (taste, tendencies, philosophy). Use for material that should strongly influence bootstrap and context.
- **Reference:** Informs generation and context but is not treated as identity truth. Use for inspiration, examples, or background that the Twin can draw on without adopting as self.

Sources are **evidence** that inform the single canonical identity; they are not identities themselves. Identity bootstrap aggregates eligible sources (identity_seed + reference by default) into one active identity row.
