# Coding Agent Architecture Rules

These rules define how AI coding agents should interact with the Twin
repository.

The goal is to prevent architectural drift while allowing rapid
development.

------------------------------------------------------------------------

# 1. Respect Canonical Vocabulary

The glossary defines canonical system terms.

Agents should not:

-   rename entities
-   introduce conflicting terminology
-   redefine glossary terms

------------------------------------------------------------------------

# 2. Preserve Architecture Layers

The system has distinct layers:

Identity Layer\
Creative Layer\
Memory Layer\
Judgment Layer\
Governance Layer\
Surface Layer

Agents should maintain separation between these layers.

------------------------------------------------------------------------

# 3. Runtime Ownership

Runtime logic belongs in:

packages/agent

UI code should not contain runtime behavior.

------------------------------------------------------------------------

# 4. Memory Ownership

Memory and archive logic belong in:

packages/memory

This includes:

-   archive entry creation
-   recurrence tracking
-   return session logic

------------------------------------------------------------------------

# 5. Evaluation Ownership

Evaluation and critique logic belong in:

packages/evaluation

UI or runtime modules should call evaluation functions rather than
implementing scoring directly.

------------------------------------------------------------------------

# 6. UI Ownership

UI code belongs in:

packages/ui\
apps/studio\
apps/habitat-staging\
apps/public-site

UI should interact with APIs rather than implementing domain logic.

`apps/studio` is the private operator surface.
`apps/habitat-staging` is the preview environment for staged artifacts and staged habitat proposals.
`apps/public-site` is the public habitat.

Agents must not place runtime orchestration, scoring logic, approval logic, or archive logic directly inside UI components.

------------------------------------------------------------------------

# 6A. Release Lane Safety

Agents must distinguish between:

- artifact approval
- artifact publication
- staging habitat review
- public habitat release

Artifact publication and habitat/site release are not the same action.

A published artifact may become visible on the public habitat through application state.

A habitat or site change is a surface release and should be treated as a staged implementation change that requires:
- Harvey review
- explicit approval
- controlled promotion from staging to public

Do not treat a habitat change like an ordinary artifact publication event.
Do not assume that approval of a concept artifact automatically changes the public site.

------------------------------------------------------------------------

# 7. Avoid Tight Coupling

Agents should prefer:

clear interfaces\
small modules\
explicit dependencies

This makes future agent-driven development easier.

------------------------------------------------------------------------

# 8. Logging and Observability

The system should log:

-   session start/end
-   artifact generation
-   critique results
-   evaluation scores
-   approval decisions

This allows debugging and governance review.

------------------------------------------------------------------------

# 9. Testing Expectations

Agents should include tests for:

runtime session loop\
evaluation scoring\
archive logic

Core logic must be testable without UI.

------------------------------------------------------------------------

# 10. Guiding Principle

The Twin is a **long‑lived creative system**, not a simple content
generator.

Development decisions should prioritize:

continuity\
traceability\
governance\
creative evolution
