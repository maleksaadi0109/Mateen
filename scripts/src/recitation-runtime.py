"""Offline experimental practice worker. Strict JSON stdout; never grades."""
import argparse
import contextlib
import json
import math
import os
import re
import socket
import subprocess
import sys
from pathlib import Path

from recitation_evidence import comparison_words, word_level_candidates

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["DO_NOT_TRACK"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

ROOT = Path(__file__).resolve().parents[2]
RUNTIME_ROOT = ROOT / ".cache/recitation-runtime"
MODEL_DIR = ROOT / ".cache/recitation-models/qwen3-asr-0.6b-hf"
MODEL_ID = "Qwen/Qwen3-ASR-0.6B-hf"
MAX_BYTES = 10 * 1024 * 1024
MAX_SECONDS = 60
MAX_TOKENS = 512


def private_input(path, max_bytes):
    candidate = Path(path)
    resolved = candidate.resolve(strict=True)
    allowed = RUNTIME_ROOT.resolve(strict=True)
    if candidate.is_symlink() or not resolved.is_relative_to(allowed) or not resolved.is_file():
        raise ValueError("Input must be a private local runtime file.")
    size = resolved.stat().st_size
    if not 0 < size <= max_bytes:
        raise ValueError("Input size exceeds the runtime limit.")
    return resolved


def demuxer_for(signature):
    if signature[:4] == b"OggS":
        return "ogg"
    if signature[:4] == b"\x1a\x45\xdf\xa3":
        return "matroska"
    if len(signature) >= 12 and signature[4:8] == b"ftyp":
        return "mov"
    if signature[:3] == b"ID3" or (
        len(signature) >= 2 and signature[0] == 0xFF and signature[1] & 0xE0 == 0xE0
    ):
        return "mp3"
    raise ValueError("Unsupported audio signature.")


def validate_reference(path):
    source = private_input(path, 64 * 1024)
    reference = json.loads(source.read_text(encoding="utf-8"))
    if not isinstance(reference, dict) or set(reference) != {"text"}:
        raise ValueError("Invalid reference request.")
    text = reference["text"]
    words = comparison_words(text)
    if not words or len(words) > 1000:
        raise ValueError("Reference must contain 1–1000 words.")
    return text


def decode_audio(path):
    import numpy as np

    audio = private_input(path, MAX_BYTES)
    with audio.open("rb") as stream:
        demuxer = demuxer_for(stream.read(16))
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe",
         "-f", demuxer, "-show_entries", "stream=codec_type,codec_name:format=duration",
         "-of", "json", str(audio)],
        check=True, capture_output=True, timeout=15,
    )
    metadata = json.loads(probe.stdout)
    streams = metadata.get("streams", [])
    if (
        not isinstance(streams, list) or len(streams) != 1
        or streams[0].get("codec_type") != "audio"
        or streams[0].get("codec_name") not in {"opus", "vorbis", "aac", "mp3"}
    ):
        raise ValueError("Exactly one supported audio stream is required.")
    duration = metadata.get("format", {}).get("duration")
    # Browser WebM commonly omits duration. Bound decoded samples in all cases.
    if duration not in (None, "N/A"):
        seconds = float(duration)
        if not math.isfinite(seconds) or not 0 < seconds <= MAX_SECONDS + 0.1:
            raise ValueError("Recording exceeds the 60-second limit.")
    decoded = subprocess.run(
        ["ffmpeg", "-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe",
         "-f", demuxer, "-i", str(audio), "-t", str(MAX_SECONDS + 1),
         "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000",
         "-f", "f32le", "pipe:1"],
        check=True, capture_output=True, timeout=30,
    )
    wave = np.frombuffer(decoded.stdout, dtype="<f4").copy()
    if not 0 < len(wave) <= MAX_SECONDS * 16000 or not np.isfinite(wave).all():
        raise ValueError("Decoded recording is empty, invalid or exceeds 60 seconds.")
    if not np.any(wave):
        raise ValueError("Digitally silent recording; no feedback generated.")
    return wave


def block_network(*_args, **_kwargs):
    raise RuntimeError("Network disabled in recitation worker.")


def transcribe(wave):
    manifest = json.loads((MODEL_DIR / "download-manifest.json").read_text())
    if manifest.get("model") != MODEL_ID or not re.fullmatch(r"[a-f0-9]{40}", manifest.get("revision", "")):
        raise ValueError("Invalid installed model manifest.")
    socket.socket.connect = block_network
    socket.socket.connect_ex = block_network
    socket.create_connection = block_network
    # Keep stdout parseable even when third-party libraries emit progress.
    with contextlib.redirect_stdout(sys.stderr):
        import torch
        from transformers import AutoModelForMultimodalLM, AutoProcessor

        torch.set_num_threads(4)
        torch.set_num_interop_threads(1)
        processor = AutoProcessor.from_pretrained(
            MODEL_DIR, local_files_only=True, trust_remote_code=False,
        )
        model = AutoModelForMultimodalLM.from_pretrained(
            MODEL_DIR, local_files_only=True, trust_remote_code=False,
            dtype=torch.float32, attn_implementation="sdpa",
        ).eval()
        inputs = processor.apply_transcription_request(
            audio=wave, language="Arabic", processor_kwargs={"sampling_rate": 16000},
        ).to(model.device, model.dtype)
        with torch.inference_mode():
            output = model.generate(**inputs, max_new_tokens=MAX_TOKENS, do_sample=False)
        generated = output[:, inputs["input_ids"].shape[1]:]
        eos = model.generation_config.eos_token_id
        if not isinstance(eos, list):
            eos = [eos]
        if generated.shape[1] >= MAX_TOKENS and int(generated[0, -1]) not in eos:
            raise RuntimeError("Recognition was truncated; no feedback generated.")
        text = processor.decode(generated, return_format="transcription_only")[0]
    if not isinstance(text, str) or not any(c.isalpha() for c in text) or len(text) > 20000:
        raise RuntimeError("No usable transcription; retry with clearer audio.")
    return text, manifest["revision"]


def make_result(reference, transcript, revision):
    # Whole-matn practice input is not a reviewed selection of the spoken
    # passage. End/start disagreements must remain uncertain, never graded.
    if not comparison_words(reference) or not comparison_words(transcript):
        raise ValueError("Empty speech/reference cannot generate practice feedback.")
    return {
        "transcript": transcript,
        "referenceText": reference,
        "model": MODEL_ID,
        "modelRevision": revision,
        "provisional": True,
        "assessment": False,
        "alignment": word_level_candidates(reference, transcript),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio", required=True)
    parser.add_argument("--reference-file")
    parser.add_argument("--validate-only", action="store_true",
                        help="Validate private audio without recognition or grading.")
    args = parser.parse_args()
    if args.validate_only:
        if args.reference_file is not None:
            parser.error("--validate-only does not accept a reference file.")
        wave = decode_audio(args.audio)
        sys.stdout.write(json.dumps({
            "valid": True,
            "durationSeconds": len(wave) / 16000,
            "maxDurationSeconds": MAX_SECONDS,
        }) + "\n")
        return
    if args.reference_file is None:
        parser.error("--reference-file is required for recognition.")
    reference = validate_reference(args.reference_file)
    wave = decode_audio(args.audio)
    transcript, revision = transcribe(wave)
    result = make_result(reference, transcript, revision)
    sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Never include input paths, transcript, subprocess stderr or secrets.
        print(json.dumps({"error": "Recitation processing failed", "type": type(error).__name__}), file=sys.stderr)
        sys.exit(1)