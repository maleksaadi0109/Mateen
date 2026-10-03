"""Offline integrity tests; no model, credentials, or database."""
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RENDERER = Path(__file__).with_name("render-scholarly-content-review.py")


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


class ReportIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.run = {"cases": [{
            "id": "sample", "question": "سؤال", "answer": "شرح",
            "answerSha256": digest("شرح"), "rawAttempts": [{"content": "مسودة"}],
        }]}
        self.review = {
            "date": "تاريخ", "boundary": "غير معتمد", "summary": "خلاصة",
            "method": "مقارنة", "referenceDescription": "مرجع", "expectedCaseCount": 1,
            "cases": [{
                "id": "sample", "title": "حالة", "verdict": "غير معتمد",
                "summary": "<script>نص</script>", "findings": [],
                "answerSha256": digest("شرح"), "rawContentSha256": [digest("مسودة")],
            }],
        }

    def render(self, rebind=True):
        run_path = self.folder / "run.json"
        run_path.write_text(json.dumps(self.run, ensure_ascii=False), encoding="utf-8")
        if rebind:
            self.review["runSha256"] = hashlib.sha256(run_path.read_bytes()).hexdigest()
        review_path = self.folder / "review.json"
        review_path.write_text(json.dumps(self.review, ensure_ascii=False), encoding="utf-8")
        return subprocess.run(
            [sys.executable, str(RENDERER), str(run_path), str(review_path),
             str(self.folder / "report.html")],
            capture_output=True, text=True,
        )

    def test_escapes_review_text_and_never_substitutes_rejected_draft(self):
        self.run["cases"][0].update(answer=None, answerSha256=None)
        self.review["cases"][0]["answerSha256"] = None
        self.assertEqual(self.render().returncode, 0)
        report = (self.folder / "report.html").read_text()
        self.assertIn("&lt;script&gt;", report)
        self.assertNotIn("<script>", report)
        self.assertNotIn("مسودة", report)

    def test_rejects_altered_answer_with_unchanged_hash(self):
        self.run["cases"][0]["answer"] = "شرح مختلف"
        self.assertNotEqual(self.render().returncode, 0)

    def test_rejects_altered_raw_content(self):
        self.run["cases"][0]["rawAttempts"][0]["content"] = "مسودة مختلفة"
        self.assertNotEqual(self.render().returncode, 0)

    def test_rejects_rebinding_to_another_run(self):
        self.assertEqual(self.render().returncode, 0)
        self.run["cases"][0]["question"] = "سؤال آخر"
        self.assertNotEqual(self.render(rebind=False).returncode, 0)

    def test_rejects_missing_and_duplicate_cases(self):
        self.review["expectedCaseCount"] = 2
        self.assertNotEqual(self.render().returncode, 0)
        self.review["expectedCaseCount"] = 1
        self.review["cases"] *= 2
        self.assertNotEqual(self.render().returncode, 0)


if __name__ == "__main__":
    unittest.main()