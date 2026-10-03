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

Treat missing or replaced words at an unreviewed passage boundary as
incomplete/uncertain, not as learner errors. Only an observed continuation can
support even a provisional interior-omission candidate, and that candidate still
needs human review. A separately reviewed benchmark may evaluate substitutions
at verified boundaries; ordinary practice has no such boundary attestation.

**Why:** A pause, unfinished recording or unclear ASR ending can otherwise be
mistaken for a memorization error, including a replacement caused by aligning
the final recognized word against a longer unspoken suffix.

**How to apply:** Preserve raw text and explicitly selected passage boundaries;
do not use fuzzy anchor repair to silently include or exclude disputed wording.

Experimental recording permission is not permission for an expanded benchmark.
Require explicit purpose-specific consent and independent authorized listening
review for new measurement evidence; do not treat previously supplied recordings
or assessment recordings as automatically reusable.

**Why:** The user distinguishes continuing experimental practice from proving
recognition suitable for grades across speakers and recording conditions.

**How to apply:** Keep the prior experiments usable only within their authorized
scope. A missing consented cohort blocks real measurement, not further software
work, and must never be replaced with synthetic accuracy claims.

Defer the expanded benchmark until the user explicitly resumes it; do not make
it a blocker for the current work.

**Why:** On 2026-10-03 the user explicitly asked to skip the benchmark for now
and activate it later.

**How to apply:** Preserve the prepared measurement tools and consent/review
requirements for later. Deferral is not permission to enable automatic grades;
continue with human oral grading and experimental practice feedback.