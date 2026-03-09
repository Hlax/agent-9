# Private Studio

The Private Studio is the main interface used by Harvey
to interact with the Twin.

It is the primary operational control surface.

---

# 1. Studio Purpose

The studio allows Harvey to:
- start creative sessions
- review artifacts
- annotate outputs
- manage projects
- ingest source material
- approve, reject, revise, or archive artifacts
- mark artifacts approved_for_publication
- publish approved artifacts
- review staging proposals
- promote approved staging releases to public
- review system proposals

The studio is **not public**.

It is the main operational and governance interface for the Twin.

---

# 2. Studio Core Panels

Recommended V1 layout:

### Session Control

Start session  
Select project  
Select session mode  
View runtime logs

---

### Artifact Review

View artifacts generated in recent sessions.

Actions:

approve  
approve_with_annotation  
needs_revision  
reject  
archive  
approve_for_publication  
publish

---

### Staging Review

Review staged habitat proposals and presentation experiments.

Actions:

approve_for_staging  
request_revision  
reject_for_staging  
promote_to_public_release

This panel is used for:
- layout experiments
- habitat/interface proposals
- collection previews
- staged narrative sequences
- other public-surface candidates

---

### Source Library

Upload or manage source items.

---

### Project Manager

Create and manage projects.

---

### Idea Threads

View idea lineage and branching.

---

### Archive Viewer

Browse archived threads and artifacts.

---

# 3. Review Workflow

Typical artifact workflow:

Twin generates artifacts  
↓  
Artifacts appear in studio review queue  
↓  
Harvey reviews outputs  
↓  
Approval state updated  
↓  
Optional `approved_for_publication` decision  
↓  
Optional publication

Typical habitat/surface workflow:

Twin or Harvey proposes staging habitat change  
↓  
Proposal appears in staging review queue  
↓  
Harvey reviews staging result  
↓  
Approved staging release candidate  
↓  
Optional promotion to public habitat

Artifact publication and habitat release must remain separate workflows.

---

# 4. Annotation

Harvey may attach annotations to artifacts.

Annotations may:

- guide future interpretation
- explain why something was approved
- mark experimental work

---

# 5. Manual Sessions

The studio allows Harvey to trigger sessions manually.

Example:

Start session  
Select project  
Select mode (explore / continue / reflect)

The runtime executes the session loop.

---

# 6. Studio Access

The studio should be private and authenticated.

Access is limited to Harvey and trusted collaborators.

### Review Queues

The Studio should preserve separate review queues for:
- artifact review
- surface proposals
- system proposals

These queues may share UI components, but they should not share ambiguous state language.