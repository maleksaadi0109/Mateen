---
name: Arabic scanned-word alignment
description: Why exact OCR text or plausible boxes are not sufficient to release word reveal regions.
---

Evaluate Arabic word crops against the visible glyphs, not only normalized OCR
strings or document-parser block coordinates. General document parsers may detect
an Arabic text block without reading it, or classify decorative Arabic as an image.
Neither outcome supplies verified word positions.

**Why:** Multiple independent extraction approaches on the supplied diacritized
Nawawi scan did not provide reliable word geometry; matching strings can still
come from overlapping lines or surrounding narration.

**How to apply:** Keep extraction candidates separate from released reveal regions.
Validate each crop against the exact edition and training passage before enabling
it. Report unfinished geometry separately from rights permission and scholarly
approval; do not turn a technical alignment gap into a learner mistake.