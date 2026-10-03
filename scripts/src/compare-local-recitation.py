"""Compare local ASR on paired real clips or explicitly synthetic diagnostics."""
import argparse
import gc
import hashlib
import importlib.util
import json
import resource
import socket
import time
from datetime import datetime, timezone
from pathlib import Path
from recitation_evidence import recognizer_disagreements

spec = importlib.util.spec_from_file_location(
    "local_recitation", Path(__file__).with_name("transcribe-local-recitation.py"),
)
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)


def loaded_models(local_module=local):
    """Load pinned offline models once per cohort, on CPU."""
    socket.socket.connect = local_module.block_network
    socket.socket.connect_ex = local_module.block_network
    socket.create_connection = local_module.block_network
    import torch
    from transformers import AutoModelForCTC, AutoModelForMultimodalLM, AutoProcessor

    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    for name, directory, expected in [
        ("qwen", local_module.MODEL_DIR, "Qwen/Qwen3-ASR-0.6B-hf"),
        ("arabic-ctc", local_module.ROOT / ".cache/recitation-models/wav2vec2-arabic",
         "jonatasgrosman/wav2vec2-large-xlsr-53-arabic"),
    ]:
        manifest = json.loads((directory / "download-manifest.json").read_text())
        if manifest.get("model") != expected:
            raise ValueError("Unexpected model manifest.")
        import re
        if not re.fullmatch(r"[a-f0-9]{40}", manifest.get("revision", "")):
            raise ValueError("A pinned model revision is required.")
        print(f"Loading {name} from local weights.", flush=True)
        started = time.perf_counter()
        processor = AutoProcessor.from_pretrained(
            directory, local_files_only=True, trust_remote_code=False,
        )
        if name == "qwen":
            model = AutoModelForMultimodalLM.from_pretrained(
                directory, local_files_only=True, trust_remote_code=False,
                dtype=torch.float32, attn_implementation="sdpa",
            ).eval()
        else:
            model = AutoModelForCTC.from_pretrained(
                directory, local_files_only=True, trust_remote_code=False,
                dtype=torch.float32, weights_only=True, use_safetensors=False,
            ).eval()
        yield name, processor, model, manifest, time.perf_counter() - started
        del model, processor
        gc.collect()


