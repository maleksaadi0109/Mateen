import type { Request } from "express";

// Resolved only by the disposable preview test bundle; no real Clerk calls.
export type TestIdentity = {
  content?: boolean;
  qualification?: boolean;
  verified?: boolean;
  mfa?: boolean;
  factorAge?: [number | null, number | null];
  banned?: boolean;
  locked?: boolean;
};
export const identities = new Map<string, TestIdentity>();
export function getAuth(req: Request) {
  const id = req.get("x-test-preview-user");
  const identity = id ? identities.get(id) : undefined;
  return {
    userId: identity ? id : null,
    factorVerificationAge: identity?.factorAge ?? [0, 0],
  };
}
export const clerkClient = {
  users: {
    async getUser(id: string) {
      const identity = identities.get(id);
      if (!identity) throw new Error("Unknown synthetic identity");
      return {
        banned: identity.banned ?? false,
        locked: identity.locked ?? false,
        primaryEmailAddressId: "test-email",
        emailAddresses: [{
          id: "test-email", verification: { status: identity.verified === false ? "unverified" : "verified" },
        }],
        twoFactorEnabled: identity.mfa !== false,
        privateMetadata: {
          mateenContentReviewer: identity.content === true,
          mateenQualificationReviewer: identity.qualification === true,
        },
      };
    },
  },
};