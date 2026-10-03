"""Offline, CPU-only experiment. Produces a transcript, never an assessment."""
import argparse
import hashlib
import json
import math
import os
import resource
import socket
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

# These apply to this process only. Model and tokenizer must already exist locally.
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["DO_NOT_TRACK"] = "1"

ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / ".cache/recitation-models/qwen3-asr-0.6b-hf"
RESULTS_DIR = ROOT / ".cache/recitation-experiments"
MAX_BYTES = 10 * 1024 * 1024
MAX_SECONDS = 180
MAX_TOKENS = 256


def block_network(*_args, **_kwargs):
    raise RuntimeError("Network access is disabled during local transcription.")

def validate_decoded_audio(waveform):
    import numpy as np

    seconds = len(waveform) / 16000
    if not 0 < seconds <= MAX_SECONDS or not np.isfinite(waveform).all():
        raise ValueError("Decoded audio is empty, invalid, or too long.")
    if not np.any(waveform):
        raise ValueError("The recording is digitally silent; no transcript or assessment was generated.")
    return seconds


def usable_transcript(text):
    return (
        isinstance(text, str) and 0 < len(text) <= 20000
        and any(character.isalpha() for character in text)
    )


def audio_demuxer(signature):
    if signature[:4] == b"OggS":
        return "ogg"
    if signature[:3] == b"ID3" or (
        len(signature) >= 2 and signature[0] == 0xFF and signature[1] & 0xE0 == 0xE0
    ):
        return "mp3"
    raise ValueError("This experiment accepts MP3 or Ogg audio samples only.")


def validate_sample(path):
    audio = Path(path).resolve(strict=True)
    allowed = (ROOT / "attached_assets").resolve(strict=True)
    if not audio.is_relative_to(allowed) or not audio.is_file():
        raise ValueError("Only a local recording inside attached_assets is allowed.")
    size = audio.stat().st_size
    if not 12 <= size <= MAX_BYTES:
        raise ValueError("Audio must be nonempty and at most 10 MiB.")
    with audio.open("rb") as source:
        signature = source.read(12)
    demuxer = audio_demuxer(signature)
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe",
         "-f", demuxer, "-show_entries", "format=duration",
         "-of", "json", str(audio)],
        check=True, capture_output=True, timeout=15,
    )
    duration = float(json.loads(probe.stdout)["format"]["duration"])
    if not math.isfinite(duration) or not 0 < duration <= MAX_SECONDS:
        raise ValueError("The sample must be at most three minutes long.")
    return audio, size, duration


