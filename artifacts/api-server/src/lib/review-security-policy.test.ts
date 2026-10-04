import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  hasSecureReviewPermission,
  isEligibleTeacherAccount,
  hasVerifiedSecondFactor,
  hasTeacherPdfCertificate,
} from "./review-security-policy";

const secureState = {
  banned: false,
  locked: false,
  verifiedEmail: true,
  mfaEnabled: true,
  secureSession: true,
};

test("only a verified second factor age satisfies session protection", () => {
  for (const value of [undefined, null, [0, null], [0, -1], [0, NaN], [0, Infinity]]) {
    assert.equal(hasVerifiedSecondFactor(value), false);
  }
  assert.equal(hasVerifiedSecondFactor([0, 0]), true);
  assert.equal(hasVerifiedSecondFactor([0, 20]), true);
});

test("review permissions are separate and require backend metadata plus secure session", () => {
  assert.equal(
    hasSecureReviewPermission("qualification", secureState, {
      mateenQualificationReviewer: true,
    }),
    true,
  );
  assert.equal(
    hasSecureReviewPermission("content", secureState, {
      mateenQualificationReviewer: true,
    }),
    false,
  );
  assert.equal(
    hasSecureReviewPermission(
      "qualification",
      { ...secureState, secureSession: false },
      { mateenQualificationReviewer: true },
    ),
    false,
  );
  assert.equal(
    hasSecureReviewPermission("qualification", secureState, {
      mateenQualificationReviewer: "true",
    }),
    false,
  );
});

test("teacher approval requires an active verified account but does not require MFA", () => {
  assert.equal(
    isEligibleTeacherAccount({
      banned: false,
      locked: false,
      verifiedEmail: true,
      mfaEnabled: true,
    }),
    true,
  );
  assert.equal(
    isEligibleTeacherAccount({
      banned: true,
      locked: false,
      verifiedEmail: true,
      mfaEnabled: true,
    }),
    false,
  );
  assert.equal(
    isEligibleTeacherAccount({
      banned: false,
      locked: false,
      verifiedEmail: false,
      mfaEnabled: true,
    }),
    false,
  );
});

test("ordinary verified teachers may apply without MFA; reviewers still need it", () => {
  const normalTeacher = { ...secureState, mfaEnabled: false, secureSession: false };
  assert.equal(isEligibleTeacherAccount(normalTeacher), true);
  assert.equal(hasSecureReviewPermission("qualification", normalTeacher, { mateenQualificationReviewer: true }), false);
  assert.equal(isEligibleTeacherAccount({ ...normalTeacher, locked: true }), false);
});

test("a certificate must be a security-checked PDF, not an image or unfinished upload", () => {
  assert.equal(hasTeacherPdfCertificate([]), false);
  assert.equal(hasTeacherPdfCertificate([{ status: "clean", contentType: "image/png" }]), false);
  assert.equal(hasTeacherPdfCertificate([{ status: "uploading", contentType: "application/pdf" }]), false);
  assert.equal(hasTeacherPdfCertificate([{ status: "rejected", contentType: "application/pdf" }]), false);
  assert.equal(hasTeacherPdfCertificate([{ status: "clean", contentType: "application/pdf" }]), true);
});