import { getAuth } from "@clerk/express";
import { db, profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";

export type AuthedRequest = Request & { mateenUserId?: string };

export function authenticationRequired(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): void {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication is required" });
    return;
  }
  req.mateenUserId = userId;
  next();
}

export async function getOrCreateProfile(userId: string) {
  await db
    .insert(profilesTable)
    .values({ clerkId: userId, name: "", role: "student", onboarded: false })
    .onConflictDoNothing({ target: profilesTable.clerkId });
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.clerkId, userId))
    .limit(1);
  return profile;
}

export async function requireProfile(
  req: AuthedRequest,
  res: Response,
  role?: "student" | "teacher",
  requireOnboarding = true,
) {
  const profile = await getOrCreateProfile(req.mateenUserId!);
  if (!profile) {
    res.status(500).json({ error: "Unable to load the authenticated profile" });
    return null;
  }
  if (requireOnboarding && !profile.onboarded) {
    res.status(403).json({ error: "Complete profile onboarding first" });
    return null;
  }
  if (role && profile.role !== role) {
    res.status(403).json({ error: `This operation requires the ${role} role` });
    return null;
  }
  return profile;
}

export function mutationOriginProtection(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const origin = req.get("origin");
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const expectedHost = forwardedHost || req.get("host");
  const expectedProtocol =
    req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
  if (!origin || !expectedHost) {
    res.status(403).json({ error: "A same-origin request is required" });
    return;
  }
  try {
    const originUrl = new URL(origin);
    if (
      originUrl.host.toLowerCase() !== expectedHost.toLowerCase() ||
      originUrl.protocol.replace(":", "").toLowerCase() !==
        expectedProtocol.toLowerCase()
    ) {
      res.status(403).json({ error: "Cross-origin state changes are not allowed" });
      return;
    }
  } catch {
    res.status(403).json({ error: "Invalid request origin" });
    return;
  }
  next();
}

export function rateLimit(limit: number, windowMs: number) {
  const requests = new Map<string, { start: number; count: number }>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = getAuth(req).userId || req.ip || req.socket.remoteAddress || "unknown";
    if (requests.size > 1000) {
      for (const [storedKey, entry] of requests) {
        if (now - entry.start >= windowMs) requests.delete(storedKey);
      }
    }
    if (!requests.has(key) && requests.size >= 10_000) {
      res.status(429).json({ error: "Too many requests; try again shortly" });
      return;
    }
    const entry = requests.get(key);
    if (!entry || now - entry.start >= windowMs) {
      requests.set(key, { start: now, count: 1 });
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > limit) {
      res.status(429).json({ error: "Too many requests; try again shortly" });
      return;
    }
    next();
  };
}