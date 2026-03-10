# Twin Source System — Proof (file paths and runtime behavior)

Every claim below is backed by a file path and a short description of what the code does. Anything that only looks implemented but is not executed at runtime is called out explicitly.

---

## 1. Migration files

| File | What it does |
|------|----------------|
| **`supabase/migrations/20250108000000_twin_enums.sql`** | Defines enums used by core tables (artifact_medium, approval_state, etc.). No source_item; must run first. |
| **`supabase/migrations/20250108000001_twin_core_tables.sql`** | **Lines 4–17:** Creates table `identity` (identity_id, version_label, name, summary, philosophy, creative_values, embodiment_direction, habitat_direction, status, is_active, created_at, updated_at). **Lines 290–302:** Creates table `source_item` with columns: source_item_id, project_id (FK project), title, source_type, summary, content_text, content_uri, origin_reference, ingested_at, created_at, updated_at). **Lines 304–316:** memory_record. **Lines 112–141:** artifact. **Lines 162–176:** critique_record. **Lines 179–200:** evaluation_signal. There is no `human_feedback` table in any migration. |
| **`supabase/migrations/20250108000002_rls_placeholder.sql`** | Enables RLS on identity, artifact; no source_item RLS here. |
| **`supabase/migrations/20250110000002_source_item_v2_fields.sql`** | **Lines 5–18:** ALTER TABLE source_item ADD COLUMN for: source_role, tags (TEXT[]), ontology_notes, identity_relevance_notes, general_notes, media_kind, mime_type, preview_uri, extracted_text, transcript_text, identity_weight (NUMERIC), source_metadata (JSONB), processing_metadata (JSONB). All ADD COLUMN IF NOT EXISTS. Does not touch identity. |

Migration order: enums → core (including source_item) → RLS → later app migrations → source_item V2. So V2 columns exist only after this migration is applied.

---

## 2. Schema definitions (where tables/columns are defined)

- **source_item (base):** Defined only in migration `20250108000001_twin_core_tables.sql` lines 290–302. No separate TypeScript schema file; types are implied by Supabase client and by the select/insert in code.
- **source_item (V2 columns):** Defined only in migration `20250110000002_source_item_v2_fields.sql` lines 5–18.
- **identity:** Defined in same core migration lines 4–17. Code refers to table name `"identity"` (not `twin_identity`).
- **packages/core/src/types.ts** line 259: `export interface SourceItem { source_item_id: string; ... }` — this is a TypeScript type only. It is **not** imported or used in `apps/studio` or `packages/agent` in the paths that read/write source_item. So the type exists but is not part of the runtime data flow; API responses are untyped (or inferred) from Supabase.

---

## 3. API routes

| File | Method | What the code does |
|------|--------|--------------------|
| **`apps/studio/app/api/source-items/route.ts`** | GET | **Lines 29–45:** Builds Supabase query on `source_item` with selectFields (all V2 columns listed), optional filter by type, limit, then returns `source_items`. **Not used by the Source library page:** the page uses direct Supabase in a server component (see UI section). So this GET is only executed when some client calls `/api/source-items` (e.g. future client-side fetch). |
| **`apps/studio/app/api/source-items/route.ts`** | POST | **Lines 100–142:** Parses body (title required; source_type, source_role, summary, content_text, tags, ontology_notes, identity_relevance_notes, general_notes, media_kind, mime_type, preview_uri, extracted_text, transcript_text, identity_weight, content_uri, origin_reference). **Lines 132–136:** Single `supabase.from("source_item").insert(insert).select().single()`. No reference to `identity` table. Executed when user submits the manual “Add source item” form. |
| **`apps/studio/app/api/source-items/[id]/route.ts`** | PATCH | **Lines 69–72:** `supabase.from("source_item").update(updates).eq("source_item_id", id).select().single()`. Updates only source_item columns. No identity. Executed when something calls PATCH /api/source-items/:id (no UI currently calls this in the repo; the form only POSTs new items). |
| **`apps/studio/app/api/source-items/ingest/route.ts`** | POST | **Lines 51–157:** Validates URL, fetches HTML (lines 87–95), extracts title (extractTitle) and body text (htmlToText), then **lines 125–146:** `supabase.from("source_item").insert({ title, source_type, source_role, content_text, origin_reference, media_kind, source_metadata, ... }).select().single()`. Never touches identity. Executed when user clicks “Import from URL” and the form POSTs to `/api/source-items/ingest`. |
| **`apps/studio/app/api/source-items/seed-default-identity/route.ts`** | POST | **Lines 35–37 and 54–56:** Two separate `supabase.from("source_item").insert(...)` for “Harvey identity seed (personality)” and “Harvey taste profile”. Only writes to source_item. Executed only when a client explicitly POSTs to `/api/source-items/seed-default-identity` (no button in the current UI). |
| **`apps/studio/app/api/identity/route.ts`** | GET | Reads from `identity` only (lines 23–28). No source_item. |
| **`apps/studio/app/api/identity/route.ts`** | PATCH | Reads/updates/inserts `identity` only (lines 67–96). No source_item. |
| **`apps/studio/app/api/identity/bootstrap/route.ts`** | POST | **Lines 25–30:** Reads from `source_item` (select identity_seed/reference, order by identity_weight desc then ingested_at, limit 30). **Lines 119–148:** Writes only to `identity` (update or insert one row). No insert into source_item. So source_item is read here; identity is written. |

