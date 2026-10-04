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

Participant-boundary regression tests may use synthetic approvals only in disposable databases. Replacing external identity/model calls for deterministic tests does not validate real Clerk authentication, independent review, or model grounding.

**Why:** Automated privacy tests need repeatable identities and timing without granting real reviewer authority or publishing fictitious approval evidence.

**How to apply:** Keep synthetic authority out of application databases and production code. Retain separate trusted-account review and real-model evaluation gates.

Separate access to one's own teacher application from the stronger assurance needed for administrative review. Teachers may apply with ordinary verified accounts; this does not make them reviewers or approved teachers.

**Why:** The user asked to make the teacher portal usable normally after its MFA requirement blocked access. Reviewer assurance should protect cross-account decisions, not prevent ordinary applicants from submitting credentials.

**How to apply:** Preserve independent reviewer designation and reviewer MFA, private documents, active verified teacher accounts and explicit approval before receiving student referrals.

Teacher applications must include a PDF certificate, not merely an image.

**Why:** The user explicitly required «المعلم ضروري يرفع pdf يثبت فيه أنه لديه شهادة» and asked for the admin to inspect it and approve or reject.

**How to apply:** Require a security-checked PDF at submission and approval, without implying that malware scanning verifies the credential's authenticity.