# Constructive challenge behavior — audit

## 1. Whether the Twin only challenges when the intended signals exist

**Intended signals (from prompt):**
- Logical contradiction in what was said
- Weak or missing evidence for a claim
- Tension between the idea and identity philosophy/sources
- Recurring pattern that conflicts with the suggestion
- Clearly better alternative suggested by context (sources, memory)

**In practice:** The model has no structured “signal” input; it only has natural language Working context (identity, creative state, memory, source summary) and Harvey’s message. So “only when signals exist” is enforced only by instruction: “Only consider challenging when at least one of these is present.” There is no schema or flag that gates challenge. The Twin can therefore challenge when it *infers* one of these (e.g. “this seems to conflict with your philosophy”) or skip when it shouldn’t. Without logged examples we can’t verify rate of false positives/negatives, but the design is **instruction-only** — no hard gate.

**Verdict:** Working as designed (instruction-based). If you see challenges when none of the five conditions hold, that’s over-challenge; if you see no challenge when they do hold, that’s under-challenge.

---

## 2. Whether challenge tone stays constructive and respectful

**Prompt:** “If you challenge, be constructive and respectful.” “Never be adversarial or dismissive. Alignment with Harvey and identity governance are unchanged.”

**In practice:** Tone is fully delegated to the model. The prompt doesn’t define “constructive” (e.g. “assume good intent,” “offer one alternative,” “invite rather than correct”). So we rely on the model’s default interpretation. Typical instruction-tuned models tend to stay polite, but “constructive” can still read as slightly preachy or over-explaining if the model leans into justification.

**Verdict:** Likely okay; worth monitoring. If challenges feel like lectures or corrections, tighten tone in the prompt (see adjustments below).

---

## 3. Whether identity stability score influences challenge strength in a meaningful way

**What the model sees:** One line in Working context: `Identity stability score: 0.XX` (e.g. 0.45). No breakdown, no threshold, no “rich” vs “thin” definition.

**Prompt:** “Challenge with more confidence when your working context shows strong evidence (Identity stability score higher, rich Source context or Recent memory). When evidence is thin, either do not challenge or phrase it very softly (e.g. ‘I wonder if…’ or ‘One other angle could be…’).”

**In practice:** “Higher” and “thin” are undefined. The model doesn’t know if 0.4 is low or 0.7 is high. So stability score can influence tone only in a vague, relative way (e.g. “I see a number; if I think it’s high I’ll be bolder”). Without calibration, the effect is **weak and inconsistent**.

**Verdict:** Influence is **too weak**. The score is present but not actionable. Small prompt tweak: give a single, simple band (e.g. “If Identity stability score is below 0.5, phrase challenges very softly or skip; if 0.5 or above, you may challenge a bit more directly when a signal is clear.”) so the number has a clear behavioral meaning.

---

## 4. Over-challenging, under-challenging, or correct

**Prompt:** “Do this rarely and only when the situation clearly warrants it. Most replies should be straightforward agreement, acknowledgment, or helpful follow-up.”

**In practice:** “Rarely” and “clearly warrants” are qualitative. Without telemetry we can’t measure frequency. In principle:
- **Over-challenge:** Twin pushes back or suggests alternatives on routine agreement or simple questions.
- **Under-challenge:** Twin never challenges even when Harvey’s idea clearly conflicts with philosophy/sources or evidence is missing.
- **Correct:** Challenge only when one of the five signals is present and the reply is still mostly agreement/acknowledgment.

**Verdict:** Design is correct; calibration is model- and context-dependent. If you observe over-challenge, add one line: “Default to agreement or acknowledgment; only add a challenge when one of the five conditions is clearly present.” If under-challenge, add: “When you notice a clear tension or missing evidence, it’s okay to offer one soft observation and alternative.”

---

## 5. Whether the format Observation → Question → Alternative appears (even if soft)

**Prompt:** “Use the format: Observation (what you notice) → Question (genuine open question) → Alternative (one possible direction). Example: ‘I may be mistaken, but there seems to be a tension between X and Y. Would it make sense to explore Z instead?’”

**In practice:** The model is instructed to use this structure but can collapse or reorder it (e.g. one sentence that blends observation + question). Soft phrasing (“I wonder if…”, “One other angle…”) is allowed, so the format may be implicit rather than three distinct clauses.

**Verdict:** Format is requested but not enforced by schema. You may see: full three-part structure, two-part (e.g. observation + alternative), or one blended sentence. If you want the structure to show more consistently, add: “Keep the three parts distinct: one sentence for what you notice, one genuine question, one possible direction.”

---

## Summary: what’s working, too strong, too weak, prompt tweaks

### What is working
- **Gating logic:** The five conditions are clearly listed; the model is told to challenge only when at least one is present.
- **Tone guardrails:** “Constructive and respectful,” “never adversarial or dismissive” set the right direction.
- **Rarity:** “Do this rarely” and “most replies should be straightforward” keep challenge in a supporting role.
- **Format:** Observation → Question → Alternative is specified with an example; when the model follows it, replies are clear and scoped.

### What feels too strong
- **Stability score wording:** “Challenge with more confidence when… Identity stability score higher” can encourage the model to challenge whenever it sees *any* stability score, if it interprets “higher” loosely. Making the rule “only when a signal is clearly present” and using stability to modulate *how* (soft vs direct) rather than *whether* reduces that risk.
- **“Clearly better alternative”:** This signal is broad; the model might treat any alternative it thinks of as “clearly better.” Tightening to “a better alternative that is clearly suggested by your Source context or Recent memory (not just your own preference)” keeps challenges evidence-based.

### What feels too weak
- **Identity stability score:** No numeric band, so the model can’t reliably “challenge with more confidence” vs “phrase very softly.” Adding a single band (e.g. &lt; 0.5 → very soft or skip; ≥ 0.5 → may be a bit more direct when a signal is clear) makes the score behaviorally meaningful.
- **Format:** If challenges often skip the three-part structure, the prompt doesn’t insist on it. Asking to “keep the three parts distinct” strengthens format adherence without new schema.

### Small prompt adjustments (no new schema)

1. **Stability score calibration (one line):**  
   After “When evidence is thin, either do not challenge or phrase it very softly,” add:  
   “If Identity stability score in your context is below 0.5, prefer very soft phrasing or skipping the challenge; if 0.5 or above and a signal is clear, you may phrase the challenge a bit more directly.”

2. **Tighten “clearly better alternative”:**  
   Change “or a clearly better alternative suggested by your context (sources, memory)” to  
   “or a better alternative that is clearly suggested by your Source context or Recent memory (not merely your own preference).”

3. **Default to agreement:**  
   Add one sentence after “Most replies should be straightforward agreement…”:  
   “Default to agreement or acknowledgment; only add a challenge when one of the five conditions is clearly present.”

4. **Optional — format:**  
   After the example, add:  
   “Keep the three parts distinct when you do challenge: one sentence for what you notice, one genuine question, one possible direction.”

These stay within the current prompt and context; no new schema or API changes required.
