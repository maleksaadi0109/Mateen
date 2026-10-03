"""Build a private, self-contained human review report. No grading or inference."""
import argparse
import hashlib
import html
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from recitation_evidence import (
    comparison_words, select_recognized_passage, word_level_candidates,
)

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / ".cache/recitation-experiments"
OUTPUT = ROOT / "deliverables/recitation"
KINDS = {
    "possible_omission": "حذف محتمل — يحتاج مراجعة",
    "possible_substitution": "استبدال محتمل — يحتاج مراجعة",
    "possible_extra_words": "كلمات إضافية محتملة — تحتاج مراجعة",
    "unconfirmed_passage_boundary": "حد المقطع غير مؤكد — ليس حذفًا مثبتًا",
}


def load_evidence(path, variant):
    source = Path(path).resolve(strict=True)
    if not source.is_relative_to(CACHE.resolve()) or not source.is_file():
        raise ValueError("Evidence must be a local experiment JSON inside the private cache.")
    if source.stat().st_size > 1024 * 1024:
        raise ValueError("Evidence JSON exceeds 1 MiB.")
    data = json.loads(source.read_text())
    if (
        data.get("kind") != "local_model_comparison_not_assessment"
        or data.get("audioUploaded") is not False
        or data.get("networkDisabled") is not True
        or data.get("canonicalAnswerHintUsed") is not False
        or data.get("approvedForAssessment") is not False
        or data.get("studentScore") is not None
    ):
        raise ValueError("This report only accepts offline, ungraded experiment evidence.")
    runs = data.get("runs")
    if not isinstance(runs, list) or len(runs) > 20:
        raise ValueError("Invalid experiment runs.")
    selected = [r for r in runs if isinstance(r, dict) and r.get("variant") == variant]
    expected_models = {"Qwen/Qwen3-ASR-0.6B-hf", "jonatasgrosman/wav2vec2-large-xlsr-53-arabic"}
    if len(selected) != 2 or {r.get("model") for r in selected} != expected_models:
        raise ValueError("Expected one run per validated experiment model.")
    for run in selected:
        if run.get("possiblyTruncated") is not False:
            raise ValueError("Truncated or unknown output requires separate review.")
        comparison_words(run.get("transcript"))
    return data, selected


def esc(value):
    return html.escape(str(value), quote=True)


