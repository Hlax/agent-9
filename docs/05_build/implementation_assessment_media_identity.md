# Implementation Assessment: Media Ingestion & Identity (from docs bundle)

This document synthesizes the attached planning docs (source_item_schema_v2, media_ingestion_architecture, vision_webpage_pipeline, vision_models_explained, cursor_prompt_build) and the existing canonical identity plan.

---

## 1. Where the docs agree

- **One canonical identity.** One active `identity` row; sources are evidence that inform identity, not identities. Ingestion must never create or rewrite identity.
- **Media → text.** Raw media (webpages, images, video, documents) must be translated into structured textual signals (content_text, extracted_text, transcript_text) so the Twin reasons over text.
- **Annotation layer.** Sources should support tags, ontology_notes, identity_relevance_notes, general_notes, and weighting (e.g. identity_weight) so Harvey can curate what matters.
- **Identity bootstrap.** Explicit action that aggregates eligible sources, calls a model to distill summary/philosophy/embodiment/habitat, updates the single active identity row; must not invent or overwrite `name`.
- **Separation of concerns.** `source_item`, `memory_record`, `artifact`, `critique_record`, and `identity` stay distinct; no automatic identity mutation from sessions/critique/feedback.
- **Name optional.** Twin can operate with `name = null`; naming is a later event (e.g. twin proposes, Harvey approves).

---

## 2. Contradictions, overcomplications, weak assumptions

- **Table name:** Docs sometimes say `twin_identity`; the repo uses `identity`. **Decision:** Keep `identity` for backward compatibility.
- **Schema scope:** source_item_schema_v2 proposes many fields (source_role, source_status, themes[], multiple JSONB blobs). **Decision:** Implement the **minimum V1 subset** from the schema doc first (tags, ontology_notes, identity_relevance_notes, general_notes, media_kind, mime_type, preview_uri, extracted_text, transcript_text, source_role, identity_weight, source_metadata, processing_metadata). Omit source_status, themes (use tags only for now), operator_annotation until needed.
- **Vision/video pipelines:** Full webpage fetch + vision analysis and video transcript + frame analysis are described but are heavy. **Decision:** Add schema and ingestion **hooks** (fields + API shape); implement URL fetch + text extraction and optional vision call behind a clear interface so we can add vision/video implementations in a later phase without schema churn.
- **Normalization:** Schema v2 suggests future tag/theme join tables. **Decision:** Use `tags TEXT[]` (and optional themes later) to avoid join-table complexity in V1; doc says "do not over-normalize in the first pass."

---

## 3. Cleanest implementation path

1. **Schema (Phase A)**  
   Single migration adding to `source_item`:  
   `tags TEXT[]`, `ontology_notes TEXT`, `identity_relevance_notes TEXT`, `general_notes TEXT`, `media_kind TEXT`, `mime_type TEXT`, `preview_uri TEXT`, `extracted_text TEXT`, `transcript_text TEXT`, `source_role TEXT`, `identity_weight NUMERIC`, `source_metadata JSONB`, `processing_metadata JSONB`.  
   All nullable; no change to existing rows.

2. **Identity API**  
   - GET `/api/identity`: return active identity row (or null); allow `name` null.  
   - PATCH `/api/identity`: optional name, summary, philosophy, embodiment_direction, habitat_direction; create row only when this is an explicit identity update (e.g. from Identity page or bootstrap), never from source-items.  
   - POST `/api/identity/bootstrap`: load identity_seed/reference (with new fields), build digest, GPT distill into summary/philosophy/embodiment/habitat, update existing active identity (or create one with name null); never invent/overwrite name.

3. **Source-items API**  
   - Extend GET to return new fields.  
   - Extend POST to accept new fields (tags, ontology_notes, identity_relevance_notes, general_notes, media_kind, mime_type, preview_uri, extracted_text, transcript_text, source_role, identity_weight, origin_reference, content_uri).  
   - Add PATCH `/api/source-items/[id]` for updating annotations (and other fields).  
   - **Guardrail:** No code path in source-items creates or updates `identity`.

4. **Source context**  
   - In `getSourceContextForSession`, select and include tags, ontology_notes, identity_relevance_notes, extracted_text, transcript_text in the per-item string so session/chat context sees annotations and media-derived text.

5. **Chat**  
   - Use `getBrainContext` + `buildWorkingContextString` instead of only `getSourceContextForSession` so chat and sessions share the same working context (canonical identity + source evidence).

6. **UI**  
   - Identity page: form for name (optional), summary, philosophy, embodiment_direction, habitat_direction; button "Generate initial identity from source library" calling bootstrap.  
   - Source form: add fields for tags, ontology_notes, identity_relevance_notes, general_notes, media_kind, identity_weight; source list shows key annotations.  
   - Display fallback when identity name is null (e.g. "Unnamed Twin").

7. **Ingestion (Phase B – staged)**  
   - Add routes/UI for URL import and file upload that create/update source_item with content_text and/or extracted_text.  
   - Define a small service interface for "run vision on image URL" and "extract text from URL" so we can plug in real implementations (e.g. OpenAI vision, readability-style extraction) without blocking on them in Phase A.

---

## 4. Risks and tradeoffs

- **Risk:** Adding many nullable columns in one migration is low-risk but increases surface area. **Mitigation:** Only use the fields we need in API and UI; leave the rest for future use.
- **Tradeoff:** Implementing full vision/video pipelines in Phase A would delay shipping. **Choice:** Schema + hooks + manual/URL text ingestion first; vision and video processing behind interfaces for Phase B.
- **Risk:** Bootstrap prompt quality affects identity quality. **Mitigation:** Use a fixed, explicit prompt (do not invent name; output only summary, philosophy, embodiment_direction, habitat_direction) and preserve existing name.

---

## 5. Phased plan

| Phase | Scope | Deliverables |
|-------|--------|--------------|
| **A** | Schema + identity + annotations + context + UI | Migration for source_item V2 minimal fields; GET/PATCH /api/identity, POST /api/identity/bootstrap; extended source-items GET/POST + PATCH for annotations; source-context includes new fields; chat uses full brain context; Identity page with form + bootstrap button; Source form + list with annotation fields; developer README. |
| **B** | Ingestion + media translation | URL import (fetch + extract text), file upload, interfaces for vision/transcript; optional vision call for images; optional transcript for video; store results in source_item. |

This assessment and phased plan are the basis for the implementation that follows.
