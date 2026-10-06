import importlib.util
from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("extract", Path(__file__).with_name("extract-aljam3-commentary.py"))
extract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extract)
ROOT = Path(__file__).resolve().parent.parent / "deliverables/aljam3-commentary"


class ExtractionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = (ROOT / "original.txt").read_bytes()
        cls.page_html = (ROOT / "source-page.html").read_bytes()
        cls.bundle = extract.prepare(cls.page_html, cls.raw)
        cls.ledger = json.loads((ROOT / "collation.json").read_text())
        cls.collated = extract.prepare(cls.page_html, cls.raw, cls.ledger, ROOT)

    def test_exact_reconstruction_and_offsets(self):
        pages = self.raw.decode("utf-8-sig").split("PAGE_SEPARATOR")
        for number in range(5, 406):
            pieces = [p for p in self.bundle["passages"] if p["viewerPage"] == number]
            self.assertEqual("".join(p["text"] for p in pieces), pages[number - 1])
            for p in pieces:
                self.assertLessEqual(len(p["text"]), extract.MAX_CHARS)
                self.assertEqual(p["text"], pages[number - 1][p["startOffset"]:p["endOffset"]])
                self.assertEqual(p["textSha256"], extract.digest(p["text"].encode()))

    def test_no_implicit_approval_or_invented_pages(self):
        self.assertEqual(self.bundle["source"]["status"], "prepared_unreviewed")
        self.assertIsNone(self.bundle["source"]["scientificApproval"])
        ids = set()
        for p in self.bundle["passages"]:
            self.assertIsNone(p["printedPage"])
            self.assertIsNone(p["pdfPage"])
            self.assertFalse(p["indexed"])
            self.assertEqual(p["reviewStatus"], "unreviewed")
            self.assertNotIn(p["id"], ids)
            ids.add(p["id"])

    def test_without_ledger_everything_is_excluded(self):
        self.assertEqual(self.bundle["format"], "mateen-source-preparation-v2")
        self.assertEqual(self.bundle["quoteCandidates"], [])
        for p in self.bundle["passages"]:
            self.assertEqual(p["transcriptionStatus"], "excluded_not_collated")
            self.assertFalse(p["studentEligible"])
            self.assertIsNone(p["correctedDraft"])

    def test_collation_never_rewrites_original_or_approves(self):
        self.assertEqual(self.collated["source"]["collationSummary"]["corrections"], 8)
        for raw, collated in zip(self.bundle["passages"], self.collated["passages"]):
            for key in ["id", "text", "startOffset", "endOffset", "textSha256"]:
                self.assertEqual(raw[key], collated[key])
            self.assertFalse(collated["indexed"])
            self.assertFalse(collated["studentEligible"])
            self.assertEqual(collated["reviewStatus"], "unreviewed")
            self.assertTrue(collated["transcriptionStatus"].startswith("excluded_"))
        self.assertIsNone(self.collated["source"]["scientificApproval"])

    def test_known_quran_error_is_preserved_but_excluded_with_scan_backed_draft(self):
        p = next(p for p in self.collated["passages"] if p["id"].endswith("p006-01"))
        self.assertIn("تُحَمَّدٌ", p["text"])
        self.assertNotIn("تُحَمَّدٌ", p["correctedDraft"])
        for corrected in ["مُحَمَّدٌ", "أَشِدَّاءُ", "تَرَاهُمْ", "أُجِرْتَ", "نَفَقَةً", "امرأتك"]:
            self.assertIn(corrected, p["correctedDraft"])
        self.assertEqual(len(p["corrections"]), 6)
        for c in p["corrections"]:
            self.assertEqual(p["text"][c["originalStart"]:c["originalEnd"]], c["before"])
            self.assertEqual(c["evidence"]["pdfPage"], 6)
            self.assertEqual(c["evidence"]["pdfSha256"], self.ledger["evidence"]["pdfSha256"])

    def test_only_inspected_page_numbers_are_set(self):
        for p in self.collated["passages"]:
            if p["viewerPage"] in (5, 6, 7):
                self.assertEqual(p["pdfPage"], p["viewerPage"])
                self.assertIsNotNone(p["printedPage"])
            else:
                self.assertIsNone(p["pdfPage"])
                self.assertIsNone(p["printedPage"])
        self.assertEqual(self.ledger["evidence"]["pdfPages"], 409)
        self.assertEqual(self.collated["source"]["totalViewerPages"], 408)

    def test_bounded_candidates_have_traceable_differences_but_no_approval(self):
        self.assertEqual(len(self.collated["quoteCandidates"]), 2)
        for candidate in self.collated["quoteCandidates"]:
            raw = next(p for p in self.bundle["passages"] if p["id"] == candidate["passageId"])
            self.assertEqual(raw["text"][candidate["originalStart"]:candidate["originalEnd"]], candidate["originalText"])
            self.assertEqual(candidate["textSha256"], extract.digest(candidate["text"].encode()))
            self.assertFalse(candidate["studentEligible"])
            self.assertFalse(candidate["indexed"])
            self.assertIsNone(candidate["scientificApproval"])
            self.assertEqual(candidate["reviewStatus"], "unreviewed")
            reconstructed = candidate["originalText"]
            for change in reversed(candidate["changes"]):
                reconstructed = reconstructed[:change["originalStart"]] + change["after"] + reconstructed[change["originalEnd"]:]
            self.assertEqual(reconstructed, candidate["text"])
            self.assertEqual(candidate["evidence"]["pdfPage"], 7)

    def test_changed_original_approval_evidence_or_pdf_is_rejected(self):
        for field, value in [
            ("rawTextSha256", "0" * 64),
            ("scientificApproval", "approved"),
            ("method", "llm_only"),
        ]:
            ledger = deepcopy(self.ledger)
            ledger[field] = value
            with self.assertRaises(ValueError):
                extract.prepare(self.page_html, self.raw, ledger, ROOT)
        for field, value in [
            ("pdfSha256", "0" * 64),
            ("pdfUrl", "https://example.com/another-edition.pdf"),
            ("pdfFile", "../original.txt"),
        ]:
            ledger = deepcopy(self.ledger)
            ledger["evidence"][field] = value
            with self.assertRaises(ValueError):
                extract.prepare(self.page_html, self.raw, ledger, ROOT)
        ledger = deepcopy(self.ledger)
        ledger["pages"][0]["imageSha256"] = "0" * 64
        with self.assertRaises(ValueError):
            extract.prepare(self.page_html, self.raw, ledger, ROOT)

    def test_ambiguous_changed_overlapping_or_wrong_page_edits_are_rejected(self):
        for field, value in [("before", "غير موجود"), ("before", " "), ("pdfPage", 7)]:
            ledger = deepcopy(self.ledger)
            ledger["corrections"][1][field] = value
            with self.assertRaises(ValueError):
                extract.prepare(self.page_html, self.raw, ledger, ROOT)
        ledger = deepcopy(self.ledger)
        entry = deepcopy(ledger["corrections"][1])
        entry["id"] = "overlap"
        ledger["corrections"].append(entry)
        with self.assertRaises(ValueError):
            extract.prepare(self.page_html, self.raw, ledger, ROOT)
        ledger = deepcopy(self.ledger)
        ledger["candidates"].append(ledger["candidates"][0])
        with self.assertRaises(ValueError):
            extract.prepare(self.page_html, self.raw, ledger, ROOT)

    def test_saved_bundle_is_reproducible(self):
        self.assertEqual(json.loads((ROOT / "passages.json").read_text()), self.collated)
        report = extract.render_report(self.collated, ROOT)
        self.assertIn("data:image/png;base64,", report)
        self.assertIn("مستبعد من الاقتباسات", report)
        self.assertEqual((ROOT / "review.html").read_bytes().decode("utf-8"), report)

    def test_cli_preserves_original_and_requires_explicit_collation(self):
        script = Path(__file__).with_name("extract-aljam3-commentary.py")
        with tempfile.TemporaryDirectory() as output:
            command = [sys.executable, str(script), "--html", str(ROOT / "source-page.html"),
                       "--text", str(ROOT / "original.txt"), "--output", output]
            self.assertEqual(subprocess.run(command + ["--collation", str(ROOT / "collation.json")], capture_output=True).returncode, 0)
            self.assertTrue((Path(output) / "evidence/source.pdf").exists())
            snapshot = (Path(output) / "passages.json").read_bytes()
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertEqual((Path(output) / "passages.json").read_bytes(), snapshot)
            (Path(output) / "original.txt").write_bytes(b"do not overwrite")
            self.assertNotEqual(subprocess.run(command + ["--collation", str(ROOT / "collation.json")], capture_output=True).returncode, 0)
            self.assertEqual((Path(output) / "original.txt").read_bytes(), b"do not overwrite")

    def test_reject_changed_identity_and_pagination(self):
        for page_html, raw in [
            (self.page_html.replace(b'value="408"', b'value="407"'), self.raw),
            (self.page_html, self.raw.replace(b"PAGE_SEPARATOR", b"CHANGED", 1)),
        ]:
            with self.assertRaises(ValueError):
                extract.prepare(page_html, raw)

    def test_report_escapes_source_text(self):
        source = self.bundle["source"]
        report = extract.render_report({"source": source, "passages": [{
            "viewerPage": 7, "id": "sample", "text": "<script>alert(1)</script>",
            "sourceUrl": extract.PAGE_URL.format(7),
        }]})
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", report)
        self.assertNotIn("<script>alert(1)</script>", report)


if __name__ == "__main__":
    unittest.main()
