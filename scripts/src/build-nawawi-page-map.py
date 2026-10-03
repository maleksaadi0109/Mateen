"""Produce LOCAL candidates, never approved mappings. Corrections are explicit JSON.

No fuzzy matches are released. OCR boxes and text need visual verification.
"""
import csv
import hashlib
import json
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "attached_assets/nawawi-page-source"
OUT = ROOT / "artifacts/api-server/src/data/nawawi-page-map.json"

def words(text):
    for old, new in [("﵌", "صلى الله عليه وآله وسلم"), ("﵁", "رضي الله عنه"), ("﵂", "رضي الله عنها")]:
        text = text.replace(old, new)
    return unicodedata.normalize("NFKC", text).split()

def normalize(text):
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"[\u064b-\u065f\u0670\u06d6-\u06edـ]", "", text)
    text = re.sub("[أإآٱ]", "ا", text).replace("ى", "ي").replace("ة", "ه")
    return "".join(c for c in text if unicodedata.category(c)[0] in "LN")

def build():
    records = json.loads((ROOT / "artifacts/api-server/src/data/nawawi.json").read_text())
    boundaries = re.findall(r'\{ id: (\d+), start: "([^"]+)", end: "([^"]+)"',
                           (ROOT / "artifacts/api-server/src/lib/canonical-matn.ts").read_text())
    # Edition page ranges, NOT Turath viewer indexes or printed pages.
    ranges = [(3,3),(4,5),(5,5),(6,6),(7,7),(7,8),(8,8),(8,9),(9,9),
              (10,10),(11,11),(11,11),(11,11),(11,12),(12,12),(13,13),
              (13,13),(14,14),(14,15),(15,15),(16,16),(16,16),(17,17),
              (17,18),(19,19),(20,20),(20,20),(21,22),(22,23),(23,24),
              (24,24),(24,25),(25,25),(25,26),(26,26),(27,27),(27,28),
              (29,29),(29,30),(30,30),(31,31),(31,31)]
    ocr = {}
    for page in range(3,32):
        rows = csv.DictReader((SOURCE / f"ocr/page-{page:03}.tsv").open(),
                              delimiter="\t", quoting=csv.QUOTE_NONE)
        ocr[page] = [
            dict(page=page, text=r["text"],
                 x=round(int(r["left"])/1.5,2), y=round(int(r["top"])/1.5,2),
                 width=round(int(r["width"])/1.5,2), height=round(int(r["height"])/1.5,2))
            for r in rows if r["level"] == "5" and normalize(r["text"])
            and 135 < int(r["top"])/1.5 < 750
        ]
    corrections_path = SOURCE / "corrections.json"
    corrections = json.loads(corrections_path.read_text()) if corrections_path.exists() else {}
    maps = []
    for (sid,start,end), record, (first,last) in zip(boundaries,records,ranges,strict=True):
        assert int(sid) == record["id"]
        raw = record["text"]
        text = raw[raw.index(start):raw.index(end)+len(end)]
        target = words(text)
        source = [r for p in range(first,last+1) for r in ocr[p]]
        candidates = []
        for block in SequenceMatcher(None, [normalize(w) for w in target],
                                     [normalize(r["text"]) for r in source], autojunk=False).get_matching_blocks():
            if block.size < 3:
                continue
            for offset in range(block.size):
                region = source[block.b+offset]
                candidates.append({**region, "wordIndices":[block.a+offset]})
        # Only explicitly visually checked corrections enter the runtime regions.
        correction = corrections.get(sid, {})
        if correction.get("text"):
            assert correction.get("canonicalText") == text
            text = correction["text"]
            target = words(text)
        regions = correction.get("regions", [])
        mapped = {i for region in regions for i in region["wordIndices"]}
        maps.append(dict(hadithId=int(sid), text=text,
                         **{k:correction[k] for k in ("canonicalText","title","heading") if k in correction},
                         textHash=hashlib.sha256(text.encode()).hexdigest(),
                         pageRange=[first,last], candidates=candidates,
                         regions=regions, verification=correction.get("verification","pending"),
                         unmappedIndices=[i for i in range(len(target)) if i not in mapped]))
    pages = [{**p, "sha256":hashlib.sha256((SOURCE/"pages"/p["file"]).read_bytes()).hexdigest(),
              "objectPath":None} for p in json.loads((SOURCE/"source.json").read_text())["pages"]]
    result = dict(edition="دار السلام — الطبعة الرابعة ١٤٢٨هـ / ٢٠٠٧م",
                  sourcePdfHash=hashlib.sha256((SOURCE/"nawawi-source.pdf").read_bytes()).hexdigest(),
                  rightsSourceVersionId=None, pages=pages, hadiths=maps)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2)+"\n")
    print(f"{len(maps)} hadith maps; {sum(len(m['candidates']) for m in maps)} unapproved OCR candidates.")

if __name__ == "__main__":
    build()