---
name: Review trust boundaries
description: Decisions preserving independent review and scanned file integrity.
---

Scientific approval and modern-transcription reuse clearance are separate requirements. The creator of a source revision cannot clear that revision's rights; use a separately authorized reviewer.

**Why:** Public availability of the chosen reference does not establish permission, and creator self-clearance would remove the intended independent review.

**How to apply:** Never grant yourself reviewer authority to unblock a demonstration. Leave initial source versions pending until an authorized reviewer supplies verified evidence. Validate grading against the exact approved snapshot, not a newer pending revision.

Preserve the exact bytes checked by the malware scanner, not a later copy of a presigned-upload object.

**Why:** A PUT URL may remain valid after scanning, allowing the staging object to change before a copy.

**How to apply:** Promote scanned bytes into an immutable protected object; tests and later upload work should retain this trust boundary.