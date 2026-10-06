"""Deterministic, fail-closed application of scan-backed transcription notes.

This is not a scholarly approval system. Original text remains byte-reconstructible.
Only explicitly bounded excerpts receive a visual-comparison status, never approval.
"""
from copy import deepcopy
import difflib
import hashlib
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def evidence_file(root, name, expected_hash):
    path = (root / name).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError("Evidence must be inside the collation directory")
    if digest(path.read_bytes()) != expected_hash:
        raise ValueError(f"Evidence fingerprint mismatch: {name}")
    return path


def exact_range(text, needle):
    if not needle or text.count(needle) != 1:
        raise ValueError("Correction/excerpt must match exactly once in the preserved text")
    start = text.index(needle)
    return start, start + len(needle)


def compare_changes(before, after):
    return [
        {"originalStart": i, "originalEnd": j, "before": before[i:j], "after": after[k:l]}
        for tag, i, j, k, l in difflib.SequenceMatcher(None, before, after, autojunk=False).get_opcodes()
        if tag != "equal"
    ]


def collate(bundle, ledger=None, root=None):
    result = deepcopy(bundle)
    result["format"] = "mateen-source-preparation-v2"
    result["source"]["publicationStatus"] = "blocked_pending_independent_reviews"
    result["quoteCandidates"] = []
    default_reason = "لم يُقابل هذا المقطع كاملاً مع الصورة؛ مستبعد من الاقتباسات."
    for passage in result["passages"]:
        passage["transcriptionStatus"] = "excluded_not_collated"
        passage["studentEligible"] = False
        passage["exclusionReason"] = default_reason
        passage["correctedDraft"] = None
        passage["corrections"] = []
    if ledger is None:
        result["source"]["collationStatus"] = "no_evidence_all_excluded"
        return result
    if (
        ledger["format"] != "mateen-transcription-collation-v1"
        or ledger["rawTextSha256"] != result["source"]["rawTextSha256"]
        or ledger["scientificApproval"] is not None
        or ledger["method"] != "direct_visual_comparison_of_linked_scan"
    ):
        raise ValueError("Collation is not bound to this original or attempts approval")
    root = Path(root)
    evidence = ledger["evidence"]
    expected_pdf_url = result["source"]["textDownloadUrl"].replace("/txt/", "/pdf/").removesuffix(".txt") + ".pdf"
    if evidence["pdfUrl"] != expected_pdf_url:
        raise ValueError("Scan is not the PDF linked for this transcription")
    evidence_file(root, evidence["pdfFile"], evidence["pdfSha256"])
    evidence_file(root, evidence["identityImageFile"], evidence["identityImageSha256"])
    passages = {p["id"]: p for p in result["passages"]}
    pages = {}
    for page in ledger["pages"]:
        if (
            page["viewerPage"] in pages
            or type(page["pdfPage"]) is not int
            or not 1 <= page["pdfPage"] <= evidence["pdfPages"]
            or not page["printedPage"] or not page["basis"]
            or page["viewerPage"] not in {p["viewerPage"] for p in passages.values()}
        ):
            raise ValueError("Invalid or duplicate inspected page mapping")
        evidence_file(root, page["imageFile"], page["imageSha256"])
        pages[page["viewerPage"]] = page
    for passage in passages.values():
        passage["exclusionReason"] = ledger["defaultExclusionReason"]
        if passage["viewerPage"] in pages:
            page = pages[passage["viewerPage"]]
            passage["pdfPage"] = page["pdfPage"]
            passage["printedPage"] = page["printedPage"]
            passage["pageEvidence"] = deepcopy(page)

    def reference(entry):
        passage = passages[entry["passageId"]]
        page = pages[passage["viewerPage"]]
        if entry["pdfPage"] != page["pdfPage"] or not entry["location"]:
            raise ValueError("Correction/excerpt points to the wrong scan page")
        return {
            **deepcopy(page),
            "pdfSha256": evidence["pdfSha256"],
            "pdfUrl": evidence["pdfUrl"],
            "location": entry["location"],
        }

    ids = set()
    for entry in ledger["corrections"]:
        if entry["id"] in ids or not entry["reason"] or entry["before"] == entry["after"]:
            raise ValueError("Invalid or duplicate correction")
        ids.add(entry["id"])
        passage = passages[entry["passageId"]]
        start, end = exact_range(passage["text"], entry["before"])
        if any(start < c["originalEnd"] and end > c["originalStart"] for c in passage["corrections"]):
            raise ValueError("Overlapping corrections")
        passage["corrections"].append({
            **entry, "originalStart": start, "originalEnd": end,
            "beforeSha256": digest(entry["before"].encode()),
            "afterSha256": digest(entry["after"].encode()),
            "evidence": reference(entry),
        })
    for passage in passages.values():
        if passage["corrections"]:
            draft = passage["text"]
            for entry in sorted(passage["corrections"], key=lambda c: c["originalStart"], reverse=True):
                draft = draft[:entry["originalStart"]] + entry["after"] + draft[entry["originalEnd"]:]
            passage["correctedDraft"] = draft
            passage["correctedDraftSha256"] = digest(draft.encode())
            passage["transcriptionStatus"] = "excluded_partial_collation"
    excluded_ids = set()
    for entry in ledger["exclusions"]:
        if entry["passageId"] in excluded_ids or not entry["reason"]:
            raise ValueError("Duplicate or empty exclusion")
        excluded_ids.add(entry["passageId"])
        passage = passages[entry["passageId"]]
        passage["exclusionReason"] = entry["reason"]
        passage["transcriptionStatus"] = "excluded_partial_collation"
    candidate_ids = set(passages)
    for entry in ledger["candidates"]:
        if entry["id"] in candidate_ids or not entry["text"].strip() or not entry["difference"] or not entry["scope"]:
            raise ValueError("Invalid or duplicate excerpt")
        candidate_ids.add(entry["id"])
        passage = passages[entry["passageId"]]
        start, end = exact_range(passage["text"], entry["originalText"])
        result["quoteCandidates"].append({
            **entry,
            "originalStart": start,
            "originalEnd": end,
            "originalTextSha256": digest(entry["originalText"].encode()),
            "textSha256": digest(entry["text"].encode()),
            "changes": compare_changes(entry["originalText"], entry["text"]),
            "evidence": reference(entry),
            "sourceUrl": passage["sourceUrl"],
            "transcriptionStatus": "visually_compared_excerpt_only",
            "reviewStatus": "unreviewed",
            "scientificApproval": None,
            "studentEligible": False,
            "indexed": False,
        })
    result["source"]["collationStatus"] = "bounded_excerpts_only_rest_excluded"
    result["source"]["collationEvidence"] = evidence
    result["source"]["collationLimitations"] = ledger["limitations"]
    result["source"]["collationSummary"] = {
        "originalPassages": len(passages),
        "excludedOriginalPassages": len(passages),
        "visuallyComparedCandidates": len(result["quoteCandidates"]),
        "corrections": len(ids),
        "inspectedViewerPages": sorted(pages),
        "studentEligible": 0,
    }
    return result
