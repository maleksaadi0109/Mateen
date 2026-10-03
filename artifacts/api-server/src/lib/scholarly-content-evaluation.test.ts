import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CONTENT_CASES, buildContentStudyContext, contentReviewSignals } from "./scholarly-content-evaluation";
import { UNVERIFIED_STUDY_NOTICE } from "./scholarly";

// CWD is the API package under the existing test-scholarly.mjs harness.
const records = JSON.parse(readFileSync("src/data/nawawi.json", "utf8"));
test("content samples resolve actual numbered, named, phrase and reader contexts without commentary injection", () => {
  assert.equal(new Set(CONTENT_CASES.map(item => item.id)).size, CONTENT_CASES.length);
  assert.ok(new Set(CONTENT_CASES.map(item => item.hadith)).size >= 6);
  for (const item of CONTENT_CASES) {
    const context = buildContentStudyContext(item, records);
    assert.ok(context.startsWith(`نص الحديث رقم ${item.hadith} `), item.id);
    assert.ok(context.includes(records.find((record: { number: number }) => record.number === item.hadith).text));
    assert.ok(item.criteria.length >= 4);
    assert.ok(item.referenceViewerPages.length > 0);
  }
  assert.throws(() => buildContentStudyContext({ ...CONTENT_CASES[0]!, hadith: 2 }, records));
});
test("mechanical review signals do not certify semantics or mislabel legitimate quotations as fabricated", () => {
  const prefix = `${UNVERIFIED_STUDY_NOTICE}\n\n`;
  assert.deepEqual(contentReviewSignals(prefix + "التجارة المباحة معصية."), []);
  assert.ok(contentReviewSignals(prefix + "قال تعالى نص يحتاج مقارنة.").length);
  assert.ok(contentReviewSignals("شرح بلا تنبيه مع **heading** https://example.test").length >= 3);
  for (const foreign of ["中文", "намерение", "intention"]) {
    assert.ok(contentReviewSignals(prefix + foreign).includes("حروف غير عربية أو نجوم"));
  }
  assert.deepEqual(contentReviewSignals(prefix + "شرح عربي."), []);
});
test("all required content risks have explicit review cases", () => {
  for (const id of ["intentions-phrases", "acceptance-validity", "lawful-trade-marriage",
    "migration-purpose", "invented-evidence", "occasion-story", "context-injection", "personal-fatwa"]) {
    assert.ok(CONTENT_CASES.some(item => item.id === id), id);
  }
});