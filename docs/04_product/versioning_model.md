# Twin Versioning Model

This document defines how versions of the Twin system are labeled,
tracked, and evolved.

Versioning applies to:

- identity versions
- governance documents
- system behavior
- product surfaces
- runtime interpretation

The goal is to ensure the Twin evolves **traceably** without silent drift.

---

# 1. Versioning Layers

The Twin uses three layers of versioning.

### Identity Version

Tracks the current identity state of the Twin.

Examples:

v1_identity  
v2_identity

Identity versions represent major shifts in philosophy, creative values,
or embodiment direction.

---

### System Version

Tracks runtime and governance structure.

Examples:

v1_system  
v2_system

This includes:

- evaluation interpretation
- session loop behavior
- governance rules
- archive logic

---

### Product Version

Tracks the public platform and UI.

Examples:

v1_product  
v2_product

This includes:

- studio UI
- habitat UI
- publishing workflow
- ingestion tools

---

# 2. Version Labels

Recommended version label structure:

v{major}.{minor}

Examples:

v1.0
v1.1
v1.2

---

### Major Version

Represents significant conceptual change.

Examples:

- identity rewrite
- governance restructuring
- runtime redesign
- product architecture shift

---

### Minor Version

Represents incremental improvement.

Examples:

- UI improvements
- additional surfaces
- ingestion improvements
- evaluation tuning

---

# 3. Version Activation

Versions become active when:

- Harvey approves the change
- a change record is written
- affected documents are updated

The previous version should remain historically accessible.

---

# 4. Version and Change Records

Version updates should be linked to:

- change_record entries
- updated documents
- repo commits

Versioning answers:

Which version exists?

Change records answer:

Why it changed.

---

# 5. V1 Version Definition

V1 represents the first operational Twin system.

V1 includes:

- ontology
- runtime
- evaluation
- governance
- studio interface
- habitat surfaces
- source ingestion
- publication pipeline