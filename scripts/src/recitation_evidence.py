"""Recognizer disagreements are diagnostic evidence, not reader mistakes."""
import difflib
import re
import unicodedata
import math


def comparison_words(text):
    """Ignore display vowels/punctuation; preserve semantic letters and hamzas."""
    if not isinstance(text, str) or len(text) > 20000:
        raise ValueError("A bounded transcript string is required.")
    normalized = unicodedata.normalize("NFC", text)
    normalized = "".join(
        char for char in normalized
        if unicodedata.category(char) != "Mn" and char != "\u0640"
    )
    return re.findall(r"[^\W\d_]+", normalized, flags=re.UNICODE)


def recognizer_disagreements(first, second):
    left, right = comparison_words(first), comparison_words(second)
    matcher = difflib.SequenceMatcher(a=left, b=right, autojunk=False)
    return [
        {
            "kind": "recognizer_disagreement_not_reader_error",
            "operation": tag,
            "firstWords": left[a:b],
            "secondWords": right[c:d],
            "humanReviewRequired": True,
        }
        for tag, a, b, c, d in matcher.get_opcodes()
        if tag != "equal"
    ]


def word_level_candidates(reference, transcript, *, boundaries_verified=False):
    """Align selected passages; differences are never confirmed learner errors."""
    expected, heard = comparison_words(reference), comparison_words(transcript)
    if not expected or len(expected) > 1000 or len(heard) > 1000:
        raise ValueError("Select a nonempty reference passage of at most 1000 words.")
    matcher = difflib.SequenceMatcher(a=expected, b=heard, autojunk=False)
    spans = []
    for tag, a, b, c, d in matcher.get_opcodes():
        bounded = c > 0 and d < len(heard)
        if tag == "equal":
            kind = "recognized_word_match_not_assessment"
        elif tag == "delete":
            # No observed continuation means a pause, silence or unfinished
            # recording could explain the absence. Never label it omission.
            kind = "possible_omission" if bounded else "unconfirmed_passage_boundary"
        elif tag == "replace":
            kind = (
                "possible_substitution" if bounded or boundaries_verified
                else "unconfirmed_passage_boundary"
            )
        else:
            kind = "possible_extra_words"
        spans.append({
            "kind": kind,
            "operation": tag,
            "referenceRange": [a, b],
            "transcriptRange": [c, d],
            "referenceWords": expected[a:b],
            "recognizedWords": heard[c:d],
            "observedContinuationOnBothSides": bounded,
            "humanReviewRequired": tag != "equal",
            "confirmedLearnerError": False,
        })
    return {
        "kind": "diagnostic_alignment_not_assessment",
        "referenceWords": expected,
        "recognizedWords": heard,
        "spans": spans,
        "studentScore": None,
        "wordErrorRate": None,
        "approvedForAssessment": False,
    }


def select_recognized_passage(text, start_word="إنما", stop_word="رواه"):
    """Explicit experimental boundary only; do not fuzzy-repair missing anchors."""
    words = comparison_words(text)
    starts = [i for i, word in enumerate(words) if word == start_word]
    if len(starts) != 1:
        raise ValueError("The passage start anchor is missing or ambiguous; human selection is required.")
    start = starts[0]
    ends = [i for i in range(start + 1, len(words)) if words[i] == stop_word]
    if len(ends) > 1:
        raise ValueError("The passage stop anchor is ambiguous; human selection is required.")
    end = ends[0] if ends else len(words)
    return {
        "text": " ".join(words[start:end]),
        "selectedRange": [start, end],
        "excludedPrefix": words[:start],
        "excludedSuffix": words[end:],
        "selectionStatus": "experimental_anchor_selection_requires_human_review",
    }


