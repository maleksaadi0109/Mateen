# Local recitation review workflow

This step is an offline diagnostic, not a student assessment or enabled product
capability. It reuses already recorded model outputs; it does not run recognition,
upload audio, produce grades, unlock levels or schedule student reviews.

## Generate the review packet

```sh
python scripts/src/build-recitation-review.py \
  --omission-evidence .cache/recitation-experiments/<omission-comparison>.json \
  --substitution-evidence .cache/recitation-experiments/<substitution-comparison>.json
```

Both inputs must be private offline experiment evidence using the same correct
recording and the user-labelled «يصيبها» omission and «يستمتع بها» substitution.
This report builder deliberately scopes the experiment to the first Nawawi
hadith; it is not a general source importer or assessment generator.

Outputs are `recitation-review.html` and `recitation-review.json` in this
directory, with local file permissions 0600. HTML is self-contained, has no
network resources or audio, and includes raw transcripts and candidate
differences. Sharing it shares the included transcript text, not the recordings.

The reference excerpt is sourced from the existing imported record, with a
content hash and explicitly pending status. It is not asserted approved for
grading or licensed by this diagnostic.

## Interpretation

- Comparison ignores displayed vowels, punctuation and tatweel but preserves
  meaningful letters and hamzas. No pronunciation assessment is performed.
- An exact recognized match is not a pass or proof of correctly spoken audio.
- Differences are provisional review candidates, never confirmed learner errors.
- A missing interior word can be a possible omission only with observed
  continuation on both sides. Missing passage boundaries or silence are not
  confirmed omissions.
- A word replaced by a phrase stays one candidate span when the alignment
  supports it. Fused ASR words remain in the raw output; no canonical wording
  is inserted to repair them.
- The report selects the passage from the unique recognized «إنما» through
  the words before «رواه», or the end of the recording when no attribution
  is recognized. These are experimental text boundaries, not word timestamps.
  Missing or ambiguous start anchors cause explicit failure, not fuzzy repair.

## Findings on supplied samples

Both omission outputs yield the candidate `يصيبها → [no recognized word]`.
Qwen's substitution output yields `يصيبها → يستمتع بها`. The CTC output
instead yields a wider span because it fuses «لدنيايستمتع». The correctly
read baseline also yields differences; they cannot be graded as reader errors.

No WER, false-positive rate or overall recognition accuracy is computed:
complete human verbatim transcripts and an adequately varied evaluation set are
still missing. One labelled instance of each error does not meet the release
standard.

## Remaining release gates

Confirm the imported reference and source reuse rights; review recognition
outputs against the audio; establish a diverse, human-transcribed evaluation set
and an approved acceptance standard. Then select the model on measured evidence.
Browser audio upload, immutable assessment attempts, pass/retake enforcement,
and mistake-based review scheduling remain unimplemented and must not be marked
complete by this offline review step.

## Verification

The Python suite covers candidate alignment, phrase substitutions, unobserved
endings/silence, preserving fused words, passage exclusions, missing/ambiguous
anchors, label bounds, private evidence gates and HTML escaping. The generated
report was rendered locally at phone, tablet and desktop sizes. No application
API or student UI was changed.