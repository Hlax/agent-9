# Twin Source System Audit — End-to-End Verification

Evidence from the codebase as of this audit. The DB uses table **`identity`** (not `twin_identity`); docs sometimes say twin_identity but the schema and code use `identity`.

---

## 1. Database schema

### Tables and columns that exist

**source_item**  
- **Core** ([20250108000001_twin_core_tables.sql](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\supabase\migrations\20250108000001_twin_core_tables.sql) L290–302): `source_item_id`, `project_id` (FK project), `title`, `source_type`, `summary`, `content_text`, `content_uri`, `origin_reference`, `ingested_at`, `created_at`, `updated_at`.  
- **V2 fields** ([20250110000002_source_item_v2_fields.sql](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\supabase\migrations\20250110000002_source_item_v2_fields.sql)): `source_role`, `tags` (TEXT[]), `ontology_notes`, `identity_relevance_notes`, `general_notes`, `media_kind`, `mime_type`, `preview_uri`, `extracted_text`, `transcript_text`, `identity_weight` (NUMERIC), `source_metadata` (JSONB), `processing_metadata` (JSONB). All nullable.

**identity** (referred to as twin_identity in some docs)  
- [20250108000001_twin_core_tables.sql](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\supabase\migrations\20250108000001_twin_core_tables.sql) L4–17: `identity_id`, `version_label`, `name`, `summary`, `philosophy`, `creative_values` (JSONB), `embodiment_direction`, `habitat_direction`, `status`, `is_active`, `created_at`, `updated_at`. No FK from source_item to identity.

**memory_record**  
- Same migration L304–316: `memory_record_id`, `project_id`, `memory_type`, `summary`, `details`, `source_session_id` (FK creative_session), `source_artifact_id` (FK artifact), `importance_score`, `recurrence_score`, `created_at`, `updated_at`.

**artifact**  
- Same migration L112–141: `artifact_id`, `project_id`, `session_id`, `primary_idea_id`, `primary_thread_id`, `title`, `summary`, `medium`, `lifecycle_status`, `current_approval_state`, `current_publication_state`, `content_text`, `content_uri`, `preview_uri`, `notes`, alignment/emergence/fertility/pull/recurrence scores, `created_at`, `updated_at`.

**critique_record**  
- Same migration L162–176: `critique_record_id`, `artifact_id` (FK), `session_id`, intent/strength/originality/energy/potential/medium_fit/coherence/fertility notes, `overall_summary`, `critique_outcome`, `created_at`, `updated_at`.

**evaluation_signal**  
- Same migration L179–200: `evaluation_signal_id`, `target_type`, `target_id`, alignment/emergence/fertility/pull/recurrence/resonance scores, `rationale`, `created_at`, `updated_at`.

**human_feedback**  
- **Not in DB.** Described in [data_model.md](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\docs\01_foundation\data_model.md) § human_feedback but there is no `CREATE TABLE human_feedback` in any migration. So: documented only.

### New media/annotation fields actually added

- Added in migration `20250110000002_source_item_v2_fields.sql`: `source_role`, `tags`, `ontology_notes`, `identity_relevance_notes`, `general_notes`, `media_kind`, `mime_type`, `preview_uri`, `extracted_text`, `transcript_text`, `identity_weight`, `source_metadata`, `processing_metadata`.

### Migration order

- Enums first (`20250108000000_twin_enums.sql`), then core tables (`20250108000001`), then RLS placeholder (`20250108000002`), then chat/memory/habitat/thread migrations (`20250109*`), then source_item V2 (`20250110000002`). Order is consistent; V2 runs after `source_item` exists.

### Code vs DB

- **identity:** Code reads `identity_id`, `name`, `summary`, `philosophy`, `embodiment_direction`, `habitat_direction` ([brain-context.ts](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\apps\studio\lib\brain-context.ts) L86, Identity API). All exist. `creative_values` exists in DB but is not read in Studio (no mismatch, just unused).
- **source_item:** API and source-context select the new V2 columns; ingest and POST write them. No column used in code is missing from the schema after the V2 migration.

---

## 2. Relationships and boundaries

- **source_item** is distinct from **artifact**, **memory_record**, **identity**:  
  - No FK from `source_item` to `identity` or to `artifact` or to `memory_record`.  
  - `source_item.project_id` → `project` only.  
  - [source-items/route.ts](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\apps\studio\app\api\source-items\route.ts) and [source-items/ingest/route.ts](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\apps\studio\app\api\source-items\ingest\route.ts) only `insert`/`update`/`select` on `source_item`; neither touches `identity`.  
  - [source-items/[id]/route.ts](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\apps\studio\app\api\source-items\[id]\route.ts) only updates `source_item`.

- **Single active identity:**  
  - [brain-context.ts](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\apps\studio\lib\brain-context.ts) L84–91: `loadActiveIdentity` does `.eq("is_active", true).eq("status", "active").order("updated_at", { ascending: false }).limit(1).maybeSingle()`. So exactly one row is used at runtime (the most recently updated active one).  
  - There is no DB unique constraint on “only one active”; enforcement is by query pattern, not by schema.

