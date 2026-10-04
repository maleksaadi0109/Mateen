import type { Request } from "express";

// Test-bundle-only identities. Never grant synthetic review authority in an app database.
const identities = new Set(["student-a", "student-b", "teacher-a", "teacher-b"]);
export function getAuth(req: Request) {
  const id = req.get("x-test-participant");
  return {
    userId: id && identities.has(id) ? id : null,
    factorVerificationAge: id === "student-b" ? [0, 0] : [0, null],
  };
}
export const clerkClient = {
  users: {
    async getUser(id: string) {
      if (!identities.has(id)) throw new Error("Unknown disposable test identity");
      return {
        banned: false, locked: false,
        twoFactorEnabled: id === "student-b",
        primaryEmailAddressId: "test-email",
        emailAddresses: [{ id: "test-email", verification: { status: "verified" } }],
        privateMetadata: { mateenQualificationReviewer: id === "student-b" },
      };
    },
  },
};