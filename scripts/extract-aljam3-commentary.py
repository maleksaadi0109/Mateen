#!/usr/bin/env python3
"""Prepare a private, unreviewed commentary bundle. Never writes to the app DB."""
import argparse
import base64
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import sys
from urllib.parse import urlparse
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent))
from aljam3_collation import collate

SOURCE_URL = "https://aljam3.com/3190/7673/7"
PAGE_URL = "https://aljam3.com/ar/3190/7673/{}"
TITLE = "شرح الأربعين النووية - ابن عثيمين"
AUTHOR = "محمد بن صالح العثيمين"
MAX_CHARS = 1600


def digest(data):
    return hashlib.sha256(data).hexdigest()


class SourcePage(HTMLParser):
    def __init__(self):
        super().__init__()
        self.download_url = None
        self.total_pages = None
        self.title = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        url = attrs.get("data-file-download-url-value", "")
        if url.endswith("/79597.txt"):
            parsed = urlparse(url)
            if parsed.scheme != "https" or parsed.hostname != "huggingface.co":
                raise ValueError("Unexpected download host")
            if not parsed.path.startswith("/datasets/ieasybooks-org/shamela-waqfeya-library/"):
                raise ValueError("Unexpected source dataset")
            self.download_url = url
        if "data-pdf-viewer-total-pages-value" in attrs:
            self.total_pages = int(attrs["data-pdf-viewer-total-pages-value"])
            self.title = attrs.get("data-top-controls-book-title-value")


def download(url):
    with urlopen(Request(url, headers={"User-Agent": "Mateen-source-preparation/1.0"}), timeout=60) as response:
        data = response.read(5_000_001)
    if len(data) > 5_000_000:
        raise ValueError("Source exceeds the preparation size limit")
    return data