def decode_sample(audio):
    import numpy as np

    with audio.open("rb") as source:
        demuxer = audio_demuxer(source.read(12))
    decoded = subprocess.run(
        ["ffmpeg", "-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe",
         "-f", demuxer, "-i", str(audio), "-t", str(MAX_SECONDS + 1),
         "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "pipe:1"],
        check=True, capture_output=True, timeout=30,
    )
    waveform = np.frombuffer(decoded.stdout, dtype="<f4").copy()
    validate_decoded_audio(waveform)
    return waveform


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio", required=True)
    parser.add_argument("--consent-confirmed", action="store_true", required=True)
    args = parser.parse_args()
    audio, source_bytes, source_seconds = validate_sample(args.audio)
    manifest = json.loads((MODEL_DIR / "download-manifest.json").read_text())
    if manifest["model"] != "Qwen/Qwen3-ASR-0.6B-hf":
        raise ValueError("The expected local model is not installed.")

    # Defense in depth beyond Hugging Face's offline/local-files-only settings.
    socket.socket.connect = block_network
    socket.socket.connect_ex = block_network
    socket.create_connection = block_network

    import numpy as np
    import torch
    import transformers
    from transformers import AutoModelForMultimodalLM, AutoProcessor

    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    started = time.perf_counter()
    print("Loading the local model on CPU; network access disabled.", flush=True)
    processor = AutoProcessor.from_pretrained(
        MODEL_DIR, local_files_only=True, trust_remote_code=False,
    )
    model = AutoModelForMultimodalLM.from_pretrained(
        MODEL_DIR, local_files_only=True, trust_remote_code=False,
        dtype=torch.float32, attn_implementation="sdpa",
    ).eval()
    loaded = time.perf_counter()

    waveform = decode_sample(audio)
    decoded_seconds = validate_decoded_audio(waveform)
    inputs = processor.apply_transcription_request(
        audio=waveform, language="Arabic",
        processor_kwargs={"sampling_rate": 16000},
    ).to(model.device, model.dtype)
    prepared = time.perf_counter()
    print(f"Transcribing {decoded_seconds:.3f} seconds; no canonical text prompt.", flush=True)
    with torch.inference_mode():
        output_ids = model.generate(
            **inputs, max_new_tokens=MAX_TOKENS, do_sample=False,
        )
    finished = time.perf_counter()
    generated = output_ids[:, inputs["input_ids"].shape[1]:]
    text = processor.decode(generated, return_format="transcription_only")[0]
    raw = processor.decode(generated)[0]
    if not usable_transcript(text):
        raise RuntimeError("The model did not return a usable transcript.")
    token_count = generated.shape[1]
    eos_ids = model.generation_config.eos_token_id
    if not isinstance(eos_ids, list):
        eos_ids = [eos_ids]
    reached_eos = int(generated[0, -1]) in eos_ids
    source_hash = hashlib.sha256(audio.read_bytes()).hexdigest()
    result = {
        "kind": "experimental_local_transcription_only",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "model": manifest["model"],
        "modelRevision": manifest["revision"],
        "device": "cpu",
        "dtype": "float32",
        "cpuThreads": torch.get_num_threads(),
        "torchVersion": torch.__version__,
        "transformersVersion": transformers.__version__,
        "sampleSha256": source_hash,
        "sampleBytes": source_bytes,
        "sourceDurationSeconds": source_seconds,
        "decodedDurationSeconds": decoded_seconds,
        "languageHint": "Arabic",
        "canonicalAnswerHintUsed": False,
        "networkDisabled": True,
        "audioUploaded": False,
        "consentConfirmed": True,
        "loadSeconds": round(loaded - started, 3),
        "preprocessingSeconds": round(prepared - loaded, 3),
        "inferenceSeconds": round(finished - prepared, 3),
        "loadToResultSeconds": round(finished - started, 3),
        "inferenceRealtimeFactor": round((finished - prepared) / decoded_seconds, 3),
        "peakProcessMemoryMiB": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1),
        "generatedTokens": token_count,
        "maxNewTokens": MAX_TOKENS,
        "reachedEndOfSequence": reached_eos,
        "possiblyTruncated": token_count >= MAX_TOKENS and not reached_eos,
        "rawOutput": raw,
        "transcript": text,
        "humanGroundTruth": None,
        "wordErrorRate": None,
        "studentScore": None,
        "approvedForAssessment": False,
        "limitations": [
            "One sample does not establish Arabic recitation accuracy.",
            "No independently verified verbatim human transcript is available.",
            "No substitution/omission benchmark has been completed.",
            "Timing includes this machine and these settings, not a production guarantee.",
        ],
    }
    RESULTS_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    RESULTS_DIR.chmod(0o700)
    name = f"qwen-sample-{source_hash[:12]}-{time.time_ns()}.json"
    result_path = RESULTS_DIR / name
    with result_path.open("x", encoding="utf-8") as out:
        result_path.chmod(0o600)
        json.dump(result, out, ensure_ascii=False, indent=2)
        out.write("\n")
    print(json.dumps({
        "status": "transcribed_not_graded",
        "resultPath": str(result_path.relative_to(ROOT)),
        "inferenceSeconds": result["inferenceSeconds"],
        "loadToResultSeconds": result["loadToResultSeconds"],
        "peakProcessMemoryMiB": result["peakProcessMemoryMiB"],
        "possiblyTruncated": result["possiblyTruncated"],
    }, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()