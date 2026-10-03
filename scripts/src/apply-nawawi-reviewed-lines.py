"""Compile manually transcribed, native-pixel lines; never consume OCR candidates.

Each line has page, y, height, pipe-separated visual cells and RTL x edges.
Printed honorifics and joined words may group spoken tokens in one cell.
Run with --apply ONLY after examining the generated crop proof sheets.
"""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "attached_assets/nawawi-page-source"
MAP = ROOT / "artifacts/api-server/src/data/nawawi-page-map.json"
LINES = Path(__file__).with_name("nawawi-reviewed-lines.json")
OUT = ROOT / ".agents/outputs/nawawi"


def compile_entry(entry):
    regions, tokens = [], []
    for page, y, height, text, edges in entry["lines"]:
        cells = text.split("|")
        assert len(edges) == len(cells) + 1, (text, edges)
        assert all(a > b for a, b in zip(edges, edges[1:])), text
        for cell, right, left in zip(cells, edges, edges[1:]):
            words = cell.split()
            assert len(words) == 1 or cell in (
                "صلى الله عليه وسلم", "رضي الله عنه", "رضي الله عنها",
                "رضي الله عنهما", "يا أيها", "عز وجل",
            ), cell
            # The edition also prints these vocatives joined. Keep their spoken
            # tokens separate and reveal the joined glyphs only after both match.
            if cell in ("يارب", "ياغلام", "ياعبادي", "يارسول", "يانبي", "ياابن"):
                words = ["يا", cell[2:]]
            if cell == "ماكان":
                words = ["ما", "كان"]
            regions.append(dict(page=page, x=left, y=y, width=right-left,
                                height=height,
                                wordIndices=list(range(len(tokens), len(tokens)+len(words)))))
            tokens.extend(words)
    return " ".join(tokens), regions


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    entries = json.loads(LINES.read_text())
    data = json.loads(MAP.read_text())
    assert data["sourcePdfHash"] == hashlib.sha256((SOURCE/"nawawi-source.pdf").read_bytes()).hexdigest()
    for page in data["pages"]:
        assert page["sha256"] == hashlib.sha256((SOURCE/"pages"/page["file"]).read_bytes()).hexdigest()
    corrections = json.loads((SOURCE/"corrections.json").read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    for sid, entry in entries.items():
        text, regions = compile_entry(entry)
        # Paginated proof sheets stay readable at native resolution.
        for start in range(0, len(regions), 50):
            batch = regions[start:start+50]
            sheet = Image.new("RGB", (900, ((len(batch)+5)//6)*90), "#eeeeee")
            draw = ImageDraw.Draw(sheet)
            for n, r in enumerate(batch):
                image = Image.open(SOURCE/f'pages/page-{r["page"]:03}.webp')
                crop = image.crop((r["x"], r["y"], r["x"]+r["width"], r["y"]+r["height"]))
                x, y = (n % 6)*150, (n//6)*90
                sheet.paste(crop, (x, y+22))
                draw.text((x, y), ",".join(map(str, r["wordIndices"])), fill="black")
            sheet.save(OUT/f"review-{sid}-{start//50+1}.png")
        if args.apply:
            h = next(h for h in data["hadiths"] if h["hadithId"] == int(sid))
            canonical = h.get("canonicalText", h["text"])
            page, x, y, width, height = entry["heading"]
            correction = dict(
                text=text, canonicalText=canonical, title=entry["title"],
                heading=dict(page=page, x=x, y=y, width=width, height=height),
                regions=regions, verification="visually-checked",
                note="Native scan and every word crop visually checked; sanad then selected report, excluding attribution and footnotes. Geometry review only; canonical assessment reference kept independently.",
            )
            used_pages = [r["page"] for r in regions] + [page]
            correction["pageRange"] = [min(used_pages), max(used_pages)]
            corrections[sid] = correction
            h.update({k: v for k, v in correction.items() if k != "note"})
            h["textHash"] = hashlib.sha256(text.encode()).hexdigest()
            h["unmappedIndices"] = []
        print(f"Hadith {sid}: {len(text.split())} words, {len(regions)} visual cells")
    if args.apply:
        corrections["1"]["note"] = (
            "Opening sanad and matn: 52 training tokens in 49 visually checked "
            "native-page cells, including the four-token prayer symbol. "
            "Geometry review only, not scientific approval or rights clearance."
        )
        MAP.write_text(json.dumps(data, ensure_ascii=False, indent=2)+"\n")
        (SOURCE/"corrections.json").write_text(json.dumps(corrections, ensure_ascii=False, indent=2)+"\n")


if __name__ == "__main__":
    main()