def measure_reviewed_alerts(reference, heard_transcript, recognized_transcript):
    """Offline benchmark only: position/type-exact events, not student grades.

    The caller must validate consent, reviewer authority and shared audio/text
    boundaries. Boundary deletions and extra words are reported but not scored.
    """
    def events(text):
        alignment = word_level_candidates(reference, text, boundaries_verified=True)
        return [
            (span["kind"], tuple(span["referenceRange"]))
            for span in alignment["spans"]
            if span["kind"] in {"possible_omission", "possible_substitution"}
        ], alignment

    truth, human = events(heard_transcript)
    predicted, machine = events(recognized_transcript)
    counts = {}
    for kind, label in [("possible_omission", "omission"),
                        ("possible_substitution", "substitution")]:
        actual = {event for event in truth if event[0] == kind}
        alerts = {event for event in predicted if event[0] == kind}
        counts[label] = {
            "reviewedEvents": len(actual),
            "detectedEvents": len(actual & alerts),
            "missedEvents": len(actual - alerts),
            "falseAlertEvents": len(alerts - actual),
        }
    return {
        "counts": counts,
        "reviewedCorrectPassage": not any(s["operation"] != "equal" for s in human["spans"]),
        "hasFalseAlert": any(v["falseAlertEvents"] for v in counts.values()),
        "unscoredHumanSpans": [
            s for s in human["spans"]
            if s["kind"] in {"unconfirmed_passage_boundary", "possible_extra_words"}
        ],
        "unscoredRecognizerSpans": [
            s for s in machine["spans"]
            if s["kind"] in {"unconfirmed_passage_boundary", "possible_extra_words"}
        ],
        "recognizerVsHeardDisagreements": recognizer_disagreements(
            heard_transcript, recognized_transcript,
        ),
        "matchingRule": "exact_event_type_and_reference_word_range",
        "studentScore": None,
        "approvedForAssessment": False,
    }


def summarize_reviewed_runs(runs):
    """Denominators stay explicit; missing data never becomes zero accuracy."""
    def ratio(numerator, denominator):
        return numerator / denominator if denominator else None

    models = {}
    for run in runs:
        key = (run["model"], run["modelRevision"])
        models.setdefault(key, []).append(run)
    summaries = []
    for (model, revision), group in sorted(models.items()):
        counts = {}
        for kind in ("omission", "substitution"):
            total = {
                name: sum(r["measurement"]["counts"][kind][name] for r in group)
                for name in ("reviewedEvents", "detectedEvents", "missedEvents", "falseAlertEvents")
            }
            total["eventRecall"] = ratio(total["detectedEvents"], total["reviewedEvents"])
            total["eventPrecision"] = ratio(
                total["detectedEvents"], total["detectedEvents"] + total["falseAlertEvents"],
            )
            counts[kind] = total
        correct = [r for r in group if r["measurement"]["reviewedCorrectPassage"]]
        false_on_correct = sum(r["measurement"]["hasFalseAlert"] for r in correct)
        times = sorted(r["inferenceSeconds"] for r in group)
        summaries.append({
            "model": model, "modelRevision": revision, "clips": len(group),
            "counts": counts,
            "correctClips": len(correct),
            "correctClipsWithFalseAlerts": false_on_correct,
            "correctClipFalseAlertRate": ratio(false_on_correct, len(correct)),
            "unscoredHumanSpans": sum(len(r["measurement"]["unscoredHumanSpans"]) for r in group),
            "unscoredRecognizerSpans": sum(len(r["measurement"]["unscoredRecognizerSpans"]) for r in group),
            "latencySeconds": {
                "median": (times[(len(times) - 1) // 2] + times[len(times) // 2]) / 2,
                "p95NearestRank": times[math.ceil(len(times) * .95) - 1],
            },
            "coverage": {
                field: len({r[field] for r in group})
                for field in ("speakerId", "conditionId", "passageId")
            },
            "strata": {
                field: [{
                    "id": value, "clips": len(subset),
                    "falseAlertClips": sum(r["measurement"]["hasFalseAlert"] for r in subset),
                    "missedEvents": sum(
                        c["missedEvents"] for r in subset for c in r["measurement"]["counts"].values()
                    ),
                } for value in sorted({r[field] for r in group})
                  for subset in [[r for r in group if r[field] == value]]]
                for field in ("speakerId", "conditionId", "passageId")
            },
            "studentScore": None, "approvedForAssessment": False,
        })
    return summaries