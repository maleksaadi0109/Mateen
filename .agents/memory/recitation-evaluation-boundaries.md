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

Live recitation disagreements must be presented as uncertain recognition, not
as a confirmed learner mistake. Choose recognition alternatives by the
recognizer's evidence, not by their similarity to the expected text.

**Why:** The user reports false alerts on correct reading and identifies
recitation quality and ease of use as the product's highest priority. Choosing
the hypothesis closest to the matn would conceal genuine errors rather than
improve recognition.

**How to apply:** Preserve strict checks for missing/replaced words while
tolerating exact Arabic whitespace variations and safely anchored repetitions
of already revealed context. Do not claim a larger local model improves the
live browser recognizer unless it is actually integrated and measured.

The user now explicitly wants practice to continue through differences, show
the recognized differing word in red, and offer an end-of-attempt review with
an approximate percentage, prior-attempt word history and pronunciation.

**Why:** On 2026-10-03 the user rejected stopping capture at each difference.
This expands the earlier no-percentage practice presentation, not permission
to award assessment grades from ASR.

**How to apply:** Label the percentage as approximate word matching in the
attempted passage, exclude unspoken suffixes, keep differences provisional,
and keep practice history separate from exam scores and advancement.

Display practice differences in red without striking through words, particularly
the name «الله». Do not restore the separate live list of recent differences;
use inline feedback and the end review instead.

**Why:** On 2026-10-03 the user called the separate live panel unnecessary and
explicitly rejected a strike-through on «الله».

**How to apply:** Keep the canonical text readable; retain review/history and
uncertainty explanations without adding the removed live panel back.

On 2026-10-03 the user explicitly authorized browser-service alert measurement
and transmission of audio for that purpose, without saving new recordings or
transcripts in the project. This permission covers that narrow measurement,
not the expanded grading benchmark.

**Why:** Purpose-specific consent was requested and granted after the earlier
deferral; asking for the same consent again would ignore that decision.

**How to apply:** If this measurement is resumed, do not repeat the consent
question. Keep its new audio/transcripts out of persistent artifacts and logs,
and retain its prohibition on grades and pronunciation/diacritics assessment.
This measurement-specific restriction does not overwrite the separate practice
presentation request above. Browser API availability and microphone permission
do not prove the remote recognition service is usable; require real service
results before measurement. The user accepted stopping at the documented
blocker, which is not confirmation of measured accuracy.