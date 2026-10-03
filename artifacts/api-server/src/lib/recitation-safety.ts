/** Model selection and benchmark reports can never authorize student grading. */
export function assertPracticeOnlyResult(value: Record<string, unknown>): void {
  const alignment = value.alignment;
  if (
    value.provisional !== true || value.assessment !== false ||
    typeof alignment !== "object" || alignment === null || Array.isArray(alignment)
  ) {
    throw new Error("Recitation output must remain experimental practice.");
  }
  const diagnostic = alignment as Record<string, unknown>;
  if (
    diagnostic.approvedForAssessment !== false ||
    diagnostic.studentScore !== null || diagnostic.wordErrorRate !== null ||
    !Array.isArray(diagnostic.spans)
  ) {
    throw new Error("Recognition evidence cannot authorize assessment.");
  }
  for (const span of diagnostic.spans) {
    if (
      typeof span !== "object" || span === null ||
      span.confirmedLearnerError !== false ||
      (span.kind !== "recognized_word_match_not_assessment" && span.humanReviewRequired !== true) ||
      (["possible_omission", "possible_substitution"].includes(span.kind) &&
        span.observedContinuationOnBothSides !== true)
    ) {
      throw new Error("Unverified recognition cannot confirm learner or passage-boundary errors.");
    }
  }
}