# Habitat V2 — Safe structured payloads (canon)

Habitat V2 lets the Twin propose and publish **front-end-only** habitat changes using **structured payloads** derived from concepts. The habitat is a **visual composition system** (gallery/art installation), not a system-control surface.

Canon: constitution (public curated by Harvey), public_habitat, concept_to_proposal_flow, approval_state_machine.

---

## 1. Safety boundary

Habitat payloads, rendering, and proposal execution must **never**:

- create, update, delete, or mutate database records outside the normal approval/publish flow
- call server actions or API mutations from public habitat interactions
- accept free-text input from visitors, uploads, forms, auth flows
- expose secrets, env, internal state, or admin controls
- trigger deployments, approvals, or publication from the public site
- execute arbitrary code; inject HTML, scripts, iframes, or untrusted URLs
- alter identity/system records from the public surface

**Allowed:** page composition, narrative framing, featured artifact curation, visual themes, safe motion/decorative interactivity, non-persistent client-side display, static presentation of already approved public content.

---

## 2. Payload schema

Habitat proposals use a **typed structured payload** (versioned, allowlisted block types only).

- **Top level:** `version`, `page` (home | works | about | installation), optional `theme`, ordered `blocks`.
- **Theme:** `tone`, `density`, `motion`, `surfaceStyle` from allowlisted tokens.
- **Blocks:** strict allowlist: hero, text, quote, artifact_grid, featured_artifact, concept_cluster, timeline, ambient_motif, divider, marquee. Each block has `id`, `type`, and type-specific safe fields only. No generic custom_html, embed, script, or arbitrary JSON execution.
- **Artifact references:** only already approved/public artifact IDs. Validated before storage and before render.

---

## 3. Validation

- Validate before persistence as a habitat proposal, before publish, and before public render.
- Reject: unknown block types, extra/unrecognized fields, unsafe URLs, raw HTML/script, event handlers, excess depth, oversized payloads, references to non-public artifacts, malformed theme/page.
- Prefer schema validator (e.g. Zod). Fail closed.

---

## 4. Governance

Unchanged: concept → proposal → Harvey review → approve → publish. The Twin proposes; it cannot self-approve or self-publish. Habitat V2 flows through the same approval and change_record rules.

---

## 5. Concept guidance

When the Twin generates habitat-oriented concepts, it should reason in terms of: which page, what theme/mood, which safe blocks, which approved artifacts are featured, and what visual/narrative effect results. It must not propose visitor input, forms, system control, or deployment. Unsafe intent is converted into safe visual metaphor (e.g. “visitors talk to Twin” → “display fragments as ambient text panels”).
