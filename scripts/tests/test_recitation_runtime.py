"""Runtime boundaries without loading speech model weights."""
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
spec = importlib.util.spec_from_file_location(
    "runtime", Path(__file__).resolve().parents[1] / "src/recitation-runtime.py",
)
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.patch = patch.object(runtime, "RUNTIME_ROOT", self.root)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.addCleanup(self.temp.cleanup)

    def test_detects_browser_audio_signatures(self):
        for signature, expected in [
            (b"OggS", "ogg"), (b"\x1a\x45\xdf\xa3", "matroska"),
            (b"\x00\x00\x00\x20ftypisom", "mov"), (b"ID3", "mp3"),
        ]:
            self.assertEqual(runtime.demuxer_for(signature), expected)
        for value in [b"", b"\xff", b"<html>", b"RIFF"]:
            with self.assertRaises(ValueError):
                runtime.demuxer_for(value)

    def test_external_and_symlink_inputs_are_rejected(self):
        with self.assertRaises(ValueError):
            runtime.private_input(__file__, 1024 * 1024)
        target = self.root / "target"
        target.write_text("text")
        link = self.root / "link"
        link.symlink_to(target)
        with self.assertRaises(ValueError):
            runtime.private_input(link, 100)

    def test_reference_is_bounded_and_not_extra_commands(self):
        path = self.root / "reference.json"
        for value in [{"text": ""}, {"text": "كلمة", "command": "run"}, {"text": "كلمة " * 1001}, {"text": None}]:
            path.write_text(json.dumps(value))
            with self.assertRaises(ValueError):
                runtime.validate_reference(path)
        path.write_text(json.dumps({"text": "لدنيا يصيبها أو"}))
        self.assertEqual(runtime.validate_reference(path), "لدنيا يصيبها أو")

    def test_result_cannot_be_a_grade(self):
        result = runtime.make_result("لدنيا يصيبها أو", "لدنيا أو", "a" * 40)
        self.assertTrue(result["provisional"])
        self.assertFalse(result["assessment"])
        self.assertIsNone(result["alignment"]["studentScore"])
        self.assertFalse(result["alignment"]["approvedForAssessment"])
        self.assertTrue(all(not span["confirmedLearnerError"] for span in result["alignment"]["spans"]))

    def test_network_guard_fails_explicitly(self):
        with self.assertRaisesRegex(RuntimeError, "Network disabled"):
            runtime.block_network()


if __name__ == "__main__":
    unittest.main()