# Thought Map: Governance and Rollout Plan

**Purpose:** Prevent the thought map from becoming a control system too early. Define what it is (and is not), how to roll it out safely, and what comes after.

**Companion:** [SESSION_THOUGHT_TRAJECTORY_ANALYSIS.md](./SESSION_THOUGHT_TRAJECTORY_ANALYSIS.md) — what to build. This doc — how to govern and sequence it.

---

## 1. The Biggest Mistake

**Letting the thought map become a control system too early.**

In other words:

- **Observability layer** → starts acting like **policy engine**

That is where runtimes get weird.

The thought map should begin as:

- a **reconstruction layer**
- a **debugging layer**
- an **operator interpretation layer**

It should **not** immediately start deciding:

- what thread to pursue next
- whether the agent is stuck
- whether to force exploration
- whether to suppress certain proposals
- whether to override mode/drive selection

Once you can see patterns, the instinct is: *great, now let’s have the system react to those patterns*. That is exactly how systems become unstable.

---

## 2. Why It Breaks Things

The thought map is a **derived interpretation**, not ground truth.

It is built from heuristics such as:

- thread repeat rate
- streak length
- trajectory mode snapshot
- clustering interpretation
- narrative/action labels
- proposal outcomes

Those are useful **signals**, but they are **summaries of behavior**, not the behavior itself.

If a summary directly steers the system too soon, you get feedback loops.

### Example 1: False “stickiness”

- Thought map says: **possible stickiness**
- Runtime reacts by forcing diversification
- But the agent was actually in a **productive consolidation run**
- Result: useful work is interrupted because a heuristic looked scary

### Example 2: Oscillation

- Session A says “exploratory” → controller pushes “consolidating”
- Map says “too clustered” → next session pushes “diversify”
- Map says “chaotic exploration” → controller pushes “reinforce”
- Result: runtime swings like a pendulum

### Example 3: Self-fulfilling interpretations

- Thought map labels the system as “stuck”
- Policy reacts to that label
- Runtime optimizes to **avoid the label** rather than to do good work
- Result: agent behavior becomes brittle and performative

---

## 3. The Clean Rule

**For a while, the thought map should be read-only.**

Not literally read-only in code — **architecturally advisory only**.

That means:

- visible in runtime
- usable by humans
- usable in offline analysis
- maybe included in prompt context later in a **constrained** way

It does **not** yet mean:

- a first-class override mechanism for mode, drive, thread, or proposal logic

---

## 4. The Three Layers (Don’t Collapse 2 and 3)

The deeper mistake is confusing these three layers:

| Layer | Name | Contents |
|-------|------|----------|
| **1** | **What happened** | Raw runtime facts: thread ids, mode, drive, created artifacts, proposal outcomes, review records |
| **2** | **What it seems to mean** | Interpretation: exploratory, consolidating, clustering, diversifying, possible stickiness |
| **3** | **What to do next** | Control: keep going, switch thread, reinforce, diversify, reduce proposal pressure |

**The bug:** A lot of teams collapse **layer 2** and **layer 3** together.

**The rule:** The thought map should live **mostly in layer 2** for now. Layer 3 (what to do next) stays in the existing primary selection systems until the thought map has proven stable and the rollout stages below have been followed.

---

## 4.1 Source-of-truth hierarchy

When layers disagree, engineers must know **which layer wins**. Formalize the order:

1. **Raw runtime facts** (session trace, artifact ids, proposal outcomes, review records)
2. **Persisted session snapshot** (e.g. `creative_state_snapshot`, per-session trajectory snapshot in trace)
3. **Derived trajectory review** (e.g. `trajectory_review` rows: outcome_kind, narrative_state, action_kind)
4. **Thought-map interpretation** (clustering summary, posture, thread repeat rate, etc.)
5. **Any policy hint derived from the thought map** (future Stage 2+ biases)

