# Deploy self-audit: Twin proposes public habitat + avatar it made

**Success metric:** The Twin can propose (1) a public habitat and (2) an avatar that it made itself; Harvey reviews, approves (staging → publication), and the public site shows them.

**Verdict: DEPLOYABLE — meets success metric, provided migrations are applied.**

---

## 1. Avatar: Twin proposes an avatar it made

| Step | Status | Evidence |
|------|--------|----------|
| Twin produces image | ✓ | Session pipeline: `preferMedium === "image"` → `generateImage()`. Empty-body cron: 12% of runs set `preferMedium = "image"` (session/run route). |
| Avatar proposal created | ✓ | Session run: when `artifact.medium === "image"`, insert `proposal_record` with `target_type: "avatar_candidate"`, `artifact_id`, title, summary, preview_uri. One proposal per image (dedup by artifact_id). |
| Harvey sees proposal | ✓ | Review → Surface → Avatar fetches `target_type=avatar_candidate`. Pending/Approved/Archived tabs; `proposal_state=approved` includes approved_for_staging and approved_for_publication. |
| Approve for staging | ✓ | Button sends `action: "approve_for_staging"`; state → approved_for_staging. |
| Approve for publication | ✓ | Button sends `action: "approve_for_publication"`. Approve route: validates proposal.artifact_id is image and approved, sets `identity.active_avatar_artifact_id`, writes change_record. |
| Public site shows avatar | ✓ | GET /api/public/identity returns avatar from active_avatar_artifact_id; public page renders it. |

**Gate:** Image artifact must be approved (in Artifact review) before "Approve for publication" on the avatar proposal succeeds. Intentional: Harvey approves the artifact first, then approves it as the public avatar.

---

## 2. Habitat: Twin proposes a public habitat it designed

| Step | Status | Evidence |
|------|--------|----------|
| Twin produces concept | ✓ | Session pipeline: when not image, `generateWriting()` with mode (reflect → concept). |
| Habitat proposal created | ✓ | Session run: when `artifact.medium === "concept"` and `isProposalEligible()`, build minimal payload from title/summary, validate; insert proposal with `target_surface: "public_habitat"`, `habitat_payload_json`, short summary. |
| Harvey sees proposal | ✓ | Review → Surface → Habitat fetches `target_type=public_habitat_proposal,concept`. Concept proposals with payload have `target_surface` / `habitat_payload_json`. |
| Approve for staging | ✓ | When no payload: button "Approve for staging", action approve_for_staging. |
| Approve for publication | ✓ | When `target_surface === "public_habitat"` or `habitat_payload_json` present: button "Approve for publication", action approve_for_publication. Route validates payload, checks artifact refs, upserts public_habitat_content (slug, payload_json). |
| Public site shows habitat | ✓ | GET /api/public/habitat-content validates and returns payload; public page renders HabitatBlocks when payload present. |

---

## 3. Migrations required

| Migration | Purpose |
|-----------|---------|
| 20250310000001_proposal_record_concept_fields | artifact_id, target_surface, proposal_type on proposal_record. |
| 20250310000003_identity_active_avatar | active_avatar_artifact_id on identity. |
| **20250310000004_habitat_v2_payload** | **habitat_payload_json on proposal_record; payload_json on public_habitat_content.** |

If 20250310000004 is not applied, session run can 500 when inserting concept proposals (column missing). Run `pnpm db:migrate` and apply any pending migrations before deploy.

---

## 4. Deployability

- **Secrets:** No new secrets; existing OPENAI_API_KEY, Supabase, CRON_SECRET, NEXT_PUBLIC_STUDIO_URL.
- **Public surface:** Public site and /api/public/* remain read-only; no new write paths.
- **Governance:** All approve/publish actions require auth; Twin cannot self-approve or self-publish.
- **Backward compatibility:** Legacy proposal flows (identity_name, approve_avatar embodiment_direction) unchanged. Old public_habitat_content rows (title/body only) still returned; payload preferred when present.

---

## 5. Edge cases checked

- **No image runs:** Cron sends empty body → we random 12% image; otherwise mode drives writing/concept. Over many cycles both avatar and habitat proposals appear.
- **Invalid habitat payload:** buildMinimalHabitatPayloadFromConcept is schema-valid; if validation failed we’d set target_surface staging_habitat and no payload (no bad insert).
- **Avatar proposal without approved image:** approve_for_publication returns 400 until the image artifact is approved.
- **Habitat list concept filter:** Proposals fetched with target_type=public_habitat_proposal,concept so concept-based habitat proposals appear in the list.

---

## 6. Conclusion

The system is **deployable** and **meets the success metric**: the Twin proposes a public habitat (via concept → proposal with structured payload) and an avatar (via image → avatar_candidate proposal) that it made itself; Harvey approves for staging then for publication; the public site shows the chosen avatar and the approved habitat payload. Apply migration 20250310000004 (and any other pending migrations) before deploy.
