import type { Request } from "express";

// Only resolved by test-scholarly-http.mjs; never imported by application code.
const identities = new Set(["student-a", "student-b", "teacher-a", "teacher-b"]);
export function getAuth(req: Request) {
  const id = req.get("x-test-participant");
  return { userId: id && identities.has(id) ? id : null };
}
export const clerkClient = {
  users: {
    async getUser() {
      throw new Error("Administrator identity lookup is outside this test suite");
    },
  },
};