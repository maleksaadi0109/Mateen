"""Render the manually authored Arabic review; never assigns content verdicts."""
import html
import hashlib
import json
import sys
from pathlib import Path

if len(sys.argv) != 4:
    raise SystemExit("أدخل ملف التشغيل ثم ملف المراجعة ثم ملف التقرير.")
run_path, review_path, out_path = map(Path, sys.argv[1:])
run = json.loads(run_path.read_text())
review = json.loads(review_path.read_text())
if hashlib.sha256(run_path.read_bytes()).hexdigest() != review["runSha256"]:
    raise ValueError("بصمة سجل التشغيل لا تطابق المراجعة")
cases = {case["id"]: case for case in run["cases"]}
review_ids = [case["id"] for case in review["cases"]]
if (
    len(cases) != len(run["cases"])
    or len(set(review_ids)) != len(review_ids)
    or set(review_ids) != set(cases)
    or len(cases) != review["expectedCaseCount"]
):
    raise ValueError("الحالات غير مكتملة أو مكررة أو لا تطابق المراجعة")
escape = html.escape
sections = []
for item in review["cases"]:
    case = cases[item["id"]]
    answer_hash = (
        hashlib.sha256(case["answer"].encode()).hexdigest()
        if case["answer"] is not None else None
    )
    if answer_hash != case["answerSha256"] or answer_hash != item["answerSha256"]:
        raise ValueError("بصمة الإجابة لا تطابق المراجعة")
    raw_hashes = [
        hashlib.sha256(attempt["content"].encode()).hexdigest()
        for attempt in case["rawAttempts"] if attempt["content"] is not None
    ]
    if raw_hashes != item["rawContentSha256"]:
        raise ValueError("بصمة النص الخام لا تطابق المراجعة")
    findings = "".join(
        f'<div class="finding"><h4>{escape(f["classification"])}</h4>'
        f'<blockquote>{escape(f["claim"])}</blockquote>'
        f'<p>{escape(f["assessment"])}</p>'
        f'<p class="reference">موضع المقارنة: {escape(f["reference"])}</p></div>'
        for f in item["findings"]
    )
    # Rejected provider drafts are preserved in the raw JSON, not substituted
    # into the student-answer field or silently repaired in this renderer.
    answer = case["answer"] or "لم يقبل مولد مسار الطالب إجابة في هذه التجربة. النص الخام، إن وجد، محفوظ في سجل التشغيل للمراجعة فقط."
    sections.append(
        f'<section><h2>{escape(item["title"])}</h2>'
        f'<p class="status">{escape(item["verdict"])}</p>'
        f'<h3>سؤال الطالب</h3><p>{escape(case["question"])}</p>'
        f'<h3>نتيجة المقارنة</h3><p>{escape(item["summary"])}</p>{findings}'
        f'<details><summary>الإجابة التي قبلها مولد مسار الطالب في التجربة</summary>'
        f'<div class="answer">{escape(answer)}</div></details></section>'
    )
document = (
    '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1">'
    '<title>مراجعة جودة الشروح المطوّلة</title><style>'
    'body{margin:0;background:#f8f5ee;color:#372d27;font:18px/1.9 Tahoma,Arial,sans-serif}'
    'main{max-width:1000px;margin:auto;padding:35px 20px}h1,h2,h3{line-height:1.6}'
    'section,header{background:white;border:1px solid #e3d9cd;border-radius:12px;padding:25px;margin:20px 0}'
    '.notice,.status{background:#fff0d8;padding:15px;border-radius:8px}.finding{border-right:3px solid #a44d21;padding:0 15px;margin:20px 0}'
    'blockquote{margin:0;background:#faf7f3;padding:12px;white-space:pre-wrap}'
    '.reference{font-size:15px;color:#67574c}.answer{white-space:pre-wrap;margin:15px 0}summary{cursor:pointer}'
    'a{color:#91440f}footer{font-size:15px;color:#67574c}</style><main><header>'
    '<h1>مراجعة جودة الشروح المطوّلة</h1>'
    f'<p>{escape(review["date"])}</p><p class="notice">{escape(review["boundary"])}</p>'
    f'<h2>الخلاصة</h2><p>{escape(review["summary"])}</p>'
    f'<h2>منهج المقارنة وحدودها</h2><p>{escape(review["method"])}</p>'
    f'<p>{escape(review["referenceDescription"])}</p></header>'
    + "".join(sections)
    + '<footer>السجل الكامل للأسئلة والسياقات والإجابات الخام والبصمات محفوظ مع التقرير. لا تشكل هذه المقارنة اعتماداً علمياً أو فتوى أو تصريحاً بإعادة نشر الكتاب.</footer></main></html>'
)
out_path.parent.mkdir(parents=True, exist_ok=True)
out_path.write_text(document)
print(out_path)