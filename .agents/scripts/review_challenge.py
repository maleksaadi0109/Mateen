from pathlib import Path
import csv
import io
import zipfile
from collections import Counter
import fitz

out = Path("/tmp/mateen-evidence")
out.mkdir(exist_ok=True)
doc = fitz.open("attached_assets/دليل_التحدي_1790314178573.pdf")
for i, page in enumerate(doc):
    (out / f"page-{i+1}.txt").write_text(page.get_text(), encoding="utf-8")
doc[18].get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(str(out / "criteria.png"))
print("PDF pages:", len(doc))
with zipfile.ZipFile(next(Path("attached_assets").glob("*1790314178573.zip"))) as z:
    name = next(n for n in z.namelist() if n.endswith(".csv"))
    rows = list(csv.DictReader(io.StringIO(z.read(name).decode("utf-8-sig"))))
print("Survey rows:", len(rows))
for key in rows[0]:
    print("\nQUESTION:", key)
    # Aggregate answers only; avoid timestamps and identifying fields.
    if not any(key.strip().startswith(f"{n}-") for n in range(1, 7)):
        continue
    print(dict(Counter(r[key].strip() for r in rows)))