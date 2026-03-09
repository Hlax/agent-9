# Source Library Ingestion

This document defines how external material enters the Twin's source library.

Source material helps the Twin draw from prior references,
inspiration, and contextual input.

---

# 1. Source Library Purpose

The source library allows the Twin to work with:

- references
- prompts
- fragments
- transcripts
- images
- moodboards
- documents
- research

Source items are **inputs**, not artifacts.

Artifacts are generated outputs.

---

# 2. Source Item Types

Examples of V1 source types:

note  
prompt  
reference  
transcript  
image_reference  
fragment  
upload

Source types remain flexible in V1.

---

# 3. Ingestion Methods

Sources may enter the system through:

### Manual Upload

Harvey uploads a file or text input.

Examples:

- image reference
- prompt fragment
- transcript

---

### URL Import

The system imports a page or document.

Examples:

- article
- webpage
- research reference

---

### Clipboard Ingest

Quick paste into the studio interface.

Examples:

- idea fragments
- notes
- quotes

---

# 4. Source Metadata

Suggested fields:

title  
summary  
source_type  
content_text  
content_uri  
origin_reference

These fields correspond to the source_item entity in the data model.

---

# 5. Source Usage

Source items may be used during sessions to:

- inspire artifact generation
- seed ideas
- inform projects
- provide references

Source items are not automatically turned into artifacts.

---

# 6. Source Retention

Sources should remain searchable and persistent.

Even unused sources may become useful later during:

- return sessions
- exploration sessions
- synthesis events

---

# 7. Future Expansion

Possible later features:

- vector search
- semantic clustering
- auto tagging
- theme detection