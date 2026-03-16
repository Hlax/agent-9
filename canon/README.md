# Agent-9 Canon

Constitutional source of truth for the Agent-9 architecture builder. Loaded at runtime by the server-only canon loader (`apps/studio/lib/canon/`). Do not import these files directly from client code.

- **core/** — What exists: ontology, agents, proposal types, lanes.
- **governance/** — What is allowed: rules, promotion requirements, block conditions.

See `docs/05_build/CANON_WIRING_IMPLEMENTATION_MEMO.md` and `docs/05_build/CANON_WIRING_PASS1_MEMO.md` for wiring and pass-1 details.
