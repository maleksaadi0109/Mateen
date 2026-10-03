"""Report trust gates and output encoding without inference or network access."""
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
spec = importlib.util.spec_from_file_location(
    "review_report", Path(__file__).resolve().parents[1] / "src/build-recitation-review.py",
)
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)


class ReviewReportTests(unittest.TestCase):
    def test_html_escapes_reference_and_raw_recognition(self):
        attack = '<script>alert("unsafe")</script>'
        data = {
            "reference": {"text": attack},
            "samples": [{
                "label": attack,
                "runs": [{
                    "model": attack, "rawTranscript": attack,
                    "alignment": {"spans": []},
                    "selection": {"text": attack, "excludedPrefix": [attack], "excludedSuffix": [attack]},
                }],
            }],
        }
        rendered = report.render_report(data)
        self.assertNotIn("<script>", rendered)
        self.assertIn("&lt;script&gt;", rendered)
        self.assertIn("default-src 'none'", rendered)
        self.assertNotIn("<audio", rendered)

    def test_evidence_outside_private_cache_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "private cache"):
            report.load_evidence(__file__, "original")

    def test_fabricated_grading_and_truncated_evidence_are_rejected(self):
        with tempfile.TemporaryDirectory(dir=report.CACHE) as directory:
            path = Path(directory) / "sample.json"
            base = {
                "kind": "local_model_comparison_not_assessment", "audioUploaded": False,
                "networkDisabled": True, "canonicalAnswerHintUsed": False,
                "approvedForAssessment": False, "studentScore": None,
                "runs": [
                    {"variant": "original", "model": model, "possiblyTruncated": False,
                     "transcript": "إنما الأعمال"}
                    for model in [
                        "Qwen/Qwen3-ASR-0.6B-hf",
                        "jonatasgrosman/wav2vec2-large-xlsr-53-arabic",
                    ]
                ],
            }
            for key, value in [
                ("audioUploaded", True), ("networkDisabled", False),
                ("canonicalAnswerHintUsed", True), ("approvedForAssessment", True),
                ("studentScore", 30),
            ]:
                path.write_text(json.dumps({**base, key: value}))
                with self.subTest(key=key), self.assertRaises(ValueError):
                    report.load_evidence(path, "original")
            base["runs"][0]["possiblyTruncated"] = True
            path.write_text(json.dumps(base))
            with self.assertRaisesRegex(ValueError, "Truncated"):
                report.load_evidence(path, "original")


if __name__ == "__main__":
    unittest.main()