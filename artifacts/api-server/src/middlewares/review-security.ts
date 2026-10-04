import { clerkClient, getAuth } from "@clerk/express";
import { db, profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { hasSecureReviewPermission, hasVerifiedSecondFactor } from "../lib/review-security-policy";

export type ReviewPermission = "content" | "qualification";
export type ReviewRequest = Request & { reviewUserId?: string };

const rateLimits = new Map<string, { startedAt: number; count: number }>();

async function accountSecurity(userId: string, req: Request) {
  const [user, auth] = await Promise.all([
    clerkClient.users.getUser(userId),
    Promise.resolve(getAuth(req)),
  ]);
  const primaryEmail = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId,
  );
  const verification = primaryEmail?.verification as
    | { status?: string }
    | null
    | undefined;
  const factorAge = (
    auth as unknown as { factorVerificationAge?: [number | null, number | null] }
  ).factorVerificationAge;
  return {
    user,
    verifiedEmail: verification?.status === "verified",
    mfaEnabled: user.twoFactorEnabled === true,
    secureSession: hasVerifiedSecondFactor(factorAge),
  };
}

export async function getReviewAccess(req: Request) {
  const auth = getAuth(req);
  if (!auth.userId) {
    return {
      contentReviewer: false,
      qualificationReviewer: false,
      verifiedEmail: false,
      mfaEnabled: false,
      secureSession: false,
    };
  }
  const security = await accountSecurity(auth.userId, req);
  return {
    // Permission discovery is separate from session assurance so a granted
    // reviewer can see how to secure their session. Sensitive routes still
    // require hasSecureReviewPermission before reading any protected data.
    contentReviewer: !security.user.banned && !security.user.locked &&
      security.user.privateMetadata.mateenContentReviewer === true,
    qualificationReviewer: !security.user.banned && !security.user.locked &&
      security.user.privateMetadata.mateenQualificationReviewer === true,
    verifiedEmail: security.verifiedEmail,
    mfaEnabled: security.mfaEnabled,
    secureSession: security.secureSession,
  };
}

export function mutationProtection(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const origin = req.get("origin");
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  const protocol =
    req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
  if (!origin || !host) {
    res.status(403).json({ error: "A same-origin request is required" });
    return;
  }
  try {
    const parsed = new URL(origin);
    if (
      parsed.host.toLowerCase() !== host.toLowerCase() ||
      parsed.protocol.replace(/:$/, "").toLowerCase() !== protocol.toLowerCase()
    ) {
      res.status(403).json({ error: "Cross-origin state changes are not allowed" });
      return;
    }
  } catch {
    res.status(403).json({ error: "Invalid request origin" });
    return;
  }

  const actor = getAuth(req).userId || req.ip || "unknown";
  const now = Date.now();
  if (rateLimits.size > 10_000) {
    for (const [key, value] of rateLimits) {
      if (now - value.startedAt >= 60_000) rateLimits.delete(key);
    }
  }
  const entry = rateLimits.get(actor);
  if (!entry || now - entry.startedAt >= 60_000) {
    rateLimits.set(actor, { startedAt: now, count: 1 });
    next();
    return;
  }
  entry.count += 1;
  if (entry.count > 20) {
    res.status(429).json({ error: "Too many requests; try again shortly" });
    return;
  }
  next();
}

export function requireSecureTeacher(
  req: ReviewRequest,
  res: Response,
  next: NextFunction,
): void {
  void (async () => {
    const userId = getAuth(req).userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication is required" });
      return;
    }
    const security = await accountSecurity(userId, req);
    if (security.user.banned || security.user.locked) {
      res.status(403).json({ error: "This account is disabled" });
      return;
    }
    if (!security.verifiedEmail) {
      res.status(403).json({
        error: "A verified email is required to apply as a teacher",
      });
      return;
    }
    const [profile] = await db
      .select({ role: profilesTable.role })
      .from(profilesTable)
      .where(eq(profilesTable.clerkId, userId))
      .limit(1);
    if (profile?.role !== "teacher") {
      res.status(403).json({ error: "This operation requires the teacher role" });
      return;
    }
    req.reviewUserId = userId;
    next();
  })().catch(() => {
    res.status(503).json({ error: "Account security could not be verified" });
  });
}

export function requireReviewPermission(permission: ReviewPermission) {
  return (req: ReviewRequest, res: Response, next: NextFunction): void => {
    void (async () => {
      const userId = getAuth(req).userId;
      if (!userId) {
        res.status(401).json({ error: "Authentication is required" });
        return;
      }
      const security = await accountSecurity(userId, req);
      if (security.user.banned || security.user.locked) {
        res.status(403).json({ error: "This account is disabled" });
        return;
      }
      if (!security.verifiedEmail || !security.mfaEnabled || !security.secureSession) {
        res.status(403).json({
          error: "Verified email and an MFA-protected session are required",
        });
        return;
      }
      if (
        !hasSecureReviewPermission(
          permission,
          {
            banned: security.user.banned,
            locked: security.user.locked,
            verifiedEmail: security.verifiedEmail,
            mfaEnabled: security.mfaEnabled,
            secureSession: security.secureSession,
          },
          security.user.privateMetadata,
        )
      ) {
        res.status(403).json({ error: "This review permission is required" });
        return;
      }
      req.reviewUserId = userId;
      next();
    })().catch(() => {
      res.status(503).json({ error: "Account security could not be verified" });
    });
  };
}