---

## 3. Ingestion pipeline

**Manual source creation**  
- Path: [Source page](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\apps\studio\app\source\page.tsx) → [AddSourceItemForm](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\apps\studio\app\source\add-source-item-form.tsx) → POST [source-items/route.ts](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\apps\studio\app\api\source-items\route.ts).  
- Stored in `source_item`: `title`, `source_type`, `source_role`, `summary`, `content_text`, `content_uri`, `origin_reference`, `tags`, `ontology_notes`, `identity_relevance_notes`, `general_notes`, `media_kind`, `mime_type`, `preview_uri`, `extracted_text`, `transcript_text`, `identity_weight` (all optional except title/source_type). Does not write to identity.

**File upload**  
- **Not implemented.** There is no route that accepts a file upload and creates a `source_item`. The type `upload` exists and can be set manually; no pipeline from “upload file” to `source_item`.

**URL import (webpage)**  
- Path: [ImportFromUrlForm](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\apps\studio\app\source\import-from-url-form.tsx) → POST [source-items/ingest/route.ts](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\apps\studio\app\api\source-items\ingest\route.ts).  
- Ingest route: fetches URL, extracts title and body text from HTML (strip script/style, then tags), inserts one `source_item` with `title`, `content_text`, `origin_reference` (final URL), `media_kind: "webpage"`, `source_type`/`source_role`, `source_metadata` (ingested_url, final_url, status). Does not write to identity. No image or video handling.

**Webpage parsing**  
- Implemented inside the ingest route: `extractTitle()`, `htmlToText()` (regex/string based). No separate readability/library; no image detection or vision.

**Image handling**  
- **Not implemented for source_item.** Session run can generate an image *artifact* and upload it to storage ([session/run/route.ts](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\apps\studio\app\api\session\run\route.ts) L98–107). There is no path “upload image → vision → create source_item with extracted_text”.

**Video handling**  
- **Not implemented.** No transcript extraction or frame analysis; no route that creates `source_item` from video. Schema has `transcript_text` and `extracted_text` for when we add it.

---

## 4. Runtime usage

**Where source_item is read**  
- [source-context.ts](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\apps\studio\lib\source-context.ts) `getSourceContextForSession()`: selects `title`, `source_type`, `summary`, `content_text`, `extracted_text`, `transcript_text`, `tags`, `ontology_notes`, `identity_relevance_notes` from `source_item` where `source_type` in (`identity_seed`, `reference`), ordered by `ingested_at` desc, limit 15. Builds one string per item (title, type, concatenated summary+content+extracted+transcript, then tags/ontology/relevance) and joins with `\n\n---\n\n`.  
- That string is returned as `sourceSummary` from [brain-context.ts](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\apps\studio\lib\brain-context.ts) `getBrainContext()` (L56) and fed into `buildWorkingContextString()` (L115–116) as “Source context”, then used by both chat and session run.

**How each field is used**  
- **summary, content_text, extracted_text, transcript_text:** All concatenated (with truncation per item) into the per-item block in `getSourceContextForSession` ([source-context.ts](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\apps\studio\lib\source-context.ts) L49).  
- **tags, ontology_notes, identity_relevance_notes:** Appended to that block as “Tags: …”, “Ontology: …”, “Relevance: …” (L47–50).  
- **identity_weight:** Not used in `getSourceContextForSession`. Used only in [identity/bootstrap/route.ts](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\apps\studio\app\api\identity\bootstrap\route.ts) for ordering (L28–29: order by `identity_weight` desc nulls last, then `ingested_at`).

**Chat vs session context**  
- **Chat:** [chat/route.ts](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\apps\studio\app\api\chat\route.ts) L143–150: `getBrainContext(supabase)` → `buildWorkingContextString(brainContext)` → user message includes “Working context” (slice 4000).  
- **Session:** [session/run/route.ts](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\apps\studio\app\api\session\run\route.ts) L74–76: same `getBrainContext` → `buildWorkingContextString` → `sourceContext: workingContextString` passed to `runSessionPipeline`.  
- So chat and session generation use the same working-context strategy (identity + creative state + memory + source summary).

---

## 5. Identity bootstrap

**Flow**  
1. POST [identity/bootstrap/route.ts](c:\Users\guestt\OneDrive\Desktop\Twin_V1\Twin_V1\apps\studio\app\api\identity\bootstrap\route.ts).  
2. Select from `source_item` where `source_type` in (`identity_seed`, `reference`), order by `identity_weight` desc nulls last, `ingested_at` desc, limit 30 (L25–30).  
3. Build digest string from title, type, role, weight, tags, summary, content_text, extracted_text, transcript_text, ontology_notes, identity_relevance_notes (L42–71).  
4. Call OpenAI with fixed prompt: output JSON `summary`, `philosophy`, `embodiment_direction`, `habitat_direction`; “Do not invent a name” (L84–92).  
5. If active identity exists: update only those four fields, preserve `name` (L117–124). If none: insert one row with `name` null and set those four (L129–148).  
6. No creation of multiple identities; no reading of identity inside source-items or ingest.

