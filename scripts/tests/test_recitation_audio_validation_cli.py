"""Validation-only mode must never recognize speech or grade an answer."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SOURCE))
spec = importlib.util.spec_from_file_location(
    "recitation_audio_validation_runtime", SOURCE / "recitation-runtime.py"
)
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class AudioValidationCliTests(unittest.TestCase):
    def test_validation_returns_measured_duration_without_reference_or_recognition(self):
        output = io.StringIO()
        with (
            patch.object(sys, "argv", ["runtime", "--audio", "private-file", "--validate-only"]),
            patch.object(runtime, "decode_audio", return_value=[0.1] * 24000) as decode,
            patch.object(runtime, "validate_reference") as reference,
            patch.object(runtime, "transcribe") as recognize,
            contextlib.redirect_stdout(output),
        ):
            runtime.main()
        decode.assert_called_once_with("private-file")
        reference.assert_not_called()
        recognize.assert_not_called()
        self.assertEqual(json.loads(output.getvalue()), {
            "valid": True, "durationSeconds": 1.5, "maxDurationSeconds": 60,
        })

    def test_invalid_audio_never_yields_successful_validation(self):
        output = io.StringIO()
        with (
            patch.object(sys, "argv", ["runtime", "--audio", "invalid", "--validate-only"]),
            patch.object(runtime, "decode_audio", side_effect=ValueError("Invalid audio")),
            patch.object(runtime, "transcribe") as recognize,
            contextlib.redirect_stdout(output),
            self.assertRaises(ValueError),
        ):
            runtime.main()
        self.assertEqual(output.getvalue(), "")
        recognize.assert_not_called()

    def test_reference_is_rejected_in_validation_mode(self):
        with (
            patch.object(sys, "argv", ["runtime", "--audio", "private-file",
                                     "--validate-only", "--reference-file", "reference"]),
            contextlib.redirect_stderr(io.StringIO()),
            patch.object(runtime, "decode_audio") as decode,
            self.assertRaises(SystemExit),
        ):
            runtime.main()
        decode.assert_not_called()

    def test_recognition_still_requires_server_reference(self):
        with (
            patch.object(sys, "argv", ["runtime", "--audio", "private-file"]),
            contextlib.redirect_stderr(io.StringIO()),
            patch.object(runtime, "decode_audio") as decode,
            self.assertRaises(SystemExit),
        ):
            runtime.main()
        decode.assert_not_called()


if __name__ == "__main__":
    unittest.main()