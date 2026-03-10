# Integrating Harvey Identity Seed (personality) and Taste Profile (taste)

Two canonical identity seed documents:

- **harvey_identity_seed_expanded.md** → personality / working identity (values, collaboration style, creative temperament).
- **harvey_taste_profile.md** → taste (aesthetics, story taste, character taste, anti-taste, tagging hints).

Both should form the **base** of the agent’s identity: personality + taste.

---

## Option A: Through Studio (fully wired today)

1. **Source library** → Add source item.
2. Create **first item**: title e.g. `Harvey identity seed (personality)`, type **identity_seed**, paste the full content of `harvey_identity_seed_expanded.md` into Content (and optionally Summary). Add tags/identity_relevance_notes if you want.
3. Create **second item**: title e.g. `Harvey taste profile`, type **identity_seed**, paste the full content of `harvey_taste_profile.md` into Content.
4. **Identity page** → “Generate initial identity from source library” to run bootstrap. The Twin’s single active identity (summary, philosophy, embodiment, habitat) is then distilled from these two sources plus any other identity_seed/reference items.
5. Chat and sessions already use that identity + all source evidence via the same working context.

No code changes; everything flows through existing pipeline.

---

## Option B: Hard-add (one-time seed)

Use the **seed-default-identity** API once to create the two source items from the doc contents without pasting in the UI:

- **POST /api/source-items/seed-default-identity**  
  Body: `{ personalityMarkdown?: string, tasteMarkdown?: string }`.  
  Creates two **identity_seed** source items: one titled “Harvey identity seed (personality)” with `content_text = personalityMarkdown`, one titled “Harvey taste profile” with `content_text = tasteMarkdown`. Only creates if provided; never touches existing identity row.

You can call this from a script or from the browser (e.g. fetch with the two markdown strings). After that, run bootstrap from the Identity page as in Option A.

---

## Recommendation

- **Fastest:** Option A (paste both docs as two manual source items, then bootstrap).
- **Repeatable / scripted:** Option B (seed API + bootstrap call).

Both keep a single canonical identity; sources remain evidence that inform it.
