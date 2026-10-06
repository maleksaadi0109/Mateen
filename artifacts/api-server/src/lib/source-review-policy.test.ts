import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  canUseForGrading,
  isEligibleContentReviewer,
  sourceVersionInputSchema,
  validateApprovalEvidence,
} from "./source-review-policy";

const input = {
  hadithNumber: 1,
  text: "Exact verified source wording with no editorial addition.",
  printedPage: 46,
  viewerPage: 12,
  viewerUrl: "https://app.turath.io/book/12836?page=12",
  edition: "Identified printed edition, publisher and year",
  changeReason: "First submitted version for review",
  rightsEvidence:
    "Publisher permission explicitly grants reusable and reproducible text rights.",
  rightsUrl: "https://publisher.example/permissions",
};

const approved = {
  decision: "approved" as const,
  scientificStatus: "approved" as const,
  rightsStatus: "cleared" as const,
  reason:
    "Compared and verified against the identified edition; editorial prose and commentary were excluded from the exact hadith text.",
};

test("strict source input rejects additional keys", () => {
  assert.equal(
    sourceVersionInputSchema.safeParse({ ...input, status: "approved" }).success,
    false,
  );
});

test("a source author cannot clear their own rights", () => {
  assert.match(
    validateApprovalEvidence(input, approved, "author-1", "author-1") ?? "",
    /cannot clear rights/,
  );
});

test("independent verified scientific and reusable-rights evidence permits approval", () => {
  assert.equal(
    validateApprovalEvidence(input, approved, "author-1", "reviewer-1"),
    null,
  );
});

test("approval needs separate scientific and rights clearance", () => {
  assert.match(
    validateApprovalEvidence(
      { ...input, rightsUrl: "", rightsEvidence: "" },
      approved,
      "author-1",
      "reviewer-1",
    ) ?? "",
    /documented reusable-license or permission evidence/,
  );
});

test("grading boundary accepts only explicit approved versions with a valid hash", () => {
  const base = {
    status: "approved",
    scientificStatus: "approved",
    rightsStatus: "cleared",
    payloadHash: "a".repeat(64),
  };
  assert.equal(canUseForGrading(base), true);
  assert.equal(canUseForGrading({ ...base, rightsStatus: "pending" }), false);
  assert.equal(canUseForGrading({ ...base, status: "pending_review" }), false);
  assert.equal(canUseForGrading({ ...base, payloadHash: "not-a-hash" }), false);
});

test("content review requires permission and verified email, not MFA or second factor", () => {
  const secureAccess = {
    contentReviewer: true,
    verifiedEmail: true,
    mfaEnabled: true,
    secureSession: true,
  };
  assert.equal(isEligibleContentReviewer(secureAccess), true);
  assert.equal(
    isEligibleContentReviewer({ ...secureAccess, mfaEnabled: false }),
    true,
  );
  assert.equal(isEligibleContentReviewer({ ...secureAccess, secureSession: false }), true);
  assert.equal(isEligibleContentReviewer({ ...secureAccess, mfaEnabled: false, secureSession: false }), true);
  assert.equal(isEligibleContentReviewer({ ...secureAccess, verifiedEmail: false }), false);
  assert.equal(isEligibleContentReviewer({ ...secureAccess, contentReviewer: false }), false);
});