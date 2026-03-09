# V1 Vertical Slice

This document defines the first end-to-end proof required before the Twin expands.

---

## 1. Goal

Prove the full governed loop with the thinnest useful implementation.

---

## 2. Vertical Slice Steps

### Step 1: Authentication
Harvey can sign into Studio through Supabase Auth.

### Step 2: Start Session
Harvey starts a creative session from Studio.

### Step 3: Generate Artifact
The runtime creates one artifact in one supported medium.
Recommended first medium: `concept` or `writing`.

### Step 4: Create Critique
The runtime stores one critique record for the artifact.

### Step 5: Create Evaluation
The runtime stores one evaluation signal record.

### Step 6: Store Memory and Thread Context
The runtime stores memory and links the artifact to an idea or thread when available.

### Step 7: Enter Review
The artifact enters `pending_review`.

### Step 8: Harvey Review
Harvey can choose:
- approve
- approve_with_annotation
- needs_revision
- reject
- archive
- approve_for_publication

### Step 9: Optional Publish
Harvey may publish an approved artifact.
Only then may it appear in public habitat.

### Step 10: Public Deployment
`apps/public-site` deploys successfully.
The first acceptable UI may display only:

**Hello Twin!**

---

## 3. Success Condition

The vertical slice succeeds when:
- one full artifact review path works
- data is stored in Supabase
- the public site is deployed
- no approval/publication rules are violated

---

## 4. Explicit Non-Goals for the Vertical Slice

The first slice does not need:
- full identity seeding
- full mind test execution
- audio/video generation
- advanced staging automation
- visitor analytics
- autonomous architecture changes

---

## 5. Expansion After the Slice

After the vertical slice works, expand in this order:

1. text + image + concept support
2. source ingestion for initial identity seeding
3. staging habitat shell
4. surface proposal workflow
5. mind test inputs and outputs
6. first identity naming and avatar proposals