---

## 4. Ingestion services (what actually writes to source_item)

- **Manual creation:** Implemented entirely in **`apps/studio/app/api/source-items/route.ts`** POST (see above). There is no separate “ingestion service” module; the route handler parses JSON and inserts. **Executed:** when the Add Source Item form submits (add-source-item-form.tsx calls `fetch("/api/source-items", { method: "POST", ... })`).
- **URL / webpage:** Implemented entirely in **`apps/studio/app/api/source-items/ingest/route.ts`** POST. Same file contains `extractTitle(html)` and `htmlToText(html)` (lines 13–44); no external library. Fetch happens at lines 87–95; insert at 125–146. **Executed:** when Import from URL form submits to `/api/source-items/ingest`.
- **File upload:** There is no route that accepts a multipart file and creates a source_item. No file-upload handler. **Not implemented.**
- **Image (vision → extracted_text):** No route or service that takes an image, calls a vision API, and inserts a source_item. **Not implemented.**
- **Video (transcript/frames):** No route or service. **Not implemented.**

---

## 5. Context builders (where source_item is read and turned into LLM context)

- **`apps/studio/lib/source-context.ts`**  
  - **Lines 27–56:** `getSourceContextForSession(supabase)` is the only function that reads source_item for context.  
  - **Lines 30–35:** `supabase.from("source_item").select("title, source_type, summary, content_text, extracted_text, transcript_text, tags, ontology_notes, identity_relevance_notes").in("source_type", ["identity_seed", "reference"]).order("ingested_at", { ascending: false }).limit(15)`.  
  - **Lines 40–55:** Maps each row to a string: `[type] title\n` + concatenation of (summary, content_text, extracted_text, transcript_text) truncated to 2000 chars, then optional lines for Tags / Ontology / Relevance. Joins with `\n\n---\n\n`.  
  - **Returns:** A single string or null. This string is **not** used by any code that does not go through getBrainContext (see below).  
  - **Note:** As of the latest update, the select **does** include `source_role`, `identity_weight`, and `general_notes`; they are rendered in the context string (role/weight in the header, general_notes as "Notes: …"). Ordering is by `identity_weight` (desc, nulls last) then `ingested_at` (desc).

- **`apps/studio/lib/brain-context.ts`**  
  - **Lines 51–56:** `getBrainContext` calls `getSourceContextForSession(supabase)` in a Promise.all and assigns the result to `sourceSummary`. So the only caller of `getSourceContextForSession` in the app is `getBrainContext`.  
  - **Lines 99–118:** `buildWorkingContextString(ctx)` builds one string: identity (name, summary, philosophy, embodiment, habitat), creative state line, memory block, then **if (ctx.sourceSummary)** adds `"Source context:\n" + ctx.sourceSummary.slice(0, 3000)`. So the source_item-derived string is included only as the `sourceSummary` slice.  
  - **Who calls these:** Only chat and session run (see runtime section).

---

## 6. UI forms / pages