def recognize(name, processor, model, waveform, local_module=local):
    """No reference or reviewer transcript is provided to either recognizer."""
    import torch
    if name == "qwen":
        inputs = processor.apply_transcription_request(
            audio=waveform, language="Arabic",
            processor_kwargs={"sampling_rate": 16000},
        ).to(model.device, model.dtype)
    elif name == "arabic-ctc":
        inputs = processor(
            waveform, sampling_rate=16000, return_tensors="pt",
        ).to(model.device, model.dtype)
    else:
        raise ValueError("Unknown local recognizer.")
    started = time.perf_counter()
    with torch.inference_mode():
        if name == "qwen":
            output = model.generate(
                **inputs, max_new_tokens=local_module.MAX_TOKENS, do_sample=False,
            )
            generated = output[:, inputs["input_ids"].shape[1]:]
            text = processor.decode(generated, return_format="transcription_only")[0]
            eos = model.generation_config.eos_token_id
            if not isinstance(eos, list):
                eos = [eos]
            truncated = generated.shape[1] >= local_module.MAX_TOKENS and int(generated[0, -1]) not in eos
        else:
            output = model(**inputs).logits
            text = processor.batch_decode(output.argmax(dim=-1))[0]
            truncated = False
    seconds = time.perf_counter() - started
    if not isinstance(text, str) or len(text) > 20000:
        raise RuntimeError("Invalid recognition output.")
    return text, bool(truncated), seconds


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio")
    parser.add_argument("--corpus", help="Purpose-consented, independently reviewed cohort manifest.")
    parser.add_argument("--authorization-ledger", help="Separate operations-controlled consent/reviewer ledger.")
    parser.add_argument("--validate-corpus-only", action="store_true")
    parser.add_argument("--omission-audio")
    parser.add_argument("--omitted-word")
    parser.add_argument("--substitution-audio")
    parser.add_argument("--original-word")
    parser.add_argument("--replacement-phrase")
    parser.add_argument("--consent-confirmed", action="store_true")
    args = parser.parse_args()
    if args.corpus:
        if not args.authorization_ledger or any([
            args.audio, args.omission_audio, args.omitted_word,
            args.substitution_audio, args.original_word, args.replacement_phrase,
            args.consent_confirmed,
        ]):
            parser.error("Corpus mode requires a separate authorization ledger, not legacy audio/consent flags.")
        from recitation_benchmark import check_corpus, read_document, run_benchmark
        if args.validate_corpus_only:
            entries = check_corpus(
                read_document(args.corpus), read_document(args.authorization_ledger), local,
            )
            print(json.dumps({
                "status": "eligible_not_measured", "clips": len(entries),
                "approvedForAssessment": False,
            }))
            return
        result = run_benchmark(args.corpus, args.authorization_ledger, local)
        print(json.dumps({
            "status": "benchmark_not_assessment",
            "resultPath": str(result.relative_to(local.ROOT)),
        }))
        return
    if args.authorization_ledger or args.validate_corpus_only:
        parser.error("--corpus is required for cohort evaluation.")
    if not args.audio or not args.consent_confirmed:
        parser.error("Legacy diagnostics require --audio and --consent-confirmed; they are not a benchmark.")
    substitution_fields = [args.substitution_audio, args.original_word, args.replacement_phrase]
    if any(substitution_fields) and not all(substitution_fields):
        parser.error("Supply --substitution-audio, --original-word and --replacement-phrase together.")
    if args.substitution_audio and args.omission_audio:
        parser.error("Choose one real error variant per comparison.")
    if args.original_word and (len(args.original_word) > 100 or not args.original_word.isalpha()):
        parser.error("--original-word must be one word of at most 100 letters.")
    if args.replacement_phrase and (
        len(args.replacement_phrase) > 200
        or not 1 <= len(args.replacement_phrase.split()) <= 10
        or not all(word.isalpha() for word in args.replacement_phrase.split())
    ):
        parser.error("--replacement-phrase must contain one to ten words, letters and spaces only.")
    if bool(args.omission_audio) != bool(args.omitted_word):
        parser.error("--omission-audio and --omitted-word must be supplied together.")
    if args.omitted_word and (
        len(args.omitted_word) > 100 or not args.omitted_word.isalpha()
    ):
        parser.error("--omitted-word must be one word of at most 100 letters.")
    audio, source_bytes, source_seconds = local.validate_sample(args.audio)
    omission = local.validate_sample(args.omission_audio) if args.omission_audio else None
    substitution = local.validate_sample(args.substitution_audio) if args.substitution_audio else None
    socket.socket.connect = local.block_network
    socket.socket.connect_ex = local.block_network
    socket.create_connection = local.block_network

    import numpy as np
    import torch
    import transformers
    wave = local.decode_sample(audio)
    if local.validate_decoded_audio(wave) <= 4:
        raise ValueError("Diagnostics require a clip longer than four seconds.")
    samples = [
        ("original", wave, "real_recording", None),
        ("trailing_cutoff", wave[:-3 * 16000], "synthetic_last_three_seconds_removed", None),
        ("silence", np.zeros_like(wave), "synthetic_silence", ""),
    ]
    if omission:
        samples = [
            ("original", wave, "user_declared_correct_recording", None),
            ("omission", local.decode_sample(omission[0]),
             "real_recording_user_declared_omission", None),
        ]
    if substitution:
        samples = [
            ("original", wave, "user_declared_correct_recording", None),
            ("substitution", local.decode_sample(substitution[0]),
             "real_recording_user_declared_substitution", None),
        ]
    evidence = {
        "kind": "local_model_comparison_not_assessment",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "sourceSha256": hashlib.sha256(audio.read_bytes()).hexdigest(),
        "sourceBytes": source_bytes,
        "sourceDurationSeconds": source_seconds,
        "networkDisabled": True,
        "audioUploaded": False,
        "canonicalAnswerHintUsed": False,
        "consentConfirmed": True,
        "cpuThreads": 4,
        "device": "cpu",
        "dtype": "float32",
        "torchVersion": torch.__version__,
        "transformersVersion": transformers.__version__,
        "runs": [],
        "humanGroundTruth": None,
        "wordErrorRate": None,
        "studentScore": None,
        "approvedForAssessment": False,
        "benchmarkEligible": False,
        "consentScope": "legacy_user_declared_diagnostic_only",
        "limitations": [
            "Only one real recording is available.",
            "Cutoff and silence are diagnostics, not real reader omission/substitution samples.",
            "Non-silent clips have no independently verified verbatim human transcript.",
            "Agreement between recognizers does not establish accuracy.",
            "No measured model meets an approved recitation-acceptance policy yet.",
        ],
    }
    if omission:
        evidence["userDeclaredOmittedWord"] = args.omitted_word
        evidence["omissionSource"] = {
            "sha256": hashlib.sha256(omission[0].read_bytes()).hexdigest(),
            "bytes": omission[1],
            "durationSeconds": omission[2],
        }
        evidence["limitations"] = [
            "Baseline correctness and the omitted word are user declarations.",
            "Two recordings do not establish recognition accuracy.",
            "Complete verbatim transcripts and passage alignment are not independently verified.",
            "Word presence alone does not establish a correctly localized omission.",
            "No measured model meets an approved recitation-acceptance policy yet.",
        ]
    if substitution:
        evidence["userDeclaredSubstitution"] = {
            "originalWord": args.original_word,
            "replacementPhrase": args.replacement_phrase,
            "providedToRecognizer": False,
        }
        evidence["substitutionSource"] = {
            "sha256": hashlib.sha256(substitution[0].read_bytes()).hexdigest(),
            "bytes": substitution[1],
            "durationSeconds": substitution[2],
        }
        evidence["limitations"] = [
            "Baseline correctness and the substitution phrase are user declarations.",
            "Two recordings do not establish recognition accuracy.",
            "Complete verbatim transcripts and passage alignment are not independently verified.",
            "Word presence alone does not establish a correctly localized substitution.",
            "No measured model meets an approved recitation-acceptance policy yet.",
        ]
    for name, processor, model, manifest, load_seconds in loaded_models():
        for variant, waveform, origin, known_text in samples:
            print(f"Running {name}: {variant}", flush=True)
            text, truncated, seconds = recognize(name, processor, model, waveform)
            evidence["runs"].append({
                "model": manifest["model"],
                "modelRevision": manifest["revision"],
                "variant": variant,
                "sampleOrigin": origin,
                "durationSeconds": len(waveform) / 16000,
                "loadSeconds": round(load_seconds, 3),
                "inferenceSeconds": round(seconds, 3),
                "transcript": text,
                "possiblyTruncated": truncated,
                "diagnosticExpectedTranscript": known_text,
                "silenceProducedText": bool(text.strip()) if known_text == "" else None,
            })
    evidence["peakProcessMemoryMiB"] = round(
        resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1,
    )
    originals = [run for run in evidence["runs"] if run["variant"] == "original"]
    evidence["recognizerDisagreements"] = recognizer_disagreements(
        originals[0]["transcript"], originals[1]["transcript"],
    )
    local.RESULTS_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    local.RESULTS_DIR.chmod(0o700)
    result = local.RESULTS_DIR / f"comparison-{time.time_ns()}.json"
    with result.open("x", encoding="utf-8") as out:
        result.chmod(0o600)
        json.dump(evidence, out, ensure_ascii=False, indent=2)
        out.write("\n")
    print(json.dumps({"status": "comparison_not_assessment",
                      "resultPath": str(result.relative_to(local.ROOT))}), flush=True)


if __name__ == "__main__":
    main()