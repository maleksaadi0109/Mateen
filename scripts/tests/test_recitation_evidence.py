import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "evidence", Path(__file__).resolve().parents[1] / "src/recitation_evidence.py",
)
evidence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evidence)


class EvidenceTests(unittest.TestCase):
    def test_ignores_vowels_punctuation_and_tatweel(self):
        self.assertEqual(
            evidence.comparison_words("إِنَّمَـا الأَعْمالُ، بالنِّياتٍ."),
            ["إنما", "الأعمال", "بالنيات"],
        )

    def test_preserves_letters_that_change_words(self):
        self.assertNotEqual(
            evidence.comparison_words("بنيات امرأة نوأ"),
            evidence.comparison_words("بالنيات امرئ نواء"),
        )
        self.assertNotEqual(
            evidence.comparison_words("إن"), evidence.comparison_words("ان"),
        )

    def test_equivalent_display_is_not_a_disagreement(self):
        self.assertEqual(evidence.recognizer_disagreements("ما نَوَى.", "ما نوى"), [])

    def test_differences_never_become_reader_errors(self):
        differences = evidence.recognizer_disagreements("ما نوأ", "ما نواء")
        self.assertEqual(len(differences), 1)
        self.assertEqual(differences[0]["kind"], "recognizer_disagreement_not_reader_error")
        self.assertTrue(differences[0]["humanReviewRequired"])
        self.assertNotIn("score", differences[0])

    def test_rejects_unbounded_or_nontext_values(self):
        for value in [None, 4, "x" * 20001]:
            with self.assertRaises(ValueError):
                evidence.comparison_words(value)

    def test_phrase_substitution_is_one_review_candidate(self):
        result = evidence.word_level_candidates("لدنيا يصيبها أو امرأة", "لدنيا يستمتع بها أو امرأة")
        changes = [s for s in result["spans"] if s["humanReviewRequired"]]
        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0]["kind"], "possible_substitution")
        self.assertEqual(changes[0]["referenceWords"], ["يصيبها"])
        self.assertEqual(changes[0]["recognizedWords"], ["يستمتع", "بها"])
        self.assertFalse(changes[0]["confirmedLearnerError"])
        self.assertIsNone(result["studentScore"])
        self.assertIsNone(result["wordErrorRate"])

    def test_internal_missing_word_requires_observed_continuation(self):
        result = evidence.word_level_candidates("لدنيا يصيبها أو امرأة", "لدنيا أو امرأة")
        missing = next(s for s in result["spans"] if s["operation"] == "delete")
        self.assertEqual(missing["kind"], "possible_omission")
        self.assertTrue(missing["observedContinuationOnBothSides"])
        self.assertTrue(missing["humanReviewRequired"])

    def test_silence_or_unfinished_passage_is_not_omission(self):
        for transcript in ["", "لدنيا", "لدنيا يصيبها"]:
            result = evidence.word_level_candidates("لدنيا يصيبها أو امرأة", transcript)
            self.assertNotIn("possible_omission", [s["kind"] for s in result["spans"]])

    def test_fused_words_are_preserved_not_corrected(self):
        result = evidence.word_level_candidates("لدنيا يصيبها أو", "لدنيايستمتع بها أو")
        self.assertEqual(result["recognizedWords"], ["لدنيايستمتع", "بها", "أو"])
        self.assertTrue(all(not s["confirmedLearnerError"] for s in result["spans"]))

    def test_passage_selection_excludes_intro_and_attribution(self):
        selected = evidence.select_recognized_passage("عن عمر يقول إنما الأعمال بالنيات رواه البخاري")
        self.assertEqual(selected["text"], "إنما الأعمال بالنيات")
        self.assertEqual(selected["excludedPrefix"], ["عن", "عمر", "يقول"])
        self.assertEqual(selected["excludedSuffix"], ["رواه", "البخاري"])

    def test_selection_rejects_missing_and_ambiguous_start(self):
        for text in ["الأعمال بالنيات", "إنما الأعمال إنما بالنيات"]:
            with self.assertRaisesRegex(ValueError, "human selection"):
                evidence.select_recognized_passage(text)

    def test_alignment_bounds_and_empty_reference(self):
        for reference, transcript in [("", "كلمة"), ("كلمة " * 1001, "كلمة"), ("كلمة", "كلمة " * 1001)]:
            with self.assertRaises(ValueError):
                evidence.word_level_candidates(reference, transcript)


if __name__ == "__main__":
    unittest.main()