| File | What the code does |
|------|--------------------|
| **`apps/studio/app/source/page.tsx`** | **Lines 10–21:** Server component. Gets Supabase via getSupabaseServer(); then **directly** `supabase.from("source_item").select(...).order("ingested_at", { ascending: false }).limit(100)`. Renders list from `items` (no call to GET /api/source-items). **Lines 35–40:** Renders ImportFromUrlForm. **Lines 42–45:** Renders AddSourceItemForm. **Lines 47–108:** Renders list of items (title, source_type, source_role, tags, summary/content_text, identity_relevance_notes, origin_reference, date). |
| **`apps/studio/app/source/add-source-item-form.tsx`** | Client component. **Lines 35–48:** On submit, `fetch("/api/source-items", { method: "POST", body: JSON.stringify({ title, source_type, summary, content_text, tags, ontology_notes, identity_relevance_notes, identity_weight }) })`. Then router.refresh() so the server-rendered list refetches. So manual creation goes through POST /api/source-items. |
| **`apps/studio/app/source/import-from-url-form.tsx`** | Client component. **Lines 35–43:** On submit, `fetch("/api/source-items/ingest", { method: "POST", body: JSON.stringify({ url, source_type, source_role }) })`. Then router.refresh(). So URL ingestion goes through POST /api/source-items/ingest. |
| **`apps/studio/app/identity/page.tsx`** | Fetches active identity via direct Supabase (from("identity")), renders IdentityForm. No source_item. |
| **`apps/studio/app/identity/identity-form.tsx`** | Fetches PATCH /api/identity and POST /api/identity/bootstrap. No source_item. |

**Not in UI:** There is no link or button that calls GET /api/source-items or PATCH /api/source-items/[id] or POST /api/source-items/seed-default-identity. The list does not use the API; PATCH is available but unused by the current forms; seed-default-identity must be invoked manually (e.g. curl or script).

---

## 7. Runtime code where source_item is actually consumed (end-to-end)

**Path 1 — Chat**

1. User sends a message → **`apps/studio/app/api/chat/route.ts`** POST runs.  
2. **Lines 143–144:** `const brainContext = await getBrainContext(supabase);` then `const workingContextString = buildWorkingContextString(brainContext);`.  
3. **brain-context.ts** (above): getBrainContext calls getSourceContextForSession(supabase), which runs the source_item select and returns the string; that string is ctx.sourceSummary; buildWorkingContextString includes it as "Source context:\n" + ctx.sourceSummary.slice(0, 3000).  
4. **Lines 148–150:** userInput = workingContextString ? `[Working context]\n${workingContextString.slice(0, 4000)}\n\n[Harvey's message]\n${content}` : content.  
5. **Lines 156–176 or 192–212:** That userInput is sent to OpenAI (responses API or chat.completions). So the model receives the working context string, which contains the source_item-derived block.  

**Proof:** The only way source_item data reaches the chat model is: source_item → getSourceContextForSession → getBrainContext (sourceSummary) → buildWorkingContextString → chat route userInput → OpenAI.

**Path 2 — Session run (artifact generation)**

1. User triggers session run → **`apps/studio/app/api/session/run/route.ts`** POST runs.  
2. **Lines 75–76:** `const brainContext = await getBrainContext(supabase);` then `const workingContextString = buildWorkingContextString(brainContext);`.  
3. **Lines 78–86:** `runSessionPipeline({ ..., sourceContext: workingContextString || undefined, ... })`. So the same working context string (which includes sourceSummary from source_item) is passed as sourceContext.  
4. **`packages/agent/src/session-pipeline.ts`** **Lines 78–84:** Calls generateWriting({ mode, promptContext, sourceContext: context.sourceContext }, { apiKey }) (or generateImage with same sourceContext).  
5. **`packages/agent/src/generate-writing.ts`** **Lines 26–39:** buildUserPrompt(input) uses input.sourceContext: if (input.sourceContext?.trim()) parts.push(`Relevant context:\n${input.sourceContext.trim()}`). **Line 57:** userPrompt = buildUserPrompt(input). **Lines 64–69:** messages = [{ role: "system", ... }, { role: "user", content: userPrompt }]. So the source_item-derived context is in the user message. **Line 64:** completion = client.chat.completions.create({ model, messages, ... }).  

**Proof:** source_item → getSourceContextForSession → getBrainContext → buildWorkingContextString → session/run route → runSessionPipeline → generateWriting (or generateImage) → buildUserPrompt / buildImagePrompt → OpenAI. So source_item is consumed at runtime for both chat and session generation.

