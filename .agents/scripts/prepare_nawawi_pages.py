"""Download a source scan for review and render its pages, without publishing it."""
import json
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen
from zipfile import ZipFile, ZIP_DEFLATED

import fitz

root = Path("attached_assets/nawawi-page-source")
pages = root / "pages"
pages.mkdir(parents=True, exist_ok=True)
source = "https://archive.org/details/Matn_alarbaein_alnawawiuh"
download = "https://ia801602.us.archive.org/8/items/Matn_alarbaein_alnawawiuh/" + quote("متن الأربعين النوويه.pdf")
pdf_path = root / "nawawi-source.pdf"
if not pdf_path.exists():
    with urlopen(download, timeout=60) as response:
        data = response.read(25_000_001)
    if len(data) > 25_000_000 or not data.startswith(b"%PDF-"):
        raise ValueError("Invalid or oversized source PDF")
    pdf_path.write_bytes(data)
with fitz.open(pdf_path) as document:
    if not 1 <= len(document) <= 200:
        raise ValueError("Unexpected page count")
    images = []
    for number, page in enumerate(document, 1):
        path = pages / f"page-{number:03}.webp"
        scale = min(2.0, 1400 / max(page.rect.width, page.rect.height))
        pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        pixmap.pil_save(str(path), format="WEBP", quality=90)
        images.append({"page": number, "file": path.name, "width": pixmap.width, "height": pixmap.height})
manifest = {
    "title": "متن الأربعين النووية",
    "source": source,
    "pageCount": len(images),
    "rightsStatus": "Publicly accessible scan; republication permission not verified. Local reference only.",
    "pages": images,
}
(root / "source.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
archive = root / "nawawi-pages.zip"
with ZipFile(archive, "w", compression=ZIP_DEFLATED) as output:
    output.write(root / "source.json", "source.json")
    for image in images:
        output.write(pages / image["file"], "pages/" + image["file"])
print(json.dumps({"pageCount": len(images), "archive": str(archive), "firstPage": str(pages / images[0]["file"])}, ensure_ascii=False))