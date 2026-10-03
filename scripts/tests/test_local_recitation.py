"""Cheap validation/offline checks; no model inference and no network requests."""
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "local_recitation", ROOT / "scripts/src/transcribe-local-recitation.py",
)
experiment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(experiment)


class LocalRecitationValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / "attached_assets")
        self.path = Path(self.temp.name) / "sample.mp3"
        self.path.write_bytes(b"ID3" + b"\0" * 20)
        self.addCleanup(self.temp.cleanup)

    def probe_response(self, duration):
        return subprocess.CompletedProcess(
            args=[], returncode=0,
            stdout=json.dumps({"format": {"duration": duration}}).encode(),
            stderr=b"",
        )

    def test_rejects_file_outside_upload_directory(self):
        with self.assertRaisesRegex(ValueError, "attached_assets"):
            experiment.validate_sample(ROOT / "python-runtime.toml")

    def test_rejects_symlink_to_outside_upload_directory(self):
        self.path.unlink()
        self.path.symlink_to(ROOT / "python-runtime.toml")
        with self.assertRaisesRegex(ValueError, "attached_assets"):
            experiment.validate_sample(self.path)

    def test_rejects_oversize_before_decoding(self):
        with self.path.open("wb") as source:
            source.truncate(experiment.MAX_BYTES + 1)
        with patch.object(experiment.subprocess, "run") as run:
            with self.assertRaisesRegex(ValueError, "10 MiB"):
                experiment.validate_sample(self.path)
            run.assert_not_called()

    def test_rejects_empty_file(self):
        self.path.write_bytes(b"")
        with self.assertRaisesRegex(ValueError, "nonempty"):
            experiment.validate_sample(self.path)

    def test_rejects_other_file_types(self):
        self.path.write_bytes(b"<html>not audio</html>")
        with self.assertRaisesRegex(ValueError, "MP3"):
            experiment.validate_sample(self.path)

    def test_rejects_invalid_or_excessive_durations(self):
        for duration in ["0", "-1", "181", "NaN", "Infinity"]:
            with self.subTest(duration=duration):
                with patch.object(
                    experiment.subprocess, "run",
                    return_value=self.probe_response(duration),
                ):
                    with self.assertRaisesRegex(ValueError, "three minutes"):
                        experiment.validate_sample(self.path)

    def test_valid_sample_uses_argument_array_and_file_protocol_only(self):
        with patch.object(
            experiment.subprocess, "run",
            return_value=self.probe_response("20.04"),
        ) as run:
            path, size, duration = experiment.validate_sample(self.path)
            self.assertEqual(path, self.path.resolve())
            self.assertEqual(size, 23)
            self.assertEqual(duration, 20.04)
            args = run.call_args.args[0]
            self.assertIsInstance(args, list)
            self.assertIn("file,pipe", args)
            self.assertNotIn("shell", run.call_args.kwargs)

    def test_ogg_is_probed_with_explicit_demuxer(self):
        self.path.write_bytes(b"OggS" + b"\0" * 20)
        with patch.object(
            experiment.subprocess, "run",
            return_value=self.probe_response("27.26"),
        ) as run:
            self.assertEqual(experiment.validate_sample(self.path)[2], 27.26)
            args = run.call_args.args[0]
            self.assertEqual(args[args.index("-f") + 1], "ogg")

    def test_demuxer_is_selected_by_signature_not_filename(self):
        self.assertEqual(experiment.audio_demuxer(b"OggS"), "ogg")
        self.assertEqual(experiment.audio_demuxer(b"ID3"), "mp3")
        self.assertEqual(experiment.audio_demuxer(b"\xff\xfb"), "mp3")
        for signature in [b"", b"\xff", b"RIFF", b"<html>"]:
            with self.assertRaises(ValueError):
                experiment.audio_demuxer(signature)

    def test_offline_guards_are_set(self):
        self.assertEqual(experiment.os.environ["HF_HUB_OFFLINE"], "1")
        self.assertEqual(experiment.os.environ["TRANSFORMERS_OFFLINE"], "1")
        self.assertEqual(experiment.os.environ["HF_HUB_DISABLE_TELEMETRY"], "1")
        with self.assertRaisesRegex(RuntimeError, "Network access is disabled"):
            experiment.block_network()

    def test_digital_silence_is_rejected_before_recognition(self):
        import numpy as np

        with self.assertRaisesRegex(ValueError, "digitally silent"):
            experiment.validate_decoded_audio(np.zeros(16000, dtype=np.float32))

    def test_invalid_waveforms_are_rejected(self):
        import numpy as np

        for waveform in [np.array([]), np.array([float("nan")]), np.array([float("inf")])]:
            with self.assertRaisesRegex(ValueError, "invalid"):
                experiment.validate_decoded_audio(waveform)

    def test_valid_waveform_duration_is_measured_without_a_score(self):
        import numpy as np

        self.assertEqual(experiment.validate_decoded_audio(np.ones(16000)), 1.0)

    def test_punctuation_and_empty_output_are_not_transcripts(self):
        for value in [None, "", ".", "  ...!  ", "123", "x" * 20001]:
            self.assertFalse(experiment.usable_transcript(value))
        self.assertTrue(experiment.usable_transcript("إنما الأعمال"))


if __name__ == "__main__":
    unittest.main()