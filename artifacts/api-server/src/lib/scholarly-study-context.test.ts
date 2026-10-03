import assert from "node:assert/strict";
import { it } from "node:test";
import { identifyNawawiHadith, resolveNawawiHadith, selectNawawiHadithNumber, selectNawawiReference, wantsNawawiExcerpt } from "./scholarly-study-context";
import nawawi from "../data/nawawi.json";

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
    ["اشرح لي 1 حديث في الاربيعن النووية", 1],
    ["اشرح ١ حديث", 1], ["اشرح حديث رقم ۱", 1],
    ["اشرح ثالث حديث", 3], ["الحديث رقم # 5", 5],
    ["اشرح لي 1 في الاربيعن النووية", 1], ["اشرح ١", 1], ["اشرح ١حديث", 1],
  ] as const) {
    assert.match(selectNawawiReference(question, records) ?? "", new RegExp(`رقم ${number} `));
  }
  assert.equal(selectNawawiReference("كيف أنظم المراجعة؟", records), null);
  assert.equal(selectNawawiReference("الحديث 99", records), null);
});

it("identifies a hadith from its actual words or recognized name without requiring a number", () => {
  for (const [question, number] of [
    ["اشرح إنما الأعمال بالنيات", 1],
    ["ما معنى الدين النصيحة؟", 7],
    ["اشرح لا تغضب", 16],
    ["اشرح حديث النية", 1],
    ["اشرح حديث جبريل", 2],
    ["اشرح حديث النصيحة", 7],
    ["اشرح من حسن إسلام المرء تركه ما لا يعنيه", 12],
  ] as const) {
    assert.equal(identifyNawawiHadith(question, nawawi), number, question);
  }
  assert.equal(identifyNawawiHadith("اشرح هذا النص", nawawi, nawawi[0]!.text), 1);
  assert.equal(identifyNawawiHadith("اشرح هذا النص", nawawi, nawawi[15]!.text), 16);
});

it("does not infer another entry for invalid/conflicting numbers or ambiguous/common text", () => {
  for (const question of [
    "اشرح حديث رقم 99 إنما الأعمال بالنيات",
    "اشرح ٠ حديث", "اشرح 100 حديث",
    "اشرح الحديث 1 والحديث 2",
    "اشرح الحديث الأول والحديث الثاني",
    "اشرح الحديث 1 و2",
    "اشرح حديث النية وحديث النصيحة",
    "اشرح حديث النية والنصيحة",
    "اشرح الحديث 1 وحديث النصيحة",
    "اشرح الحديث 1 الدين النصيحة",
    "اشرح 99", "اشرح ٠",
    "اشرح حديث غير موجود في النصوص",
    "كيف أنظم وقت الدراسة؟",
  ]) {
    assert.equal(identifyNawawiHadith(question, nawawi), null, question);
  }
  const ambiguous = [
    { number: 1, text: "النص المشترك الطويل هنا ثم تفصيل أول مختلف" },
    { number: 2, text: "النص المشترك الطويل هنا ثم تفصيل ثان مختلف" },
  ];
  assert.equal(identifyNawawiHadith("اشرح النص المشترك الطويل هنا", ambiguous, "الحديث 1"), null);
  assert.equal(selectNawawiHadithNumber("الحديث 1 والحديث 2"), null);
});

it("preserves excerpt intent independently of valid identity, including invalid numbers and multiple named entries", () => {
  for (const question of [
    "اشرح 99", "اشرح ٠", "اشرح الحديث 1 و2",
    "اشرح حديث النية وحديث النصيحة", "حديث النية وحديث النصيحة",
    "اشرح الحديث 1 وحديث النصيحة",
  ]) {
    assert.deepEqual(resolveNawawiHadith(question, nawawi), { number: null, requested: true }, question);
    assert.equal(wantsNawawiExcerpt(question), true, question);
  }
  assert.deepEqual(resolveNawawiHadith("كيف أنظم وقت الدراسة؟", nawawi), { number: null, requested: false });
  assert.equal(identifyNawawiHadith("اشرح حديث النية وحديث النيات", nawawi), 1);
});