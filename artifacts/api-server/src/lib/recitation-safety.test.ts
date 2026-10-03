import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPracticeOnlyResult } from "./recitation-safety";

function diagnostic() {
  return {
    provisional: true, assessment: false,
    alignment: {
      approvedForAssessment: false, studentScore: null, wordErrorRate: null,
      spans: [{
        kind: "possible_omission", humanReviewRequired: true,
        confirmedLearnerError: false, observedContinuationOnBothSides: true,
      }],
    },
  };
}

test("practice gate accepts only provisional ungraded interior candidates", () => {
  assert.doesNotThrow(() => assertPracticeOnlyResult(diagnostic()));
});

test("measured evidence or choosing a model cannot turn practice into a grade", () => {
  for (const field of ["approvedForAssessment", "studentScore", "wordErrorRate"] as const) {
    const result: Record<string, unknown> = diagnostic();
    const alignment = result.alignment as Record<string, unknown>;
    alignment[field] = field === "approvedForAssessment" ? true : 95;
    assert.throws(() => assertPracticeOnlyResult(result));
  }
  assert.throws(() => assertPracticeOnlyResult({ ...diagnostic(), assessment: true }));
  assert.throws(() => assertPracticeOnlyResult({ ...diagnostic(), provisional: false }));
});

test("boundary absence and unreviewed differences cannot be student errors", () => {
  for (const kind of ["possible_omission", "possible_substitution"]) {
    const result = diagnostic();
    result.alignment.spans[0].kind = kind;
    result.alignment.spans[0].observedContinuationOnBothSides = false;
    assert.throws(() => assertPracticeOnlyResult(result));
    result.alignment.spans[0].kind = "unconfirmed_passage_boundary";
    assert.doesNotThrow(() => assertPracticeOnlyResult(result));
    result.alignment.spans[0].confirmedLearnerError = true;
    assert.throws(() => assertPracticeOnlyResult(result));
  }
});