**Rule:** In case of mismatch, **higher in the list wins**. The thought map must not become the authoritative narrative of what happened when the underlying session trace or persisted snapshot says otherwise. This fits the existing architecture audit, which already distinguishes persisted state, trajectory review, and higher-level selection/control systems.

---

## 5. Safest Principle

**Never let a heuristic summary directly override a primary selection system unless it has proven stable over time.**

In this architecture, the **primary selection systems** are:

- mode selection
- drive selection
- trajectory derivation
- proposal pressure
- selection source logic

The thought map should **inform** those later, not replace them.

---

## 6. Rollout Stages (Right Order)

Use this progression; do not skip to control.

### 6.1 Stage 1: Hard contract (operationally testable)

**Observability only** is not just prose — it must be enforced at code boundaries.

**Contract:** In Stage 1, the thought map **may not be read by** any function that computes:

- mode (session mode)
- drive
- focus (project/thread/idea selection)
- proposal eligibility
- proposal pressure
- selection source

So: thought map is built and exposed for humans and for offline analysis only. No selection or control path may take thought map as input.

**Why this matters:** The architecture audit already shows two real closure gaps elsewhere: (1) no-artifact sessions do not always advance `creative_state_snapshot`, and (2) `trajectory_review` still does not feed mode/drive directly. Those are reminders that "advisory only" must be enforced in **code boundaries**, not only in documentation. A simple test: grep (or equivalent) for any call to the thought-map API or thought-map derivation from inside mode selection, drive selection, focus selection, proposal logic, or selection-source logic. In Stage 1, there must be none.

### 6.2 Stage 2: Soft bias (defined before implementation)

**Soft bias only** must stay numerically and structurally bounded so it cannot drift into control.

**Rule:** Any thought-map-derived adjustment must be a **small delta on an existing selector**, never a **branch replacement**.

- **Allowed:** Slightly modify a weight; slightly increase or decrease proposal pressure; add one advisory flag that a primary selector may optionally take into account.
- **Not allowed:** Force a thread switch; suppress a lane entirely; overwrite the primary mode; replace a selection branch with a thought-map-driven branch.

Define this **before** Stage 2 is implemented so the implementation cannot "slightly" become forceful.

### 6.3 Stage 3: Counterfactual review before go-live

Before any Stage 3 feedback rule goes live, **backtest** it.

**Requirement:** Replay recent sessions offline and ask, for each place the rule would have applied: would this bias have **improved** the next decision, **made no difference**, or **made it worse**?

This turns rollout from "we believe this rule sounds sensible" into "this rule survives counterfactual review." It is how you prevent the pendulum problem: a rule that looks good in isolation may push the system into oscillation when applied live.

### 6.4 Stages summary table

| Stage | Name | What the thought map does | Control effect |
|-------|------|----------------------------|----------------|
| **1** | **Observability only** | Build and show: session, thread, transition, streak, trajectory mode, posture, clustering summary. **No selection path may read it.** | **None.** Enforce via code boundary (see §6.1). |
| **2** | **Advisory signal** | Trajectory logic can see a **tiny** summary from the thought map (e.g. recent thread repeat rate, last 5 sessions exploratory vs consolidating, low proposal production despite high pressure). All adjustments = small deltas only (see §6.2). | **Soft bias only.** Never a hard override; no branch replacement. |
| **3** | **Guardrailed feedback** | After stable behavior and **counterfactual review** (see §6.3), allow **narrow** feedback rules. E.g.: repeat rate extreme for 10+ sessions and low proposal yield → gently favor diversify; long exploration with no consolidation → gently raise reinforce pressure. | **Still no hard switching.** |
| **4** | **Policy integration** | Only later does it influence broader runtime policy, and even then with **bounded** effects. | Bounded; never “thought map says X therefore force Y” as a primary path. |

---

## 7. What This Means for the Current Build

The current plan in [SESSION_THOUGHT_TRAJECTORY_ANALYSIS.md](./SESSION_THOUGHT_TRAJECTORY_ANALYSIS.md) is **good** because it avoids the trap:

