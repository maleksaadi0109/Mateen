"""Download pinned speech weights; never execute model code or upload audio."""
import argparse
import hashlib
import json
import os
import shutil
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

MODEL = "Qwen/Qwen3-ASR-0.6B-hf"
REVISION = "7f1569a48a89f3e3f4dc3a5c9d28bddd903bc76c"
ROOT = Path(__file__).resolve().parents[2]
DESTINATION = ROOT / ".cache/recitation-models/qwen3-asr-0.6b-hf"
# Expected byte counts and hashes from the official repository's pinned metadata.
# 64-character values are SHA-256; 40-character values are Git blob SHA-1.
FILES = {
    "README.md": (16538, "6bd0dfad309578014c4f1c669c23e5a3fdb4e849"),
    "chat_template.jinja": (1434, "491fff331513a97316daf53591c7b9b9da53ef8c"),
    "config.json": (2398, "3b4221f651b59ec21f545e5852b4d6cb23420b09"),
    "generation_config.json": (165, "3ed98c80087572bad932a83279c5602e58bbfc5c"),
    "model.safetensors": (
        1564928088,
        "d3f212dd20abecd315d830bc54ae3865e56ebfc3276484e57b771288ba27fd35",
    ),
    "processor_config.json": (487, "a07dff48032bed341260501d6688036c6fd7f3ef"),
    "tokenizer.json": (
        11429653,
        "fe1fad59be22a41ee293363fcf95fdedbc7c93f3b49270b1d2e18bd1399a7a05",
    ),
    "tokenizer_config.json": (998, "aa62b6c06ab8a704dc0895420fb1d2515954a49c"),
}

CTC_MODEL = "jonatasgrosman/wav2vec2-large-xlsr-53-arabic"
CTC_REVISION = "af46c2d8531b8dcbb5e23b952f739b372c2e5d2d"
CTC_FILES = {
    "README.md": (8306, "4b4eeda145312bba2ce47d6b5ec4e4e78f106979"),
    "config.json": (1565, "06c947225b79531809cd75404055b4bae1c97893"),
    "preprocessor_config.json": (158, "0886a48276922a77013d8aa4681192138ae90d90"),
    "pytorch_model.bin": (
        1262142936,
        "a0b26f6d9d3edfde1784aef863c192a8cc1e438a23b45910ab648531ebe1857b",
    ),
    "special_tokens_map.json": (85, "25bc39604f72700b3b8e10bd69bb2f227157edd1"),
    "vocab.json": (507, "a0572dd1bfe9d4144d8a24f68bf60939942d4ee9"),
}


def digest_for(size, expected):
    digest = hashlib.sha256() if len(expected) == 64 else hashlib.sha1()
    if len(expected) == 40:
        digest.update(f"blob {size}\0".encode())
    return digest


def verified(path, size, expected):
    if not path.is_file() or path.stat().st_size != size:
        return False
    digest = digest_for(size, expected)
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest() == expected


def main():
    global MODEL, REVISION, DESTINATION, FILES
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--model", choices=["qwen", "arabic-ctc"], default="qwen")
    args = parser.parse_args()
    if args.model == "arabic-ctc":
        MODEL, REVISION, FILES = CTC_MODEL, CTC_REVISION, CTC_FILES
        DESTINATION = ROOT / ".cache/recitation-models/wav2vec2-arabic"
    DESTINATION.mkdir(parents=True, exist_ok=True)
    for name, (size, expected) in FILES.items():
        target = DESTINATION / name
        if verified(target, size, expected):
            print(f"Verified: {name}", flush=True)
            continue
        if args.verify_only:
            raise RuntimeError(f"Missing or damaged model file: {name}")
        if shutil.disk_usage(DESTINATION).free < size + 100 * 1024 * 1024:
            raise RuntimeError("Insufficient disk space for the model download.")
        # Fixed official HTTPS origin and allow-listed file names, not user URLs.
        url = f"https://huggingface.co/{MODEL}/resolve/{REVISION}/{name}"
        partial = target.with_name(f"{name}.partial")
        print(f"Downloading: {name} ({size} bytes)", flush=True)
        digest = digest_for(size, expected)
        received = 0
        try:
            with urllib.request.urlopen(url, timeout=120) as response, partial.open("wb") as out:
                for chunk in iter(lambda: response.read(4 * 1024 * 1024), b""):
                    received += len(chunk)
                    if received > size:
                        raise RuntimeError(f"Download exceeded expected size: {name}")
                    digest.update(chunk)
                    out.write(chunk)
                out.flush()
                os.fsync(out.fileno())
            if received != size or digest.hexdigest() != expected:
                raise RuntimeError(f"Model integrity verification failed: {name}")
            partial.replace(target)
        except Exception:
            partial.unlink(missing_ok=True)
            raise
        print(f"Downloaded and verified: {name}", flush=True)

    if not args.verify_only:
        manifest = {
            "model": MODEL,
            "revision": REVISION,
            "license": "Apache-2.0",
            "source": f"https://huggingface.co/{MODEL}/tree/{REVISION}",
            "downloadedAt": datetime.now(timezone.utc).isoformat(),
            "totalBytes": sum(size for size, _ in FILES.values()),
            "files": {
                name: {"bytes": size, "expectedHash": expected}
                for name, (size, expected) in FILES.items()
            },
            "audioUploaded": False,
            "inferenceTested": False,
            "approvedForAssessment": False,
        }
        (DESTINATION / "download-manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    print(f"Model files ready: {DESTINATION}", flush=True)


if __name__ == "__main__":
    main()