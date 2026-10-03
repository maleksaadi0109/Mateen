"""Reject invalid experiment labels before decoding or loading models."""
import importlib.util
import io
import sys
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

spec = importlib.util.spec_from_file_location(
    "comparison", Path(__file__).resolve().parents[1] / "src/compare-local-recitation.py",
)
comparison = importlib.util.module_from_spec(spec)
spec.loader.exec_module(comparison)


class ComparisonCliTests(unittest.TestCase):
    def assert_rejected(self, args):
        with patch("sys.argv", ["comparison", "--audio", "unused", "--consent-confirmed", *args]):
            with patch.object(comparison.local, "validate_sample") as validate:
                with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
                    comparison.main()
                self.assertEqual(error.exception.code, 2)
                validate.assert_not_called()

    def test_incomplete_substitution_is_rejected(self):
        self.assert_rejected(["--substitution-audio", "unused"])

    def test_original_word_must_be_one_word(self):
        self.assert_rejected([
            "--substitution-audio", "unused", "--original-word", "two words",
            "--replacement-phrase", "replacement",
        ])

    def test_nonletter_and_oversize_phrases_are_rejected(self):
        for phrase in ["<script>", "word; command", "x" * 201, " ".join(["word"] * 11), "   "]:
            with self.subTest(phrase=phrase):
                self.assert_rejected([
                    "--substitution-audio", "unused", "--original-word", "original",
                    "--replacement-phrase", phrase,
                ])

    def test_two_error_variants_are_rejected(self):
        self.assert_rejected([
            "--substitution-audio", "unused", "--original-word", "original",
            "--replacement-phrase", "replacement",
            "--omission-audio", "unused", "--omitted-word", "omitted",
        ])


if __name__ == "__main__":
    unittest.main()