- persistence of per-session trajectory snapshot
- a derivation module (thought map)
- runtime exposure
- debug visualization

That is **Stage 1 — Observability only.** Correct.

**Thing to avoid next:** Saying *“now that we have posture and clustering, let’s make it steer session selection immediately.”* Don’t do that yet. Stay in Stage 1 until the team has used it for debugging and interpretation and is ready to design Stage 2 (advisory signal) explicitly.

### 7.1 Prerequisites before Stage 2

Before the thought map may inform any selection path (Stage 2), the following must be true. These align with the architecture closure audit and single-session runtime build map:

| Prerequisite | Rationale |
|--------------|-----------|
| **No-artifact sessions must persist an up-to-date state snapshot** | Otherwise next-session mode/drive are not reflecting the last run; adding thought-map bias on top of stale state would compound the problem. |
| **At least one trajectory-derived signal must be wired into next-session state or mode/drive through an explicit adapter** | Closure: trajectory_review (or synthesis pressure) should influence mode/drive via a named, bounded path before thought map adds a second source of bias. |
| **Runtime must expose enough traceability to show which signals were advisory versus decisive** | Required for counterfactual review and for the Selection Evidence Ledger (see §8). Without this, you cannot tell whether a decision came from backlog pressure, recurrence, thought-map bias, or governance. |
| **System proposal authority remains human-only** | Governance boundary: runner does not create system proposals. Thought map must not become a back door. |
| **Drive remains descriptive unless product changes canon** | Per creative_metabolism canon, drive is observability only. Do not let thought map "inject" drive until product explicitly chooses drive as steering input. |

Keeping these prerequisites in the governance doc ties rollout to the actual architecture state instead of leaving it abstract.

---

## 8. Systems After Thought Map (Sequence)

This is the natural order from where you are. Order matters. **Proposal governance** is placed before **Habitat Selection Engine** so the brake is in place before the engine gets stronger (avoids tool explosion and premature system proposals).

| # | System | Purpose (short) | Output / role |
|---|--------|------------------|----------------|
| **1** | **Thought Map** | Reconstruct recent cognition; make continuity legible; operator visibility | Session-by-session interpreted trajectory view. **You are here.** |
| **2** | **Selection Evidence Ledger** (or Decision Rationale Ledger) | Record which signals were present and which actually influenced each decision | Once the thought map (or any adapter) begins informing selection, debugging requires a legible causal chain: did the runtime diversify because of backlog pressure, recurrence, taste, thought-map advisory bias, or proposal governance? A thin evidence ledger keeps this explicit. Fits the audit's care about what is read, what is persisted, and what closes the loop. |
| **3** | **Trajectory Feedback Adapter** | Translate thought map into **tiny advisory inputs** for trajectory derivation | Bias hints only, e.g. `gently_reduce_repetition = true`, `favor_consolidation = mild`, `proposal_pressure_adjustment = -1`. Not "switch thread now" or "force diversify." All adjustments bounded per §6.2. |
| **4** | **Intent Health** | Measure health of cognitive behavior over time | Thought map says *what happened*; intent health says *whether the pattern is healthy*. Split into two subdomains (see §8.1) so low output is not misread as bad cognition when the system may be in healthy incubation. |
| **5** | **Proposal Governance** hardening | Rate proposal quality; avoid duplicates; detect premature system proposals; suppress low-value churn; route by lane and confidence | Prevents tool explosion and capability thrash. **Harden before or alongside Habitat Selection** so the brake is in place before the system proposes new media/surfaces/systems at scale. |
| **6** | **Habitat Selection Engine** | Decide what kind of thing an idea should become: surface / medium / system | Move from "generate content" to "propose changes to own expressive environment." Inputs eventually: session trajectory, thought map, intent health, proposal backlog, acceptance patterns, concept family pressure. |
| **7** | **Medium Learning / Capability Memory** | Learn which media types lead to accepted outcomes, which proposal classes stall, which surfaces attract refinement, which system proposals are too early | Practical sense of *what kinds of externalization work here*. |
| **8** | **Multi-session Scheduler / Swarm Substrate** | Coordinate multiple active trajectories; schedule different thought lines; parallel explorations; merge/compare branches | Only once **one session = one coherent thought loop** is stable. Otherwise you multiply confusion. |

