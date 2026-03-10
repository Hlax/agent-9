# Source Ingestion and Identity (Developer Note)

This note explains how source ingestion and identity work in the Twin Studio, and why `name = null` is valid.

---

## Source ingestion

- **What it is:** The Twin learns from **structured source items** (evidence), not raw media alone. Text, webpages, images, and video are translated into text-bearing fields (`content_text`, `extracted_text`, `transcript_text`) and stored in `source_item` with optional annotations (tags, ontology_notes, identity_relevance_notes, identity_weight).
- **How it works:**
  - **Manual entry:** Harvey adds source items via the Source library form (title, type, summary, content, tags, identity relevance, ontology notes, identity weight). POST `/api/source-items` creates a row; PATCH `/api/source-items/[id]` updates annotations. **Source-items API never creates or updates the `identity` table.**
  - **Context at runtime:** `getSourceContextForSession()` loads identity_seed and reference items (including tags, ontology_notes, identity_relevance_notes, extracted_text, transcript_text) and builds a string that is merged into working context for sessions and chat.
- **Webpage URL ingestion:** When you use “Import from URL” on the Source page, the **crawl runs as soon as you click Import** (synchronous). One request: fetch URL → extract readable text and title → create one `source_item` with `content_text`, `origin_reference`, `media_kind: "webpage"`. No background job; if the site is slow, the request may take several seconds. Async/queue can be added later if needed. One webpage → one source item; optional vision analysis on page images is Phase B (see [vision_webpage_pipeline_for_twin](c:\Users\guestt\OneDrive\Desktop\harveylacsina.com\AAA_Twinning_Documentation\vision_webpage_pipeline_for_twin.md)).
- **Media translation (Phase B):** Image upload with vision description and video transcript/frame analysis will populate `extracted_text`, `transcript_text` via ingestion services. Schema and interfaces are in place.

---

## Identity

- **One canonical identity:** There is exactly one active identity for the Twin: the single row in `identity` with `is_active = true`. All runtime context (sessions, chat) reads this row plus source evidence, memory, and creative state.
- **Sources are evidence, not identities:** `source_item` rows inform identity and context; they do not replace or duplicate the canonical identity. Ingesting or tagging a source must never create a new identity row or silently rewrite the active identity.
- **Identity formation only through:**
  1. **Explicit bootstrap:** Harvey runs “Generate initial identity from source library” (POST `/api/identity/bootstrap`). The service aggregates eligible identity_seed/reference sources, calls a model to distill summary, philosophy, embodiment_direction, habitat_direction, and updates the active identity row (or creates one with `name` null). Bootstrap must never invent or overwrite `name`.
  2. **Explicit approved update:** Harvey edits identity on the Identity page (PATCH `/api/identity`) or approves an identity-related proposal (e.g. apply name, approve avatar). Substantive changes should be recorded in `change_record` where appropriate.
- **Sessions, critique, evaluation, and human feedback** may create memory records or identity-change proposals; they must not directly mutate the `identity` table. The active identity changes only when Harvey explicitly approves (bootstrap, PATCH identity, or approve proposal).

---

## Why `name = null` is valid

- The Twin’s existence is the **active identity record**, not the `name` field. The schema allows `name` to be null; the Twin can operate (sessions, chat, bootstrap) with `name` null.
- Naming is a **later identity event**: e.g. the Twin proposes a name in a session, Harvey approves it via the name-proposal flow, and the system updates `identity.name` and optionally records a change record. No API, UI, or runtime prompt should require a name before the Twin has proposed or received one.
- **Display:** When `name` is null, use a neutral fallback such as “Unnamed Twin” or “Active Twin” in the UI. Bootstrap and runtime prompts must not invent a name.

---

## Key files

- **Ontology:** [source_item_ontology.md](source_item_ontology.md) — definitions of source_type, source_role, tags, media_kind.
- **Schema:** `supabase/migrations/20250110000002_source_item_v2_fields.sql` (source_item V2 fields).
- **Context:** `apps/studio/lib/source-context.ts` (source digest for session/chat), `apps/studio/lib/brain-context.ts` (identity + creative state + memory + source).
- **APIs:** `apps/studio/app/api/identity/route.ts` (GET/PATCH), `apps/studio/app/api/identity/bootstrap/route.ts` (POST), `apps/studio/app/api/source-items/route.ts` (GET/POST), `apps/studio/app/api/source-items/[id]/route.ts` (PATCH), `apps/studio/app/api/source-items/ingest/route.ts` (POST — URL webpage ingestion).
- **UI:** `apps/studio/app/identity/page.tsx`, `apps/studio/app/source/page.tsx`, `apps/studio/app/source/add-source-item-form.tsx`, `apps/studio/app/source/import-from-url-form.tsx` (Import from URL).
