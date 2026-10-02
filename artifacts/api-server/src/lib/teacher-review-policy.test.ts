import { strict as assert } from "node:assert";
import { test } from "node:test";
import { SaveTeacherBody } from "@workspace/api-zod";
import { teacherProfileSaveTransition } from "./teacher-review-policy";

const approved = {
  status: "approved" as const,
  revision: 8,
  biography: "Reviewed biography",
  specialties: "Hadith",
  available: true,
};

test("an approved teacher can change only availability without losing approval or revision", () => {
  assert.deepEqual(
    teacherProfileSaveTransition(approved, {
      biography: approved.biography,
      specialties: approved.specialties,
      available: false,
    }),
    {
      status: "approved",
      legacyStatus: "approved",
      revision: 8,
      available: false,
      preserveApproval: true,
      invalidateSubmission: false,
      revokeApproval: false,
    },
  );
});

test("a reviewed profile edit revokes approval and requires a new revision", () => {
  const transition = teacherProfileSaveTransition(approved, {
    biography: "Changed biography",
    specialties: approved.specialties,
    available: true,
  });
  assert.equal(transition.status, "draft");
  assert.equal(transition.available, false);
  assert.equal(transition.revision, 9);
  assert.equal(transition.revokeApproval, true);
});

test("editing while pending invalidates the submission", () => {
  const transition = teacherProfileSaveTransition(
    { ...approved, status: "pending_review" },
    { biography: approved.biography, specialties: approved.specialties, available: true },
  );
  assert.equal(transition.status, "draft");
  assert.equal(transition.revision, 9);
  assert.equal(transition.invalidateSubmission, true);
});

test("teacher profile input rejects extra fields", () => {
  assert.equal(
    SaveTeacherBody.strict()
      .safeParse({
        biography: "A biography",
        specialties: "Hadith",
        available: true,
        status: "approved",
      }).success,
    false,
  );
});