### 8.1 Intent Health: two subdomains

Intent Health should **not** treat all "unhealthy" signals the same. Split into:

- **Behavioral health** — shape of cognition: churn, stickiness, oscillation, collapse into repetition. Answers: is the runtime thrashing, stuck, or oscillating?
- **Productive health** — output value: proposal acceptance, artifact-to-proposal ratio, refinement depth, useful continuation. Answers: is the runtime producing valued outcomes?

**Why split:** Low output can be **healthy incubation** (e.g. deep work on one thread with few proposals). Reading low output as "bad cognition" would wrongly push the system to diversify or produce more. Keeping behavioral vs productive distinct prevents that trap.

---

## 9. Correct Near-Term Order (Summary)

From where you are now:

1. **Thought Map** (Stage 1 — observability only; enforce hard contract §6.1)
2. **Selection Evidence Ledger** (before any thought-map-derived bias: record which signals influenced each decision)
3. **Trajectory Feedback Adapter** (soft bias only per §6.2; no overrides)
4. **Intent Health** (behavioral + productive subdomains per §8.1)
5. **Proposal Governance** hardening
6. **Habitat Selection Engine**
7. **Medium Learning / capability memory**
8. **Multi-session orchestration**

**Why order matters:**

- **Proposal governance** before (or alongside) **habitat selection** so the brake is in place before the system proposes new media/surfaces/systems at scale.
- If you jump to **habitat selection** before intent health and feedback discipline, you risk a very creative but chaotic system.
- If you jump to **swarm** before one-session coherence is solid, you multiply confusion.

---

## 10. Do-not-infer warnings (thought map)

The thought map is built from heuristics. It **cannot** conclude the following; teaching this explicitly prevents the implementation from treating them as facts:

- **Do not infer success from novelty alone.** New threads or new proposals are not necessarily good outcomes.
- **Do not infer failure from repetition alone.** Productive consolidation can look like repetition; the map cannot label it "stuck" by default.
- **Do not infer "stuck" from long thread streaks alone.** A long streak may be deliberate deepening, not inertia.
- **Do not infer "healthy" from high proposal volume alone.** High volume can be churn; low volume can be incubation.

These match the examples already in this doc: productive consolidation mistaken for stickiness, exploration that looks healthy but is shallow. The thought map describes **what it seems to mean** (layer 2); it does not get to decide **what to do next** (layer 3) or to treat these inferences as ground truth.

---

## 11. Checklist for Thought Map Work

When implementing or extending the thought map, ask:

- [ ] Is this change **observability only** (Stage 1)? If so, does any selection path read the thought map? (Stage 1 contract: **none** may — see §6.1.)
- [ ] If it changes selection: is it a **small delta** (Stage 2 per §6.2) with no branch replacement, or a direct policy (Stage 4)?
- [ ] Are we using **layer 2** (what it seems to mean) to **inform** layer 3 (what to do next), or are we letting the heuristic **replace** primary selection?
- [ ] On mismatch, does **source-of-truth hierarchy** (§4.1) give the win to raw facts / persisted snapshot over thought-map interpretation?
- [ ] Would a future engineer be tempted to “recompute thought map for past sessions” or “make thought map steer session selection immediately”? If yes, document the rule and keep the thought map architecturally advisory.
- [ ] For any Stage 3 rule: has **counterfactual review** (§6.3) been done before go-live?

---

**Status:** Plan only. No code changes in this doc. Use it to govern the Thought Map build and the sequence of systems that follow.
