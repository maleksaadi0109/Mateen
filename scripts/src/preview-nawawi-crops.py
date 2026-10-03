"""Local crop proof sheet. Never expose this rights-restricted sheet in public."""
import json
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[2]
mapping = json.loads((root/"artifacts/api-server/src/data/nawawi-page-map.json").read_text())
out = root/".agents/outputs/nawawi"
out.mkdir(parents=True, exist_ok=True)
for hadith in mapping["hadiths"]:
    regions = hadith["regions"]
    if not regions:
        continue
    sheet = Image.new("RGB",(700, ((len(regions)+4)//5)*110),"#eeeeee")
    draw = ImageDraw.Draw(sheet)
    for n,r in enumerate(regions):
        image = Image.open(root/f'attached_assets/nawawi-page-source/pages/page-{r["page"]:03}.webp')
        crop = image.crop((r["x"],r["y"],r["x"]+r["width"],r["y"]+r["height"]))
        crop.thumbnail((130,75))
        x,y = (n%5)*140, (n//5)*110
        sheet.paste(crop,(x,y+20))
        draw.text((x,y),",".join(map(str,r["wordIndices"])),fill="black")
    sheet.save(out/f'crops-{hadith["hadithId"]}.png')