**Name null**  
- Bootstrap never sets `name`; it only updates or creates with the four distilled fields. Identity API and UI allow `name` to be blank. Runtime uses “Unnamed Twin” / “Active Twin” when name is null. So the Twin can function with `name` null.

**Aggregation**  
- Bootstrap aggregates up to 30 eligible source items into one digest, sends to the model once, and writes a single identity row (update or insert). So many sources → one identity; no drift to multiple identities from bootstrap.

---

## 6. Gaps and risks

- **human_feedback:** Documented in data model; no table or migration. Any code expecting `human_feedback` would fail.  
- **File upload → source_item:** No endpoint. “Upload” is only a manual type.  
- **Image → source_item:** No vision pipeline; no `extracted_text` from images.  
- **Video → source_item:** No transcript or frame pipeline.  
- **identity_weight in context:** Used for bootstrap ordering only; not included in the text sent to the model in session/chat (by design; it’s for weighting, not prose).  
- **buildWorkingContextString:** Now includes `philosophy` (added in this audit). Previously identity.philosophy was in DB but not in the working context string.

---

## A. What is fully working

- **Schema:** source_item (with V2 fields), identity, memory_record, artifact, critique_record, evaluation_signal exist and match code usage. Migrations ordered correctly.  
- **Separation:** source_item never writes to identity; ingest and source-items APIs only touch source_item.  
- **Single active identity:** Loaded via `is_active = true`, `status = 'active'`, limit 1.  
- **Manual source creation:** Form → POST source-items → DB; all annotation fields accepted and stored.  
- **URL webpage ingestion:** Import from URL → fetch → htmlToText → one source_item; origin_reference, media_kind, source_metadata stored.  
- **Runtime:** getSourceContextForSession selects identity_seed/reference, builds string from summary, content_text, extracted_text, transcript_text, tags, ontology_notes, identity_relevance_notes; getBrainContext + buildWorkingContextString include identity (name, summary, philosophy, embodiment, habitat), creative state, memory, source summary.  
- **Chat and session:** Both use the same working context (getBrainContext + buildWorkingContextString).  
- **Bootstrap:** Reads source_item, builds digest, one model call, updates or creates one identity row; name preserved/null.  
- **Identity API:** GET/PATCH identity, POST identity/bootstrap; name optional; no identity creation from source-items.  
- **PATCH source-items/[id]:** Updates annotations; does not touch identity.

---

## B. What is partially wired

- **identity_weight:** Stored and used for bootstrap ordering; not exposed in the session/chat context string (intentional).  
- **source_role:** Stored and returned in API and list; not yet used in getSourceContextForSession filtering (only source_type is). Could be used later to exclude `archive_only`.  
- **general_notes:** Stored and in GET; not included in getSourceContextForSession (only ontology_notes and identity_relevance_notes are).  
- **Seed default identity:** POST seed-default-identity creates two identity_seed items from provided markdown; you still run bootstrap once to distill identity.

---

## C. What is missing

- **human_feedback table:** In data model only; not in migrations.  
- **File upload ingestion:** No route that accepts file upload and creates source_item.  
- **Image ingestion:** No “upload image → vision → source_item with extracted_text”.  
- **Video ingestion:** No transcript or frame analysis → source_item.  
- **Webpage images:** No detection or vision on page images during URL ingest.  
- **DB constraint for single active identity:** Only one active row is *queried*; there is no unique partial index or constraint enforcing “at most one is_active = true”.

---

## D. What to test next

1. **End-to-end source → context:** Add 2–3 source items (manual + one URL import), set type identity_seed/reference, add tags and identity_relevance_notes. Run a session and open chat; confirm replies reflect the source content and identity.  
2. **Bootstrap:** Run “Generate initial identity from source library” with several sources; confirm one identity row updated/created, name unchanged if null.  
3. **Seed default identity:** POST /api/source-items/seed-default-identity with personalityMarkdown and tasteMarkdown (e.g. from the two Harvey docs), then run bootstrap; confirm personality + taste appear in identity and in context.  
4. **URL ingest:** Import a known-good article URL; confirm one source_item with correct title and content_text and origin_reference.  
5. **Name null:** Leave identity name blank; run chat and session; confirm no errors and fallback label in UI.

---

## E. Schema / runtime mismatches

- **Table name:** Code and schema use `identity`; some docs say `twin_identity`. No code mismatch.  
- **identity.philosophy:** Now included in buildWorkingContextString (fixed in this audit).  
- **human_feedback:** Documented but no table; any code that expected to read/write it would fail. Currently no such code in the audited paths.  
- **source_item.general_notes:** In DB and in GET/POST/PATCH; not in getSourceContextForSession output. So stored but not yet used in context (could add later).
