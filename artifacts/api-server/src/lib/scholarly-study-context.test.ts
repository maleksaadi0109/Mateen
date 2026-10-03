import assert from "node:assert/strict";
import { it } from "node:test";
import { selectNawawiReference } from "./scholarly-study-context";

const records = Array.from({ length: 42 }, (_, index) => ({
  number: index + 1, text: index === 0 ? "إنما الأعمال بالنيات" : `نص اختباري ${index + 1}`,
}));

it("selects the actual first hadith for the reported Arabic question, not a different hadith", () => {
  assert.match(selectNawawiReference("ما معنى الحديث الأول في الأربعين النووية؟", records) ?? "", /إنما الأعمال بالنيات/);
  assert.match(selectNawawiReference("اشرح أول حديث", records) ?? "", /إنما الأعمال بالنيات/);
});

it("handles Arabic numbered references and full compound ordinals without selecting their first word", () => {
  for (const [question, number] of [
    ["الحديث رقم ٥", 5], ["الحديث 42", 42], ["الحديث الثالث والعشرون", 23],
    ["الحديث الثالث عشر", 13], ["الحديث الحادي والأربعون", 41],
  ] as const) {
    assert.match(selectNawawiReference(question, records) ?? "", new RegExp(`رقم ${number} `));
  }
  assert.equal(selectNawawiReference("كيف أنظم المراجعة؟", records), null);
  assert.equal(selectNawawiReference("الحديث 99", records), null);
});