**Path 3 — Identity bootstrap**

1. User clicks “Generate initial identity from source library” → **`apps/studio/app/api/identity/bootstrap/route.ts`** POST runs.  
2. **Lines 25–30:** supabase.from("source_item").select(...).in("source_type", ["identity_seed", "reference"]).order("identity_weight", ...).order("ingested_at", ...).limit(30). So source_item is read here.  
3. **Lines 42–71:** Digest string built from rows (title, type, role, weight, tags, summary, content_text, extracted_text, transcript_text, ontology_notes, identity_relevance_notes).  
4. **Lines 84–92:** OpenAI chat.completions.create with that digest; response parsed as summary, philosophy, embodiment_direction, habitat_direction.  
5. **Lines 117–148:** One identity row updated or inserted. So source_item is consumed only in this route; the result is written to identity, not back to source_item.

---

## 8. What only looks implemented but is not executed (or not used as you might expect)

- **GET /api/source-items:** Implemented and runnable, but the Source library page does **not** call it. The page uses direct Supabase in a server component. So for the current UI, this GET is never executed when viewing the list.  
- **PATCH /api/source-items/[id]:** Implemented. No Studio UI calls it (no “Edit” on a source item that PATCHes this route). So at runtime it is never executed from the app.  
- **POST /api/source-items/seed-default-identity:** Implemented. No button or link in the UI. Executed only if something (e.g. script or fetch) calls it explicitly.  
- **packages/core SourceItem interface:** Defined but not imported in apps/studio or packages/agent in the paths above. Type is not used at runtime for source_item data.  
- **source_item.general_notes, source_role, identity_weight:** Now included in getSourceContextForSession (select + string); they flow into chat/session context the same way as tags and identity_relevance_notes.  
- **identity.philosophy:** Now included in buildWorkingContextString (brain-context.ts line 105). So it is executed.  
- **human_feedback:** Documented in data model; no migration creates it. Any code that tried to read/write human_feedback would fail at runtime; no such code was found in the audited paths.

---

## 9. Summary table (proof of execution)

| Code | File path | Executed at runtime when |
|------|-----------|---------------------------|
| source_item CREATE TABLE | supabase/migrations/20250108000001_twin_core_tables.sql L290–302 | Migration run |
| source_item V2 ALTER | supabase/migrations/20250110000002_source_item_v2_fields.sql L5–18 | Migration run |
| getSourceContextForSession | apps/studio/lib/source-context.ts L27–56 | getBrainContext is called (chat or session run) |
| getBrainContext | apps/studio/lib/brain-context.ts L37–80 | Chat POST or session/run POST |
| buildWorkingContextString | apps/studio/lib/brain-context.ts L99–118 | Same two callers |
| Chat uses context | apps/studio/app/api/chat/route.ts L143–150, 156/166, 192–212 | User sends message with reply |
| Session uses context | apps/studio/app/api/session/run/route.ts L75–76, 78–86 | User runs session |
| runSessionPipeline | packages/agent/src/session-pipeline.ts L40–85 | Called by session/run route |
| generateWriting sourceContext | packages/agent/src/generate-writing.ts L26–39, 57, 64–69 | Session run (writing/concept) |
| generateImage sourceContext | packages/agent/src/generate-image.ts L22–34, 52 | Session run (image) |
| Bootstrap reads source_item | apps/studio/app/api/identity/bootstrap/route.ts L25–30, 42–71 | User clicks bootstrap button |
| Manual create (POST) | apps/studio/app/api/source-items/route.ts L132–136 | User submits Add Source Item form |
| URL ingest (POST) | apps/studio/app/api/source-items/ingest/route.ts L125–146 | User submits Import from URL form |
| Source list (UI) | apps/studio/app/source/page.tsx L15–20 | Page load (direct Supabase, not GET API) |
| GET /api/source-items | apps/studio/app/api/source-items/route.ts L29–45 | Only when some client calls GET /api/source-items (not by current list UI) |
| PATCH /api/source-items/[id] | apps/studio/app/api/source-items/[id]/route.ts L69–72 | Only when some client calls PATCH (no such UI) |
| seed-default-identity | apps/studio/app/api/source-items/seed-default-identity/route.ts | Only when explicitly invoked |
