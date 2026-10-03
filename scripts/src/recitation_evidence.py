"""Recognizer disagreements are diagnostic evidence, not reader mistakes."""
import difflib
import re
import unicodedata


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


def word_level_candidates(reference, transcript):
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
            kind = "possible_substitution"
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