def render_report(data):
    panels = []
    for sample in data["samples"]:
        label = esc(sample["label"])
        for run in sample["runs"]:
            rows = []
            for span in run["alignment"]["spans"]:
                if not span["humanReviewRequired"]:
                    continue
                rows.append(
                    "<tr><td>" + esc(KINDS[span["kind"]]) + "</td><td>" +
                    esc(" ".join(span["referenceWords"]) or "—") + "</td><td>" +
                    esc(" ".join(span["recognizedWords"]) or "—") + "</td></tr>"
                )
            panels.append(
                f'<section><h2>{label}</h2><p class="model" dir="ltr">{esc(run["model"])}</p>'
                '<p>هذه فروق بين المرجع والتفريغ، وليست أخطاء حفظ مؤكدة. حتى عينة القراءة الصحيحة '
                'قد يظهر فيها اختلاف بسبب التعرف الآلي.</p>'
                '<div class="table-wrap"><table><thead><tr><th>حالة المراجعة</th>'
                '<th>كلمات المرجع</th><th>الكلمات المتعرّف عليها</th></tr></thead>'
                f'<tbody>{"".join(rows) or "<tr><td colspan=3>لا توجد فروق نصية في الجزء المحدد؛ ليس حكم نجاح.</td></tr>"}'
                '</tbody></table></div>'
                f'<details><summary>التفريغ الخام كاملًا</summary><p>{esc(run["rawTranscript"])}</p></details>'
                '<details><summary>الجزء المحدد وحدود المقارنة</summary>'
                f'<p>{esc(run["selection"]["text"])}</p>'
                f'<p>المقدمة المستبعدة: {esc(" ".join(run["selection"]["excludedPrefix"]) or "لا يوجد")}</p>'
                f'<p>التخريج المستبعد: {esc(" ".join(run["selection"]["excludedSuffix"]) or "لا يوجد")}</p>'
                '<p>الحدود محددة بمراسي كلمات تجريبية وتحتاج مراجعة بشرية؛ '
                'لا توجد توقيتات كلمات أو درجات ثقة.</p></details></section>'
            )
    return '''<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>مَتِين — مراجعة تجربة التسميع</title><style>
*{box-sizing:border-box}body{margin:0;background:#faf8f2;color:#24342a;font:18px/1.8 system-ui,sans-serif}
main{max-width:1050px;margin:auto;padding:24px}h1{font-size:clamp(26px,4vw,40px);line-height:1.4}
h2{font-size:23px;margin:0}.badge{background:#e7efe3;padding:6px 12px;display:inline-block;border-radius:8px}
header,section,.note{background:white;border:1px solid #d7decf;border-radius:14px;padding:24px;margin-bottom:20px}
.warning{border-right:4px solid #a87728}.model{overflow-wrap:anywhere;font-size:15px;color:#50624f}
.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:16px}
th,td{text-align:right;vertical-align:top;padding:12px;border-bottom:1px solid #dde3d6;overflow-wrap:anywhere}
th{background:#eef2e8}details{margin-top:18px}summary{cursor:pointer;min-height:44px; padding:8px 0}
summary:focus-visible{outline:3px solid #466442}details p{overflow-wrap:anywhere}
@media(max-width:600px){main{padding:12px}header,section,.note{padding:16px}th,td{padding:8px;font-size:14px}}
</style></head><body><main><header><span class="badge">تجربة محلية — ليست تقييمًا</span>
<h1>مراجعة فروق التسميع</h1><p>القراءة الصحيحة، حذف «يصيبها»، واستبدالها بـ«يستمتع بها».</p>
<p>توصيف العينات من المستخدم؛ لا يوجد تفريغ بشري مستقل كامل أو نسبة دقة معتمدة.
لم يُرفع الصوت، ولا يحتوي هذا التقرير على ملفات صوتية.</p></header>
<aside class="note warning"><strong>حدود النتيجة</strong><p>كل فرق مرشح للمراجعة فقط.
لم تُفعّل درجات أو ترقية أو مراجعات مجدولة. عينة واحدة لكل حالة لا تكفي لاعتماد النموذج.
المرجع المستورد ما زال قيد التحقق للاستخدام في التقييم وإذن إعادة الاستخدام غير محسوم.
لا يُقيّم النطق أو التشكيل هنا.</p></aside><section><h2>المرجع التجريبي للمقطع المشترك</h2><p>''' + esc(
        data["reference"]["text"]
    ) + '''</p><p>تُستبعد المقدمة والتخريج، لكن حدود التفريغ تحتاج تأكيد المراجع.
لا يُعد غياب نهاية غير مقروءة أو سكوت حذفًا مثبتًا.</p></section>''' + "".join(panels) + '''
<footer class="note">الخطوة التالية للاعتماد: مراجعة بشرية للفروق وتفريغ العينات، ثم مجموعة
متنوعة من القراء والتوقفات والضوضاء ومعيار قبول معتمد. لا يمكن حساب دقة عامة من هذا التقرير.</footer>
</main></body></html>'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--omission-evidence", required=True)
    parser.add_argument("--substitution-evidence", required=True)
    args = parser.parse_args()
    omission, omission_runs = load_evidence(args.omission_evidence, "omission")
    substitution, substitution_runs = load_evidence(args.substitution_evidence, "substitution")
    _, correct_runs = load_evidence(args.substitution_evidence, "original")
    if omission["sourceSha256"] != substitution["sourceSha256"]:
        raise ValueError("The comparisons must share the same correct recording.")
    if omission.get("userDeclaredOmittedWord") != "يصيبها" or substitution.get("userDeclaredSubstitution") != {
        "originalWord": "يصيبها", "replacementPhrase": "يستمتع بها", "providedToRecognizer": False,
    }:
        raise ValueError("The reviewed labels do not match this experiment.")
    source = ROOT / "artifacts/api-server/src/data/nawawi.json"
    first = json.loads(source.read_text())[0]
    # Explicit, versioned scope for this experiment, not a general matn extractor.
    reference = first["text"].split("إنما", 1)[1].split("»", 1)[0]
    reference = "إنما" + reference
    data = {
        "kind": "human_review_packet_not_assessment",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "reference": {
            "text": reference, "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "sourceStatus": "retrieved_pending_review", "reusePermission": "unresolved",
        },
        "samples": [],
        "studentScore": None, "wordErrorRate": None, "approvedForAssessment": False,
    }
    for label, runs in [
        ("قراءة صحيحة بحسب تأكيد المستخدم", correct_runs),
        ("حذف «يصيبها» بحسب توصيف المستخدم", omission_runs),
        ("استبدال «يصيبها» بـ«يستمتع بها» بحسب توصيف المستخدم", substitution_runs),
    ]:
        result = {"label": label, "runs": []}
        for run in runs:
            selection = select_recognized_passage(run["transcript"])
            result["runs"].append({
                "model": run["model"], "rawTranscript": run["transcript"],
                "selection": selection,
                "alignment": word_level_candidates(reference, selection["text"]),
            })
        data["samples"].append(result)
    rendered = render_report(data)
    if len(rendered.encode("utf-8")) > 5 * 1024 * 1024:
        raise ValueError("Report exceeds the deliverable size limit.")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, content in [
        ("recitation-review.json", json.dumps(data, ensure_ascii=False, indent=2) + "\n"),
        ("recitation-review.html", rendered),
    ]:
        path = OUTPUT / name
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as out:
            os.fchmod(out.fileno(), 0o600)
            out.write(content)
    print("Built local review report; no inference, score or assessment capability changed.")


if __name__ == "__main__":
    main()