"""Synthetic test fixtures ONLY; none are measured recordings or authorizations."""
import copy
import hashlib
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import recitation_benchmark as benchmark
from recitation_evidence import measure_reviewed_alerts, summarize_reviewed_runs, word_level_candidates


class AlertMeasurementTests(unittest.TestCase):
    def test_false_alert_on_correct_speech_is_not_learner_error(self):
        result = measure_reviewed_alerts("أول وسط آخر", "أول وسط آخر", "أول آخر")
        self.assertTrue(result["reviewedCorrectPassage"])
        self.assertEqual(result["counts"]["omission"]["falseAlertEvents"], 1)
        self.assertEqual(result["counts"]["omission"]["reviewedEvents"], 0)
        self.assertIsNone(result["studentScore"])
        self.assertFalse(result["approvedForAssessment"])
        self.assertEqual(len(result["recognizerVsHeardDisagreements"]), 1)

    def test_correct_localization_not_word_presence(self):
        result = measure_reviewed_alerts(
            "أول وسط ثم وسط آخر", "أول ثم وسط آخر", "أول وسط ثم آخر",
        )
        counts = result["counts"]["omission"]
        self.assertEqual(counts["detectedEvents"], 0)
        self.assertEqual(counts["missedEvents"], 1)
        self.assertEqual(counts["falseAlertEvents"], 1)

    def test_real_interior_omission_and_phrase_substitution(self):
        for reference, heard, kind in [
            ("أول وسط آخر", "أول آخر", "omission"),
            ("لدنيا يصيبها أو امرأة", "لدنيا يستمتع بها أو امرأة", "substitution"),
        ]:
            result = measure_reviewed_alerts(reference, heard, heard)
            self.assertEqual(result["counts"][kind]["detectedEvents"], 1)
            self.assertEqual(result["counts"][kind]["falseAlertEvents"], 0)

    def test_type_confusion_is_miss_plus_false_alert(self):
        result = measure_reviewed_alerts("أول وسط آخر", "أول آخر", "أول مختلف آخر")
        self.assertEqual(result["counts"]["omission"]["missedEvents"], 1)
        self.assertEqual(result["counts"]["substitution"]["falseAlertEvents"], 1)

    def test_cutoff_extra_words_and_display_marks_not_graded(self):
        result = measure_reviewed_alerts("أول وسط آخر", "أول وسط", "أول وسط")
        self.assertEqual(result["counts"]["omission"]["reviewedEvents"], 0)
        self.assertEqual(len(result["unscoredHumanSpans"]), 1)
        result = measure_reviewed_alerts("أول وسط آخر", "أول زائد وسط آخر", "أول زائد وسط آخر")
        self.assertEqual(len(result["unscoredHumanSpans"]), 1)
        result = measure_reviewed_alerts("إِنَّمَا الأعمال", "إنما الأعمال", "إنما الأعمال")
        self.assertFalse(result["hasFalseAlert"])

    def test_practice_unverified_boundary_replacements_remain_uncertain(self):
        result = word_level_candidates("أول وسط آخر", "مختلف وسط آخر")
        self.assertEqual(result["spans"][0]["kind"], "unconfirmed_passage_boundary")
        result = measure_reviewed_alerts("أول وسط آخر", "أول وسط آخر", "مختلف وسط آخر")
        self.assertEqual(result["counts"]["substitution"]["falseAlertEvents"], 1)

    def test_summary_null_denominators_and_explicit_coverage_latency(self):
        self.assertEqual(summarize_reviewed_runs([]), [])
        result = measure_reviewed_alerts("أول وسط آخر", "أول وسط آخر", "أول وسط آخر")
        runs = [{
            "model": "test-not-real", "modelRevision": "a" * 40,
            "speakerId": "test-speaker", "conditionId": "test-room", "passageId": "test-passage",
            "inferenceSeconds": t, "measurement": result,
        } for t in (1, 3)]
        summary = summarize_reviewed_runs(runs)[0]
        self.assertIsNone(summary["counts"]["omission"]["eventRecall"])
        self.assertIsNone(summary["counts"]["substitution"]["eventPrecision"])
        self.assertEqual(summary["latencySeconds"], {"median": 2, "p95NearestRank": 3})
        self.assertEqual(summary["coverage"]["speakerId"], 1)
        self.assertFalse(summary["approvedForAssessment"])


class CorpusAuthorizationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.audio = Path(self.temp.name) / "test-not-real-audio"
        self.audio.write_bytes(b"SYNTHETIC_FIXTURE_NOT_AUDIO")
        self.sha = hashlib.sha256(self.audio.read_bytes()).hexdigest()
        self.now = datetime(2026, 10, 3, tzinfo=timezone.utc)
        active = {"status": "active", "issuedAt": "2026-10-01T00:00:00Z",
                  "expiresAt": "2099-01-01T00:00:00Z"}
        self.entry = {
            "id": "test-clip", "speakerId": "test-speaker", "conditionId": "test-room",
            "passageId": "test-passage", "origin": "benchmark", "audioPath": str(self.audio),
        }
        self.ledger = {
            "schemaVersion": 1, "purpose": benchmark.PURPOSE,
            "reviewers": {"test-reviewer": {**active, "purpose": benchmark.PURPOSE}},
            "samples": {"test-clip": {
                **active, **self.entry, "submittedBy": "test-operator", "sha256": self.sha,
                "referenceText": "مقدمة أول وسط آخر عزو",
                "consent": {
                    **active, "explicit": True, "purpose": benchmark.PURPOSE,
                    "speakerId": "test-speaker", "sha256": self.sha,
                },
                "review": {
                    "reviewerId": "test-reviewer", "reviewedAt": "2026-10-02T00:00:00Z",
                    "listenedIndependently": True, "asrVisibleDuringReview": False,
                    "boundariesVerified": True, "sha256": self.sha,
                    "referenceWordRange": [1, 4], "audioSeconds": [2, 8],
                    "heardTranscript": "أول وسط آخر",
                },
            }},
        }
        self.local = SimpleNamespace(MAX_SECONDS=180, validate_sample=Mock(
            return_value=(self.audio, self.audio.stat().st_size, 10),
        ))

    def validate(self):
        return benchmark.validate_entry(self.entry, self.ledger, self.local, self.now)

    def test_authorized_selection_excludes_intro_and_attribution(self):
        checked = self.validate()
        self.assertEqual(checked["reference"], "أول وسط آخر")
        self.assertEqual(checked["audioSeconds"], [2, 8])
        self.assertEqual(checked["sha256"], self.sha)

    def test_inactive_records_are_rejected_before_audio_access(self):
        sample = self.ledger["samples"]["test-clip"]
        for target in (sample, sample["consent"], self.ledger["reviewers"]["test-reviewer"]):
            for field, value in [("status", "deleted"), ("revokedAt", "2026-10-02T00:00:00Z"),
                                 ("expiresAt", "2026-10-02T00:00:00Z"),
                                 ("deletedAt", "2026-10-02T00:00:00Z"),
                                 ("issuedAt", "2027-01-01T00:00:00Z")]:
                old = target.copy()
                target[field] = value
                with self.subTest(field=field), self.assertRaises(ValueError):
                    self.validate()
                self.local.validate_sample.assert_not_called()
                target.clear()
                target.update(old)

    def test_generic_consent_or_speaker_mismatch_is_not_benchmark_consent(self):
        consent = self.ledger["samples"]["test-clip"]["consent"]
        for field, value in [("purpose", "practice"), ("explicit", False), ("speakerId", "other")]:
            original = consent[field]
            consent[field] = value
            with self.assertRaises(ValueError):
                self.validate()
            consent[field] = original
            self.local.validate_sample.assert_not_called()

    def test_assessment_reuse_needs_separate_explicit_permission(self):
        self.entry["origin"] = self.ledger["samples"]["test-clip"]["origin"] = "assessment"
        with self.assertRaises(ValueError):
            self.validate()
        self.local.validate_sample.assert_not_called()
        self.ledger["samples"]["test-clip"]["consent"]["assessmentReuseExplicit"] = True
        self.validate()

    def test_ordinary_teacher_self_review_or_asr_assisted_review_rejected(self):
        sample = self.ledger["samples"]["test-clip"]
        review = sample["review"]
        for field, value in [
            ("reviewerId", "ordinary-teacher"), ("reviewerId", "test-speaker"),
            ("reviewerId", "test-operator"), ("listenedIndependently", False),
            ("asrVisibleDuringReview", True), ("boundariesVerified", False),
            ("reviewedAt", "2026-09-30T00:00:00Z"),
        ]:
            original = review[field]
            review[field] = value
            if field == "reviewerId":
                self.ledger["reviewers"][value] = self.ledger["reviewers"]["test-reviewer"].copy()
                if value == "ordinary-teacher":
                    del self.ledger["reviewers"][value]
            with self.assertRaises(ValueError):
                self.validate()
            review[field] = original
            self.local.validate_sample.assert_not_called()

    def test_hash_change_invalidates_consent_and_review(self):
        self.audio.write_bytes(b"CHANGED_SYNTHETIC_TEST_FIXTURE")
        with self.assertRaises(ValueError):
            self.validate()

    def test_corpus_cannot_invent_variety(self):
        self.entry["conditionId"] = "invented-condition"
        with self.assertRaises(ValueError):
            self.validate()
        self.local.validate_sample.assert_not_called()

    def test_invalid_shared_bounds_rejected(self):
        review = self.ledger["samples"]["test-clip"]["review"]
        for field, invalids in [
            ("audioSeconds", [[-1, 5], [5, 5], [0, 181], [0, float("nan")], [0, True]]),
            ("referenceWordRange", [[0, 0], [0, 6], [False, 2], [-1, 2]]),
        ]:
            original = review[field]
            for value in invalids:
                review[field] = value
                with self.assertRaises(ValueError):
                    self.validate()
            review[field] = original
        self.local.validate_sample.assert_not_called()

    def test_duplicate_samples_cannot_inflate_measurements(self):
        corpus = {"schemaVersion": 1, "samples": [self.entry, self.entry]}
        with self.assertRaises(ValueError):
            benchmark.check_corpus(corpus, self.ledger, self.local)
        self.local.validate_sample.assert_not_called()
        clone = {**self.entry, "id": "test-clone"}
        self.ledger["samples"]["test-clone"] = copy.deepcopy(self.ledger["samples"]["test-clip"])
        with self.assertRaises(ValueError):
            benchmark.check_corpus({"schemaVersion": 1, "samples": [self.entry, clone]},
                                   self.ledger, self.local)

    def run_fixture(self, recognize):
        root = Path(self.temp.name)
        corpus_path, ledger_path = root / "corpus.json", root / "ledger.json"
        corpus_path.write_text(json.dumps({"schemaVersion": 1, "samples": [self.entry]}))
        ledger_path.write_text(json.dumps(self.ledger))
        local = SimpleNamespace(
            **vars(self.local), ROOT=root, RESULTS_DIR=root / "results",
            decode_sample=Mock(return_value=range(160000)),
            validate_decoded_audio=Mock(return_value=6),
            usable_transcript=lambda text: bool(text.strip()),
        )
        backend = SimpleNamespace(
            loaded_models=Mock(return_value=[
                (name, "fixture-processor", "fixture-model",
                 {"model": name, "revision": "a" * 40}, .5)
                for name in ("test-qwen", "test-ctc")
            ]),
            recognize=recognize,
        )
        result = benchmark.run_benchmark(corpus_path, ledger_path, local, model_backend=backend)
        return json.loads(result.read_text()), result, local, ledger_path

    def test_cohort_runner_crops_audio_and_keeps_models_blind_to_reference(self):
        recognize = Mock(return_value=("أول آخر", False, 1.5))
        report, path, local, _ = self.run_fixture(recognize)
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)
        self.assertEqual(len(report["runs"]), 2)
        self.assertTrue(report["allRequestedRunsMeasured"])
        self.assertEqual(len(recognize.call_args.args[3]), 6 * 16000)
        self.assertEqual(recognize.call_args.args[3][0], 2 * 16000)
        self.assertEqual(len(recognize.call_args.args), 5)
        self.assertNotIn("heardTranscript", report["runs"][0])
        self.assertFalse(report["approvedForAssessment"])
        self.assertEqual(report["models"][0]["correctClipsWithFalseAlerts"], 1)

    def test_truncation_is_failure_not_a_learner_omission(self):
        report, _, _, _ = self.run_fixture(Mock(return_value=("أول", True, 1)))
        self.assertEqual(report["runs"], [])
        self.assertEqual(len(report["failures"]), 2)
        self.assertEqual(report["models"], [])
        self.assertFalse(report["allRequestedRunsMeasured"])

    def test_revocation_during_recognition_removes_derived_evidence(self):
        ledger_path = Path(self.temp.name) / "ledger.json"

        def revoke(*args):
            revoked = copy.deepcopy(self.ledger)
            revoked["samples"]["test-clip"]["consent"]["status"] = "revoked"
            ledger_path.write_text(json.dumps(revoked))
            return "أول آخر", False, 1

        report, _, local, _ = self.run_fixture(Mock(side_effect=revoke))
        self.assertEqual(report["runs"], [])
        self.assertEqual(report["eligibleAtPublication"], 0)
        self.assertFalse(report["allRequestedRunsMeasured"])
        local.decode_sample.assert_called_once()

    def test_modified_review_does_not_mix_two_ground_truths(self):
        ledger_path = Path(self.temp.name) / "ledger.json"

        def change(*args):
            changed = copy.deepcopy(self.ledger)
            changed["samples"]["test-clip"]["review"]["heardTranscript"] = "أول آخر"
            ledger_path.write_text(json.dumps(changed))
            return "أول آخر", False, 1

        report, _, local, _ = self.run_fixture(Mock(side_effect=change))
        self.assertEqual(report["runs"], [])
        self.assertEqual(report["eligibleAtPublication"], 0)
        local.decode_sample.assert_called_once()


if __name__ == "__main__":
    unittest.main()