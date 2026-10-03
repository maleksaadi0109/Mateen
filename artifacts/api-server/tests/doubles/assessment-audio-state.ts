export const assessmentAudioTestState = {
  uploadObjects: new Map<string, Buffer>(),
  frozenObjects: new Map<string, Buffer>(),
  writerInvocationPaths: [] as string[],
  signedUrls: [] as Array<{ path: string; expiresAt: string }>,
  validationCalls: 0,
  failValidationAfterWrite: false,
  failDeletesRemaining: 0,
  nextUploadId: 1,
};

export function resetAssessmentAudioTestState() {
  assessmentAudioTestState.uploadObjects.clear();
  assessmentAudioTestState.frozenObjects.clear();
  assessmentAudioTestState.writerInvocationPaths.length = 0;
  assessmentAudioTestState.signedUrls.length = 0;
  assessmentAudioTestState.validationCalls = 0;
  assessmentAudioTestState.failValidationAfterWrite = false;
  assessmentAudioTestState.failDeletesRemaining = 0;
  assessmentAudioTestState.nextUploadId = 1;
}