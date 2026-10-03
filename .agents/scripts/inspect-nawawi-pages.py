from pathlib import Path
import pymupdf
from PIL import Image, ImageDraw

out = Path(".agents/outputs/nawawi")
out.mkdir(parents=True, exist_ok=True)
doc = pymupdf.open("attached_assets/nawawi-page-source/nawawi-source.pdf")
for index in [0, 1, 4, 5]:
    doc[index].get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5)).save(out / f"pdf-{index+1}.png")
sheet = Image.new("RGB", (1304, 8*280), "white")
draw = ImageDraw.Draw(sheet)
for i in range(32):
    im = Image.open(f"attached_assets/nawawi-page-source/pages/page-{i+1:03}.webp")
    im.thumbnail((326, 255))
    x, y = (i % 4)*326, (i // 4)*280
    sheet.paste(im, (x,y+20))
    draw.text((x+10,y), str(i+1), fill="black")
sheet.save(out / "contact.jpg")