import type { ReviewPermission } from "../middlewares/review-security";

export interface ReviewSecurityState {
  banned: boolean;
  locked: boolean;
  verifiedEmail: boolean;
  mfaEnabled: boolean;
  secureSession: boolean;
}

export interface ReviewerMetadata {
  mateenContentReviewer?: unknown;
  mateenQualificationReviewer?: unknown;
}

export function hasVerifiedSecondFactor(factorAge: unknown): boolean {
  return Array.isArray(factorAge) && factorAge.length >= 2 &&
    typeof factorAge[1] === "number" && Number.isFinite(factorAge[1]) && factorAge[1] >= 0;
}

export function hasSecureReviewPermission(
  permission: ReviewPermission,
  state: ReviewSecurityState,
  privateMetadata: ReviewerMetadata,
) {
  if (
    state.banned ||
    state.locked ||
    !state.verifiedEmail ||
    !state.mfaEnabled ||
    !state.secureSession
  ) {
    return false;
  }
  return permission === "content"
    ? privateMetadata.mateenContentReviewer === true
    : privateMetadata.mateenQualificationReviewer === true;
}

export function isEligibleTeacherAccount(state: Omit<ReviewSecurityState, "secureSession">) {
  return (
    !state.banned &&
    !state.locked &&
    state.verifiedEmail
  );
}

export function hasTeacherPdfCertificate(documents: readonly { status: string; contentType: string }[]) {
  return documents.some((document) => document.status === "clean" && document.contentType === "application/pdf");
}