def split_page(text):
    """Return exact, contiguous slices; prefer line/sentence/word boundaries."""
    start = 0
    while start < len(text):
        end = min(start + MAX_CHARS, len(text))
        if end < len(text):
            for separator in ("\n", ". ", " "):
                boundary = text.rfind(separator, start + MAX_CHARS // 2, end)
                if boundary >= 0:
                    end = boundary + len(separator)
                    break
        yield start, end, text[start:end]
        start = end


def prepare(page_html, raw_text, ledger=None, evidence_root=None):
    source = SourcePage()
    source.feed(page_html.decode("utf-8"))
    if source.title != TITLE or source.total_pages != 408 or not source.download_url:
        raise ValueError("The selected source identity or pagination changed; inspect before extracting")
    pages = raw_text.decode("utf-8-sig").split("PAGE_SEPARATOR")
    if len(pages) != 409 or pages[-1].strip():
        raise ValueError("Unexpected page separators; do not guess page positions")
    pages.pop()
    # These boundaries are from this specific electronic edition, not another book.
    if "الحديث الأول" not in pages[4] or "فهرس" not in pages[405]:
        raise ValueError("Commentary boundaries changed")
    if "الحديث الثاني والأربعون" not in pages[404]:
        raise ValueError("Last commentary page changed")
    passages = []
    for page_number in range(5, 406):
        text = pages[page_number - 1]
        if not text.strip():
            raise ValueError(f"Empty commentary page {page_number}")
        for part, (start, end, quote) in enumerate(split_page(text), 1):
            passages.append({
                "id": f"aljam3-3190-7673-p{page_number:03d}-{part:02d}",
                "text": quote,
                "sourceUrl": PAGE_URL.format(page_number),
                "viewerPage": page_number,
                "printedPage": None,
                "pdfPage": None,
                "volume": None,
                "startOffset": start,
                "endOffset": end,
                "textSha256": digest(quote.encode("utf-8")),
                "reviewStatus": "unreviewed",
                "indexed": False,
            })
    bundle = {
        "format": "mateen-source-preparation-v1",
        "source": {
            "title": TITLE,
            "author": AUTHOR,
            "textId": "nawawi",
            "sourceUrl": SOURCE_URL,
            "textDownloadUrl": source.download_url,
            "edition": "نسخة الجامع الإلكترونية، الكتاب 3190، الملف 7673؛ رقم الطبعة غير متحقق",
            "version": "aljam3-" + digest(raw_text)[:16],
            "status": "prepared_unreviewed",
            "authorizationStatement": "أفاد صاحب المشروع بأن الشيخ ابن عثيمين يسمح باستخدام أي مصدر منه، وطلب استخراج المقاطع من هذا الرابط.",
            "authorizationStatementKind": "user_attestation_not_independent_verification",
            "scientificApproval": None,
            "rawTextSha256": digest(raw_text),
            "pageHtmlSha256": digest(page_html),
            "totalViewerPages": 408,
            "includedViewerPages": [5, 405],
            "excludedViewerPages": [1, 2, 3, 4, 406, 407, 408],
            "warnings": [
                "تفريغ الموقع يتضمن أخطاء نصية، منها أخطاء في آيات؛ لم تُصحح تخمينياً.",
                "التقسيم آلي، وقد يبدأ المقطع أو ينتهي وسط سياق؛ راجع الصفحة والمقاطع المجاورة.",
                "الأرقام روابط صفحات الموقع وليست توثيقاً لأرقام الطبعة المطبوعة أو PDF.",
                "المادة تشمل المتن والشرح والحواشي كما وردت؛ ليست كل فقرة كلام الشارح.",
                "ليست هذه مجموعة مصادر معتمدة أو مفهرسة، ولم تُسجل نتيجة اختبار للنموذج.",
            ],
        },
        "passages": passages,
    }
    return collate(bundle, ledger, evidence_root)


def render_report(bundle, evidence_root=None):
    def escaped_text(text):
        # Character references preserve original line endings without CRLF/trailing
        # whitespace in generated HTML source. Never normalize the stored text.
        return html.escape(text).replace("\r", "&#13;").replace("\n", "&#10;")

    source = bundle["source"]
    articles = []
    for passage in bundle["passages"]:
        corrections = "".join(
            f'<li><del>{escaped_text(c["before"])}</del> ← <ins>{escaped_text(c["after"])}</ins>'
            f'<p>{html.escape(c["reason"])} · PDF {c["pdfPage"]}: {html.escape(c["location"])}</p></li>'
            for c in passage.get("corrections", [])
        )
        correction_html = f'<details><summary>تصحيحات جزئية موثقة — لا يعتمد كامل المقطع</summary><ul>{corrections}</ul></details>' if corrections else ""
        articles.append(
            f'<article><h2>صفحة الموقع {passage["viewerPage"]} · {html.escape(passage["id"])}</h2>'
            f'<p class="blocked">مستبعد من الاقتباسات: {html.escape(passage.get("exclusionReason", "لم يقابل كاملاً"))}</p>'
            f'{correction_html}<details><summary>التفريغ الأصلي غير المصحح — ليس للاقتباس</summary><p class="quote">{escaped_text(passage["text"])}</p></details>'
            f'<a href="{html.escape(passage["sourceUrl"], quote=True)}" target="_blank" rel="noopener noreferrer">فتح الصفحة الأصلية ومراجعة السياق</a></article>'
        )
    candidates = "".join(
        f'<section><h2>{html.escape(p["id"])} · الموقع {p["evidence"]["viewerPage"]} / PDF {p["evidence"]["pdfPage"]} / المطبوعة {html.escape(p["evidence"]["printedPage"])}</h2>'
        f'<p class="quote">{escaped_text(p["text"])}</p>'
        f'<p>{html.escape(p["scope"])}</p><p>الفروق: {html.escape(p["difference"])}</p>'
        f'<p>الموضع المصور: {html.escape(p["location"])}</p></section>'
        for p in bundle.get("quoteCandidates", [])
    )
    limitations = "".join(
        f'<li>{html.escape(note)}</li>' for note in source.get("collationLimitations", [])
    )
    images = ""
    if evidence_root:
        pages = {p["viewerPage"]: p["pageEvidence"] for p in bundle["passages"] if "pageEvidence" in p}
        for number, page in sorted(pages.items()):
            encoded = base64.b64encode((evidence_root / page["imageFile"]).read_bytes()).decode("ascii")
            images += (
                f'<details><summary>الصورة المقابَلة: الموقع {number} / PDF {page["pdfPage"]} / المطبوعة {html.escape(page["printedPage"])}</summary>'
                f'<p>{html.escape(page["basis"])}</p><img style="max-width:100%;height:auto" '
                f'alt="صورة الصفحة {number} من الأصل المرتبط" src="data:image/png;base64,{encoded}"></details>'
            )
    return f"""<!doctype html>
<html lang="ar" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>مقاطع شرح الأربعين النووية — نسخة للمراجعة</title>
<style>
body{{max-width:950px;margin:32px auto;padding:0 20px;background:#faf7ef;color:#292a24;font:18px/1.9 system-ui,sans-serif}}
h1{{font-size:28px}}h2{{font-size:17px;color:#36564b;overflow-wrap:anywhere}}
aside,article,section{{padding:20px;margin:18px 0;border:1px solid #d8d9cd;border-radius:12px;background:white}}
aside{{background:#fff1d4}}.quote{{white-space:pre-wrap}}input{{box-sizing:border-box;width:100%;padding:14px;font:inherit}}
a{{color:#215848}}[hidden]{{display:none}}label{{font-weight:bold}}.blocked,del{{color:#8a3024}}ins{{color:#215848}}summary{{cursor:pointer}}
</style>
<h1>{html.escape(source["title"])}</h1>
<p>{html.escape(source["author"])} · {len(bundle["passages"])} مقطعًا آليًا من 401 صفحة، من صفحة الموقع 5 إلى 405.</p>
<aside><b>نسخة غير مدققة للمراجعة، وليست إجابة علمية معتمدة</b><ul>
{''.join('<li>'+html.escape(w)+'</li>' for w in source["warnings"])}</ul>
<p>حُفظت إفادة صاحب المشروع بالسماح بالاستخدام، دون تحويلها إلى مراجعة مستقلة للحقوق أو اعتماد علمي.
الاختبار متروك لصاحب المشروع بناءً على طلبه؛ لم يُشغّل النموذج ولم تُحسب نسب نجاح.</p></aside>
<h2>فقرات محددة قوبلت بصرياً — غير معتمدة وغير منشورة للطلاب</h2>
<p>كل المقاطع الآلية مستبعدة كوحدات كاملة. المقابلة الجزئية لا تجيز اقتباس بقية المقطع. الأصل محفوظ، والتصحيحات منفصلة.</p>
<ul>{limitations}</ul>
{candidates or '<p>لا توجد فقرات مقابلة بدليل مصور في هذا الاستخراج.</p>'}
<h2>دليل المقابلة المصوّر</h2>
{images}
<p>الصور وملف PDF وسجل التصحيح وبصماته محفوظة في مجلد evidence وملف collation.json بجوار هذه الحزمة.</p>
<h2>أرشيف المقاطع الأصلية المستبعدة</h2>
<label for="search">ابحث داخل المقاطع المستخرجة</label>
<input id="search" type="search" placeholder="مثل: النية أو الأعمال" autocomplete="off">
<p id="count" role="status">{len(bundle["passages"])} مقطعًا</p>
<main>{''.join(articles)}</main>
<script>
const articles=Array.from(document.querySelectorAll('article'));
function normalize(s){{return s.normalize('NFKC').replace(/[\\u064B-\\u065F\\u0670\\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').toLowerCase()}}
const texts=articles.map(a=>normalize(a.textContent));
document.getElementById('search').addEventListener('input',event=>{{
const terms=normalize(event.target.value.trim()).split(/\\s+/).filter(Boolean);
let visible=0;articles.forEach((a,i)=>{{a.hidden=!terms.every(t=>texts[i].includes(t));if(!a.hidden)visible++}});
document.getElementById('count').textContent=visible+' مقطعًا مطابقًا';
}});
</script></html>"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--html", type=Path, help="Reuse a saved source page instead of downloading")
    parser.add_argument("--text", type=Path, help="Reuse a saved original TXT instead of downloading")
    parser.add_argument("--collation", type=Path, help="Explicit scan-backed ledger; without it ALL passages remain excluded")
    parser.add_argument("--output", type=Path, default=Path("deliverables/aljam3-commentary"))
    args = parser.parse_args()
    page_html = args.html.read_bytes() if args.html else download(PAGE_URL.format(7))
    source = SourcePage()
    source.feed(page_html.decode("utf-8"))
    if source.title != TITLE or not source.download_url:
        raise ValueError("Missing or incorrect source metadata")
    raw = args.text.read_bytes() if args.text else download(source.download_url)
    ledger = json.loads(args.collation.read_text(encoding="utf-8")) if args.collation else None
    bundle = prepare(page_html, raw, ledger, args.collation.parent if args.collation else None)
    args.output.mkdir(parents=True, exist_ok=True)
    # Never overwrite the preserved source or replace a collated bundle silently.
    for name, expected in [("original.txt", raw)]:
        existing = args.output / name
        if existing.exists() and existing.read_bytes() != expected:
            raise ValueError("Original bytes differ; use a NEW output directory")
    existing_bundle = args.output / "passages.json"
    if existing_bundle.exists() and not args.collation:
        previous = json.loads(existing_bundle.read_text(encoding="utf-8"))
        if previous["source"].get("collationEvidence"):
            raise ValueError("Refusing to erase collation; supply --collation or a NEW output directory")
    if args.collation:
        # A regenerated bundle must travel with its audit trail, not broken local references.
        evidence_files = [ledger["evidence"]["pdfFile"], ledger["evidence"]["identityImageFile"]] + [p["imageFile"] for p in ledger["pages"]]
        copies = [(args.collation, args.output / "collation.json")]
        copies += [(args.collation.parent / name, args.output / name) for name in evidence_files]
        for src, dest in copies:
            if src.resolve() != dest.resolve() and dest.exists() and src.read_bytes() != dest.read_bytes():
                raise ValueError("Existing evidence differs; use a NEW output directory")
        for src, dest in copies:
            if src.resolve() != dest.resolve():
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(src, dest)
    # Retain only public source metadata, not remote form/session tokens or scripts.
    metadata = (
        '<!-- Public metadata extracted from the selected page; not a full page snapshot. -->\n'
        f'<div data-pdf-viewer-total-pages-value="{source.total_pages}" '
        f'data-top-controls-book-title-value="{html.escape(source.title, quote=True)}"></div>\n'
        f'<button data-file-download-url-value="{html.escape(source.download_url, quote=True)}"></button>\n'
    )
    (args.output / "source-page.html").write_text(metadata, encoding="utf-8")
    (args.output / "original.txt").write_bytes(raw)
    (args.output / "passages.json").write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    (args.output / "review.html").write_text(render_report(bundle, args.output if ledger else None), encoding="utf-8")
    print(json.dumps({
        "pages": 401, "passages": len(bundle["passages"]), "status": bundle["source"]["status"],
        "collation": bundle["source"].get("collationSummary", {"studentEligible": 0}),
    }))


if __name__ == "__main__":
    main()
