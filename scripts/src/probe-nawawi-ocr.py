"""One public book-page OCR experiment. Never sends recordings or user data.

Output remains local candidate evidence, never a student-visible mapping.
"""
import base64
import io
import json
import os
import sys
from pathlib import Path
import urllib.request
import urllib.error
from PIL import Image

root = Path(__file__).resolve().parents[2]
page = root / "attached_assets/nawawi-page-source/pages/page-003.webp"
image = Image.open(page).convert("RGB").resize((1304,1928))
buffer = io.BytesIO()
image.save(buffer, format="PNG")
arabic_probe = "--arabic-vision" in sys.argv
payload = {
    "model":"nvidia/nemotron-parse",
    "tools":[{"type":"function","function":{"name":"markdown_bbox"}}],
    "messages":[{"role":"user","content":[{"type":"image_url","image_url":{
        "url":"data:image/png;base64,"+base64.b64encode(buffer.getvalue()).decode()
    }}]}],
    "temperature":0,
    "max_tokens":4096,
}
if arabic_probe:
    # Independent reading: never give the model the expected canonical words.
    # Native page coordinates are explicit even though the input is 2x enlarged.
    payload = {
        "model":"meta/llama-3.2-90b-vision-instruct", "temperature":0, "max_tokens":4096,
        "messages":[{"role":"user","content":[
            {"type":"text","text":(
                "Read ONLY the hadith matn inside this scanned Arabic page. "
                "Exclude the title, narrator chain, commentary and references. "
                "Return JSON {\"words\":[{\"text\":\"literal printed word\","
                "\"x\":0,\"y\":0,\"width\":0,\"height\":0}]}. "
                "Coordinates must refer to the ORIGINAL page size 652 by 964 pixels "
                "(the supplied image is enlarged 2x). Each rectangle must tightly "
                "enclose exactly one printed word, including diacritics, with no "
                "neighboring words or adjacent lines. Do not guess unknown words "
                "or use your knowledge of this hadith instead of reading the image."
            )},
            {"type":"image_url","image_url":{"url":"data:image/png;base64,"+
                base64.b64encode(buffer.getvalue()).decode()}},
        ]}],
    }
key = os.environ.get("NVIDIA_API_KEY")
if not key:
    raise SystemExit("Configured OCR provider credential unavailable.")
request = urllib.request.Request("https://integrate.api.nvidia.com/v1/chat/completions",
    data=json.dumps(payload).encode(), headers={
        "Authorization":f"Bearer {key}", "Content-Type":"application/json",
    },method="POST")
try:
    with urllib.request.urlopen(request, timeout=120) as response:
        result = json.load(response)
except urllib.error.HTTPError as error:
    raise SystemExit(f"OCR provider rejected request (HTTP {error.code}); no mapping released.")
except (TimeoutError, urllib.error.URLError):
    raise SystemExit("OCR provider unavailable; no mapping released.")
out = root/".cache/nawawi-ocr-probe"
out.mkdir(exist_ok=True)
(out/("page-003-arabic-vision.json" if arabic_probe else "page-003.json")).write_text(
    json.dumps(result,ensure_ascii=False,indent=2))
print("One public page OCR response saved locally for inspection; not approved or published.")