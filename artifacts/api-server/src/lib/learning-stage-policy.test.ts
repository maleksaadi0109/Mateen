import { test } from "node:test";
import assert from "node:assert/strict";
import { learningRecords, scoreStage, stageWords, isStageWord } from "./learning-stage-policy";

const words = Array.from({ length: 100 }, () => "كلمة");
const input = (matched: number) => ({
  matchedIndices: words.flatMap((_, i) => i < matched ? [i] : []),
  issues: words.flatMap((_, i) => i >= matched ? [{ index: i, kind: "substitution" }] : []),
});
test("only above 90% opens stage; denominator is entire hadith", () => {
  assert.equal(scoreStage(words, input(91))?.passed, true);
  assert.equal(scoreStage(words, input(90))?.passed, false);
  assert.equal(scoreStage(words, input(89))?.passed, false);
  assert.equal(scoreStage(words, { matchedIndices: [0], issues: [] })?.percent, 1);
  assert.equal(scoreStage(words, { matchedIndices: [0], issues: [] })?.passed, false);
  assert.equal(scoreStage(words, { matchedIndices: input(91).matchedIndices, issues: [] })?.passed, false, "unreached suffix remains incomplete even above the threshold");
});
test("client percentage, duplicates, out-of-range positions and double classifications rejected", () => {
  assert.equal(scoreStage(words, { ...input(100), percent: 100 }), null);
  assert.equal(scoreStage(words, { matchedIndices: [0, 0], issues: [] }), null);
  assert.equal(scoreStage(words, { matchedIndices: [100], issues: [] }), null);
  assert.equal(scoreStage(words, { matchedIndices: [0], issues: [{ index: 0, kind: "omission" }] }), null);
  assert.equal(scoreStage(words, { matchedIndices: [], issues: [{ index: 0, kind: "omission", heard: "private" }] }), null);
  assert.equal(scoreStage(words, { matchedIndices: [], issues: [{ index: 0, kind: "omission" }, { index: 0, kind: "substitution" }] }), null);
});
test("extras count, fractional scores are preserved, omissions distinct from untouched suffix", () => {
  assert.equal(scoreStage(words, { ...input(91), issues: [...input(91).issues, { index: 1, kind: "extra" }, { index: 1, kind: "extra" }] })?.passed, false);
  const more = Array.from({ length: 1000 }, () => "كلمة");
  const fractional = scoreStage(more, { matchedIndices: more.flatMap((_, i) => i < 899 ? [i] : []), issues: more.flatMap((_, i) => i >= 899 ? [{ index: i, kind: "omission" }] : []) });
  assert.equal(fractional?.percent, 89.9);
  assert.equal(fractional?.passed, false);
  assert.equal(scoreStage(words, { ...input(90), issues: input(90).issues.map(i => ({ ...i, kind: "omission" })) })?.passed, false);
  assert.equal(scoreStage(words, { ...input(91), issues: input(91).issues.map(i => ({ ...i, kind: "omission" })) })?.passed, true);
});
test("all 42 source passages score in full, punctuation excluded, honorifics expanded", () => {
  assert.equal(learningRecords.length, 42);
  for (const h of learningRecords) {
    const result = scoreStage(h.words, { matchedIndices: h.words.flatMap((w, i) => isStageWord(w) ? [i] : []), issues: [] });
    assert.equal(result?.passed, true, `hadith ${h.number}`);
    assert.equal(result?.percent, 100);
  }
  assert.deepEqual(stageWords("﵌"), ["صلى", "الله", "عليه", "وآله", "وسلم"]);
  assert.equal(scoreStage(["الله", "."], { matchedIndices: [0], issues: [] })?.passed, true);
});