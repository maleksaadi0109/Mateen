"""Consent-bound offline corpus evaluation. Never called by student assessment."""
import hashlib
import json
import math
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from recitation_evidence import comparison_words, measure_reviewed_alerts, summarize_reviewed_runs

PURPOSE = "recitation_alert_benchmark_v1"


def read_document(path):
    source = Path(path)
    if source.is_symlink() or not source.is_file() or source.stat().st_size > 2 * 1024 * 1024:
        raise ValueError("A bounded, nonsymlink JSON document is required.")
    value = json.loads(source.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("Expected a JSON object.")
    return value


def instant(value):
    if not isinstance(value, str):
        raise ValueError("An explicit timezone-aware timestamp is required.")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Timestamps must include their timezone.")
    return parsed


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", value):
        raise ValueError("Use bounded pseudonymous identifiers, not personal information.")
    return value


def check_live(record, now):
    if (
        record.get("status") != "active"
        or record.get("revokedAt") is not None
        or record.get("deletedAt") is not None
        or not instant(record.get("issuedAt")) <= now < instant(record.get("expiresAt"))
    ):
        raise ValueError("Authorization or recording is inactive, deleted, revoked or expired.")


def validate_entry(entry, ledger, local, now=None):
    """Trust ledger comes from authorized operations, never from corpus submitters.

    Ledger is an offline administrative attestation, not an authentication system.
    Its custody must be enforced by the operator (documented in operations guide).
    """
    now = now or datetime.now(timezone.utc)
    sample_id = identifier(entry["id"])
    speaker = identifier(entry["speakerId"])
    identifier(entry["conditionId"])
    identifier(entry["passageId"])
    if entry.get("origin") not in {"benchmark", "practice", "assessment"}:
        raise ValueError("Recording origin must be explicit.")
    authority = ledger.get("samples", {}).get(sample_id)
    if not isinstance(authority, dict):
        raise ValueError("No independent administrative sample attestation.")
    check_live(authority, now)
    consent = authority["consent"]
    check_live(consent, now)
    if (
        consent.get("purpose") != PURPOSE or consent.get("explicit") is not True
        or consent.get("speakerId") != speaker
        or authority.get("speakerId") != speaker
        or authority.get("origin") != entry["origin"]
        or authority.get("conditionId") != entry["conditionId"]
        or authority.get("passageId") != entry["passageId"]
        or authority.get("audioPath") != entry["audioPath"]
        or (entry["origin"] == "assessment" and consent.get("assessmentReuseExplicit") is not True)
    ):
        raise ValueError("Specific consent for this speaker, sample and purpose is required.")
    review = authority["review"]
    reviewer = identifier(review["reviewerId"])
    grant = ledger.get("reviewers", {}).get(reviewer)
    if not isinstance(grant, dict):
        raise ValueError("Reviewer lacks an independent authorization grant.")
    check_live(grant, now)
    reviewed_at = instant(review.get("reviewedAt"))
    if (
        grant.get("purpose") != PURPOSE
        or not instant(grant["issuedAt"]) <= reviewed_at <= now
        or reviewed_at < instant(consent["issuedAt"])
        or reviewer in {speaker, identifier(authority["submittedBy"])}
        or review.get("listenedIndependently") is not True
        or review.get("asrVisibleDuringReview") is not False
        or review.get("boundariesVerified") is not True
    ):
        raise ValueError("An authorized independent listening review with verified bounds is required.")
    # No model sees the reference or heard transcript; review selects exact time
    # bounds and canonical word bounds, not fuzzy repairs of model output.
    reference = authority["referenceText"]
    words = comparison_words(reference)
    bounds = review["referenceWordRange"]
    if (
        not isinstance(bounds, list) or len(bounds) != 2
        or any(type(x) is not int for x in bounds)
        or not 0 <= bounds[0] < bounds[1] <= len(words)
        or bounds[1] - bounds[0] > 1000
    ):
        raise ValueError("Invalid reviewed reference word bounds.")
    heard = review["heardTranscript"]
    if not 0 < len(comparison_words(heard)) <= 1000:
        raise ValueError("A bounded independent heard transcript is required.")
    time_bounds = review["audioSeconds"]
    if (
        not isinstance(time_bounds, list) or len(time_bounds) != 2
        or any(type(x) not in (int, float) or not math.isfinite(x) for x in time_bounds)
        or not 0 <= time_bounds[0] < time_bounds[1] <= local.MAX_SECONDS
    ):
        raise ValueError("Invalid reviewed audio time bounds.")
    # Eligibility is checked before reading/decoding any recording bytes.
    audio, size, duration = local.validate_sample(entry["audioPath"])
    sha = hashlib.sha256(audio.read_bytes()).hexdigest()
    if (
        sha != authority.get("sha256") or sha != review.get("sha256")
        or sha != consent.get("sha256") or time_bounds[1] > duration + .05
    ):
        raise ValueError("Recording bytes or selected duration differ from the attestation.")
    return {
        **entry, "audio": audio, "sha256": sha, "sourceBytes": size,
        "audioSeconds": time_bounds,
        "reference": " ".join(words[bounds[0]:bounds[1]]),
        "heardTranscript": heard, "reviewerId": reviewer,
        "attestationSha256": hashlib.sha256(json.dumps(
            {"sample": authority, "grant": grant}, sort_keys=True, ensure_ascii=False,
        ).encode()).hexdigest(),
    }


def check_corpus(corpus, ledger, local):
    if corpus.get("schemaVersion") != 1 or ledger.get("schemaVersion") != 1:
        raise ValueError("Unsupported benchmark document version.")
    if ledger.get("purpose") != PURPOSE:
        raise ValueError("Wrong administrative ledger purpose.")
    entries = corpus.get("samples")
    if not isinstance(entries, list) or not 1 <= len(entries) <= 500:
        raise ValueError("Select 1–500 authorized recordings.")
    if len({identifier(e["id"]) for e in entries}) != len(entries):
        raise ValueError("Duplicate sample IDs are not allowed.")
    checked = [validate_entry(e, ledger, local) for e in entries]
    if len({e["sha256"] for e in checked}) != len(checked):
        raise ValueError("Duplicate audio bytes cannot inflate corpus coverage.")
    return checked


def run_benchmark(corpus_path, ledger_path, local, *, model_backend=None):
    corpus = read_document(corpus_path)
    ledger = read_document(ledger_path)
    entries = check_corpus(corpus, ledger, local)
    # Validate entire cohort before loading weights. This doesn't grant consent.
    if model_backend is None:
        from importlib.util import module_from_spec, spec_from_file_location
        spec = spec_from_file_location("comparison_models", Path(__file__).with_name("compare-local-recitation.py"))
        model_backend = module_from_spec(spec)
        spec.loader.exec_module(model_backend)
    comparison = model_backend
    runs, failures = [], []
    for name, processor, model, manifest, load_seconds in comparison.loaded_models(local):
        for entry in entries:
            identifier(entry["id"])
            try:
                # Reload administrative state each time: revocation/expiry while
                # model loading or between providers must stop further processing.
                live = validate_entry(entry, read_document(ledger_path), local)
                if live["attestationSha256"] != entry["attestationSha256"]:
                    raise ValueError("Reviewed evidence changed during benchmark; start a new run.")
                wave = local.decode_sample(live["audio"])
                start, stop = live["audioSeconds"]
                if stop > len(wave) / 16000 + .001:
                    raise ValueError("Reviewed bounds exceed decoded audio.")
                selected = wave[round(start * 16000):round(stop * 16000)]
                local.validate_decoded_audio(selected)
                began = time.perf_counter()
                text, truncated, inference = comparison.recognize(
                    name, processor, model, selected, local,
                )
                if truncated or not local.usable_transcript(text):
                    raise ValueError("Unusable or truncated recognition; not a learner error.")
                after = validate_entry(entry, read_document(ledger_path), local)
                if after["attestationSha256"] != live["attestationSha256"]:
                    raise ValueError("Reviewed evidence changed during recognition.")
                runs.append({
                    "sampleId": entry["id"], "speakerId": entry["speakerId"],
                    "conditionId": entry["conditionId"], "passageId": entry["passageId"],
                    "sampleSha256": live["sha256"],
                    "attestationSha256": live["attestationSha256"],
                    "audioSeconds": live["audioSeconds"],
                    "model": manifest["model"], "modelRevision": manifest["revision"],
                    "loadSeconds": load_seconds, "inferenceSeconds": inference,
                    "warmProcessingSeconds": time.perf_counter() - began,
                    "inferenceRealtimeFactor": inference / (len(selected) / 16000),
                    "transcript": text,
                    "measurement": measure_reviewed_alerts(
                        live["reference"], live["heardTranscript"], text,
                    ),
                })
            except (ValueError, RuntimeError) as error:
                failures.append({
                    "sampleId": entry["id"], "model": manifest["model"],
                    "status": "excluded_not_learner_error", "errorType": type(error).__name__,
                })
    # Revalidate at publication; don't retain any revoked sample's derived text.
    allowed = set()
    for entry in entries:
        try:
            live = validate_entry(entry, read_document(ledger_path), local)
            if live["attestationSha256"] == entry["attestationSha256"]:
                allowed.add(entry["id"])
        except (ValueError, KeyError):
            pass
    runs = [r for r in runs if r["sampleId"] in allowed]
    report = {
        "kind": "reviewed_alert_benchmark_not_assessment",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "requestedClips": len(entries), "eligibleAtPublication": len(allowed),
        "revokedOrExpiredBeforePublication": len(entries) - len(allowed),
        "networkDisabled": True, "canonicalAnswerHintUsed": False,
        "runs": runs, "failures": failures, "models": summarize_reviewed_runs(runs),
        "allRequestedRunsMeasured": len(runs) == len(entries) * 2 and not failures,
        "studentScore": None, "approvedForAssessment": False,
        "gradingPolicy": "authorized_human_review_only",
        "limitations": [
            "Event matches require identical reference word range and error type.",
            "Boundary deletions and extra words are unscored, not student omissions.",
            "Counts describe this consented cohort only; no general accuracy claim.",
            "Pronunciation and diacritics are outside scope.",
            "No automatic grading acceptance policy has been established.",
            "Administrative ledger custody is trusted; corpus files cannot grant reviewer authority.",
        ],
    }
    local.RESULTS_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    local.RESULTS_DIR.chmod(0o700)
    result = local.RESULTS_DIR / f"reviewed-benchmark-{time.time_ns()}.json"
    with result.open("x", encoding="utf-8") as stream:
        result.chmod(0o600)
        json.dump(report, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    return result