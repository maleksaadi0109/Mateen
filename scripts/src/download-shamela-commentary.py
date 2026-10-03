"""Archive the user-selected commentary for review; never write approval records."""

import concurrent.futures
import gzip
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "attached_assets/source-candidates/shamela-21812"
BASE = "https://shamela.ws/book/21812"
MAX_BYTES = 1_000_000
LAST_VIEWER_PAGE = 403  # Last-page link on the source, not the printed page count.


class SameHostRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        url = urlsplit(newurl)
        if url.scheme != "https" or url.netloc != "shamela.ws":
            raise ValueError("Source redirected outside the allowed HTTPS host")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class SourceText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.parts = []
        self.page_id = None
        self.printed_page = None
        self.matches = 0
        self.title = []
        self.in_title = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "title":
            self.in_title = True
        if tag == "div":
            if self.depth:
                self.depth += 1
            elif "nass" in attrs.get("class", "").split():
                self.depth = 1
                self.matches += 1
                self.page_id = attrs.get("data-page-id")
                self.printed_page = attrs.get("data-page-num")
        if self.depth and tag in ("p", "br", "hr"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if self.depth:
            if tag == "p":
                self.parts.append("\n")
            if tag == "div":
                self.depth -= 1

    def handle_data(self, text):
        if self.in_title:
            self.title.append(text)
        if self.depth:
            self.parts.append(text)

    def text(self):
        # Keep original wording/diacritics; normalize presentation whitespace only.
        return "\n".join(
            line.strip() for line in "".join(self.parts).splitlines() if line.strip()
        )


def fetch(url):
    opener = build_opener(SameHostRedirect())
    request = Request(url, headers={"User-Agent": "Mateen-source-review/1.0"})
    with opener.open(request, timeout=30) as response:
        if "text/html" not in response.headers.get("Content-Type", ""):
            raise ValueError("Unexpected source content type")
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("Source page exceeds the size limit")
    return raw


def download_page(page_id):
    page_path = DEST / "pages" / f"{page_id:04}.json"
    raw_path = DEST / "original-html" / f"{page_id:04}.html.gz"
    raw = gzip.decompress(raw_path.read_bytes()) if raw_path.exists() else None
    for attempt in range(3):
        try:
            if raw is None:
                raw = fetch(f"{BASE}/{page_id}")
            parsed = SourceText()
            parsed.feed(raw.decode("utf-8"))
            text = parsed.text()
            if (
                parsed.matches != 1
                or parsed.page_id != str(page_id)
                or not parsed.printed_page
                or not re.fullmatch(r"[0-9]{1,4}", parsed.printed_page)
                or len(text) < 30
                or not re.search(r"[\u0600-\u06ff]", text)
                or "شرح الأربعين النووية للعثيمين" not in "".join(parsed.title)
            ):
                raise ValueError(f"Invalid book/page identity or empty content: {page_id}")
            record = {
                "viewerPage": page_id,
                "printedPage": int(parsed.printed_page),
                "sourceUrl": f"{BASE}/{page_id}",
                "text": text,
                "originalHtmlSha256": hashlib.sha256(raw).hexdigest(),
                "reviewStatus": "pending",
            }
            raw_path.write_bytes(gzip.compress(raw, mtime=0))
            page_path.write_text(
                json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            time.sleep(0.25)
            return record
        except HTTPError as error:
            if error.code in (401, 403, 404):
                raise  # Do not bypass access restrictions or invent missing pages.
            if attempt == 2:
                raise
            time.sleep(2 ** (attempt + 1))
        except (TimeoutError, OSError):
            if attempt == 2:
                raise
            time.sleep(2 ** (attempt + 1))


def main():
    (DEST / "pages").mkdir(parents=True, exist_ok=True)
    (DEST / "original-html").mkdir(exist_ok=True)
    metadata = {
        "sourceUrl": BASE,
        "title": "شرح الأربعين النووية",
        "author": "محمد بن صالح بن محمد العثيمين",
        "publisher": "دار الثريا للنشر",
        "catalogPrintedPageCount": 405,
        "expectedViewerPageCount": LAST_VIEWER_PAGE,
        "scientificApproval": "pending",
        "reuseApproval": "pending",
        "indexed": False,
        "complete": False,
    }
    manifest = DEST / "manifest.json"
    manifest.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    catalog = fetch(BASE)
    (DEST / "catalog.html.gz").write_bytes(gzip.compress(catalog, mtime=0))
    if b"/book/21812/403" not in fetch(f"{BASE}/3"):
        raise ValueError("Source last-page link changed; inspect before downloading")
    records = []
    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = {
            pool.submit(download_page, page): page
            for page in range(1, LAST_VIEWER_PAGE + 1)
        }
        for future in concurrent.futures.as_completed(futures):
            try:
                records.append(future.result())
            except Exception as error:
                failures.append({"viewerPage": futures[future], "error": str(error)})
            if (len(records) + len(failures)) % 50 == 0:
                print(f"Downloaded {len(records)} pages; failures {len(failures)}", flush=True)
    records.sort(key=lambda page: page["viewerPage"])
    metadata.update({
        "downloadedAt": datetime.now(timezone.utc).isoformat(),
        "downloadedViewerPageCount": len(records),
        "failures": failures,
        "complete": len(records) == LAST_VIEWER_PAGE and not failures,
    })
    manifest.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    if not metadata["complete"]:
        raise RuntimeError("Download incomplete; see manifest. No approval or indexing performed.")
    with (DEST / "commentary.txt").open("w", encoding="utf-8") as output:
        output.write("شرح الأربعين النووية — محمد بن صالح العثيمين\nنسخة مرشّحة للمراجعة، غير معتمدة للنشر أو الفهرسة.\n")
        for page in records:
            output.write(
                f"\n\n--- الصفحة المطبوعة {page['printedPage']} | "
                f"صفحة العرض {page['viewerPage']} ---\n"
                f"{page['sourceUrl']}\n\n{page['text']}\n"
            )
    print(json.dumps(metadata, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()