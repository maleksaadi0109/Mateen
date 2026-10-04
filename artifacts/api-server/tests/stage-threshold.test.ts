import assert from "node:assert/strict";
import { test } from "node:test";
import { scoreStage } from "../src/lib/learning-stage-policy";

const words = Array.from({ length: 1000 }, () => "كلمة");
function attempt(matched: number, complete = true) {
  return {
    matchedIndices: Array.from({ length: matched }, (_, i) => i),
    issues: complete ? Array.from({ length: 1000 - matched }, (_, i) => ({ index: matched + i, kind: "substitution" })) : [],
  };
}
test("strictly above 90 percent, without rounding away fractional passes", () => {
  assert.equal(scoreStage(words, attempt(899))?.passed, false);
  assert.equal(scoreStage(words, attempt(900))?.passed, false);
  assert.equal(scoreStage(words, attempt(901))?.passed, true);
  assert.equal(scoreStage(words, attempt(901))?.percent, 90.1);
  assert.equal(scoreStage(words, attempt(1000))?.percent, 100);
});
test("unspoken suffix cannot pass and extra words count against the denominator", () => {
  assert.equal(scoreStage(words, attempt(999, false))?.passed, false);
  const input = attempt(901);
  input.issues.push(...Array.from({ length: 10 }, () => ({ index: 0, kind: "extra" })));
  assert.equal(scoreStage(words, input)?.passed, false);
});
test("untrusted duplicate indices and client percentages are rejected", () => {
  assert.equal(scoreStage(words, { ...attempt(900), percent: 100 }), null);
  assert.equal(scoreStage(words, { ...attempt(900), matchedIndices: [0, 0] }), null);
});