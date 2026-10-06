import { getAuth } from "@clerk/express";
import {
  db,
  profilesTable,
  scholarlyMessagesTable,
  teacherApplicationsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { getReviewAccess } from "../middlewares/review-security";
import type { Citation } from "@workspace/api-zod";
import { publicReferenceUrl } from "../lib/citation-provenance";

export function publicCitations(value: Array<Record<string, unknown>>) {
  // Never project arbitrary stored metadata into a public response.
  return value.map(c => ({
    passageId: c.passageId, sourceId: c.sourceId, sourceTitle: c.sourceTitle,
    author: c.author, edition: c.edition, volume: c.volume, printedPage: c.printedPage,
    pdfPage: c.pdfPage, quote: c.quote,
    ...(c.sourceVersion !== undefined ? { sourceVersion: c.sourceVersion } : {}),
    ...(c.viewerPage !== undefined ? { viewerPage: c.viewerPage } : {}),
    ...(c.snapshotAt !== undefined ? { snapshotAt: c.snapshotAt } : {}),
    ...(c.sourceStatusAtAnswer !== undefined ? { sourceStatusAtAnswer: c.sourceStatusAtAnswer } : {}),
    ...(c.publicSourceUrl !== undefined ? { publicSourceUrl: publicReferenceUrl(c.publicSourceUrl) } : {}),
  })) as Citation[];
}

export type AuthedRequest = Request & { scholarlyUserId?: string };

export function rateLimit(limit: number, windowMs: number) {
  const entries = new Map<string, { start: number; count: number }>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = getAuth(req).userId || req.ip || "unknown";
    const now = Date.now();
    const entry = entries.get(key);
    if (!entry || now - entry.start >= windowMs) {
      entries.set(key, { start: now, count: 1 });
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
  req.scholarlyUserId = userId;
  next();
}

export function sameOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.get("origin");
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  const protocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
  if (!origin || !host) {
    res.status(403).json({ error: "A same-origin request is required" });
    return;
  }
  try {
    const parsed = new URL(origin);
    if (parsed.host.toLowerCase() !== host.toLowerCase() ||
        parsed.protocol.replace(":", "").toLowerCase() !== protocol.toLowerCase()) {
      res.status(403).json({ error: "Cross-origin state changes are not allowed" });
      return;
    }
  } catch {
    res.status(403).json({ error: "Invalid request origin" });
    return;
  }
  next();
}

export function hasOnlyKeys(value: unknown, keys: string[]): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.includes(key));
}

export async function getProfile(userId: string) {
  const [profile] = await db.select().from(profilesTable)
    .where(eq(profilesTable.clerkId, userId)).limit(1);
  return profile;
}

export async function getQuestionCitations(questionId: string) {
  const [message] = await db.select({ citations: scholarlyMessagesTable.citations })
    .from(scholarlyMessagesTable)
    .where(and(
      eq(scholarlyMessagesTable.questionId, questionId),
      eq(scholarlyMessagesTable.role, "assistant"),
    )).limit(1);
  return publicCitations(message?.citations ?? []);
}

async function ensureProfile(userId: string): Promise<void> {
  await db.insert(profilesTable)
    .values({ clerkId: userId, name: "", role: "student", onboarded: false })
    .onConflictDoNothing({ target: profilesTable.clerkId });
}

export async function requireStudent(req: AuthedRequest, res: Response): Promise<boolean> {
  const profile = await getProfile(req.scholarlyUserId!);
  if (!profile?.onboarded || profile.role !== "student") {
    res.status(403).json({ error: "This operation requires an onboarded student profile" });
    return false;
  }
  return true;
}

export async function requireApprovedTeacher(
  userId: string,
  res: Response,
  requireAvailable = false,
): Promise<boolean> {
  const profile = await getProfile(userId);
  const [application] = await db.select().from(teacherApplicationsTable)
    .where(eq(teacherApplicationsTable.userId, userId)).limit(1);
  if (profile?.role !== "teacher" || application?.status !== "approved" ||
      (requireAvailable && !application.available)) {
    res.status(403).json({
      error: requireAvailable
        ? "An approved and available teacher is required"
        : "An approved teacher profile is required",
    });
    return false;
  }
  return true;
}

export async function requireAdmin(req: AuthedRequest, res: Response): Promise<boolean> {
  try {
    const access = await getReviewAccess(req);
    if (!access.verifiedEmail) {
      res.status(403).json({ error: "A verified email is required for administrative review" });
      return false;
    }
    if (!access.contentReviewer) {
      res.status(403).json({ error: "Content-review permission is required" });
      return false;
    }
    await ensureProfile(req.scholarlyUserId!);
    return true;
  } catch (error) {
    req.log.warn({ errorType: error instanceof Error ? error.name : "UnknownError" },
      "Unable to verify scholarly administrator metadata");
    res.status(503).json({ error: "Administrative authorization could not be verified" });
    return false;
  }
}