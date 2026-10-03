import type { NextFunction, Request, Response } from "express";

export type AuthedRequest = Request & { mateenUserId?: string };

export function authenticationRequired(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
): void {
  // Only the disposable HTTP harness uses this identity seam.
  req.mateenUserId = req.get("x-test-user") ?? "assessment-audio-test-owner";
  next();
}

export function mutationOriginProtection(
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  next();
}

export function rateLimit() {
  return (_req: Request, _res: Response, next: NextFunction) => next();
}

export async function requireProfile() {
  return {
    clerkId: "assessment-audio-test-owner",
    role: "student" as const,
    onboarded: true,
  };
}