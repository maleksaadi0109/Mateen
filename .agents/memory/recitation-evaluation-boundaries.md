---
name: Recitation evaluation boundaries
description: Interpreting user-labelled audio experiments without confusing ASR artifacts with learner mistakes.
---

Use the user's labelled correct, omission and substitution samples as experimental
evidence, not as certification that recognition is accurate across readers.
Do not treat every difference between ASR output and canonical text as a learner
mistake, or force the output back to the canonical wording.

**Why:** Local models preserved the intentionally omitted/replaced word in the
tested cases but also produced transcription errors on the declared correct
sample. One recognizer fused the replacement phrase with its preceding word.
Success at the targeted location did not eliminate other recognition errors.

**How to apply:** Keep raw transcripts, labels and uncertainty separate. Human
review and an approved acceptance standard must precede graded assessment.
Compare the shared spoken passage; different introductions or source attribution
must not count as student omissions.

Treat missing words at an unobserved passage boundary as incomplete/uncertain,
not as omission. Only an observed continuation can support even a provisional
interior-omission candidate, and that candidate still needs human review.

**Why:** A pause, unfinished recording or unclear ASR ending can otherwise be
mistaken for a memorization error.

**How to apply:** Preserve raw text and explicitly selected passage boundaries;
do not use fuzzy anchor repair to silently include or exclude disputed wording.