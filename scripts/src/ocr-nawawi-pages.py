"""Local-only OCR candidates; never publishes copyrighted page bytes."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess
import pymupdf

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "attached_assets/nawawi-page-source/ocr"
OUT.mkdir(exist_ok=True)

def extract(index):
    doc = pymupdf.open(ROOT / "attached_assets/nawawi-page-source/nawawi-source.pdf")
    image = OUT / f"page-{index:03}.png"
    doc[index-1].get_pixmap(matrix=pymupdf.Matrix(3, 3)).save(image)
    subprocess.run(["tesseract", str(image), str(image.with_suffix("")),
                    "-l", "ara", "--psm", "3", "tsv"], check=True, capture_output=True)
    image.unlink()
    return index

if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=4) as pool:
        for index in pool.map(extract, range(3, 32)):
            print(f"OCR candidate page {index}", flush=True)