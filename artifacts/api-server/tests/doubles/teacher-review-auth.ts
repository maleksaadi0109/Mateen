import type { Request } from "express";

// Test-bundle-only identities. Never grant synthetic review authority in an app database.
const identities = new Set(["student-a", "student-b", "teacher-a", "teacher-b",
  "reviewer-no-mfa", "reviewer-old", "reviewer-ok", "reviewer-unverified", "reviewer-disabled",
  "reviewer-locked", "content-reviewer", "self-reviewer"]);
export function getAuth(req: Request) {
  const id = req.get("x-test-participant");
  return {
    userId: id && identities.has(id) ? id : null,
    factorVerificationAge: id === "student-b" || id === "reviewer-ok" || id === "reviewer-unverified" || id === "reviewer-disabled" ? [0, 0] : [0, -1],
  };
}
export const clerkClient = {
  users: {
    async getUser(id: string) {
      if (!identities.has(id)) throw new Error("Unknown disposable test identity");
      return {
        banned: id === "reviewer-disabled", locked: id === "reviewer-locked",
        twoFactorEnabled: id === "student-b" || (id.startsWith("reviewer-") && id !== "reviewer-no-mfa"),
        primaryEmailAddressId: "test-email",
        emailAddresses: [{ id: "test-email", verification: { status: id === "reviewer-unverified" ? "unverified" : "verified" } }],
        privateMetadata: {
          mateenQualificationReviewer: id === "student-b" || id.startsWith("reviewer-") || id === "self-reviewer",
          mateenContentReviewer: id === "content-reviewer",
        },
      };
    },
  },
};