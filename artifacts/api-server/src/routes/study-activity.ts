import { randomUUID } from "node:crypto";
import { Router } from "express";
import { and, eq, lt } from "drizzle-orm";
import { db, profilesTable, studyActivityDaysTable as days, studyActivitySettingsTable as settings, studyActivitySessionsTable as sessions } from "@workspace/db";
import { GetStudyActivityResponse, StartStudyActivityBody, StartStudyActivityResponse, FinishStudyActivityBody, FinishStudyActivityParams, FinishStudyActivityResponse } from "@workspace/api-zod";
import { authenticationRequired, mutationOriginProtection, rateLimit, requireProfile, type AuthedRequest } from "../lib/mateen-auth";
import { activitySummary, canonicalTimezone, qualifiesActivity, SESSION_TTL_MS, studyDay } from "../lib/study-activity-policy";

const router = Router();
const path = "/mateen/study-activity";
async function summary(userId: string) {
  const [setting] = await db.select().from(settings).where(eq(settings.userId, userId));
  const records = await db.select({ day: days.day }).from(days).where(eq(days.userId, userId));
  return activitySummary(records.map(r => r.day), setting?.timezone ?? null);
}
router.get(path, authenticationRequired, async (req: AuthedRequest, res): Promise<void> => {
  if (!await requireProfile(req, res, "student")) return;
  res.set("Cache-Control", "no-store").json(GetStudyActivityResponse.parse(await summary(req.mateenUserId!)));
});
router.post(`${path}/sessions`, authenticationRequired, mutationOriginProtection, rateLimit(240, 3600_000),
  async (req: AuthedRequest, res): Promise<void> => {
    if (!await requireProfile(req, res, "student")) return;
    const parsed = StartStudyActivityBody.strict().safeParse(req.body);
    const timezone = parsed.success ? canonicalTimezone(parsed.data.timezone) : null;
    if (!parsed.success || !timezone) { res.status(400).json({ error: "Invalid study session or timezone" }); return; }
    const input = parsed.data, userId = req.mateenUserId!;
    const result = await db.transaction(async tx => {
      // A profile lock serializes first-time timezone selection across devices.
      // Preserve FK key-share access while serializing timezone initialization.
      await tx.select().from(profilesTable).where(eq(profilesTable.clerkId, userId)).for("no key update");
      await tx.insert(settings).values({ userId, timezone }).onConflictDoNothing();
      const [setting] = await tx.select().from(settings).where(eq(settings.userId, userId));
      const now = new Date();
      // Bounded transient storage; deleted session IDs cannot finish again.
      await tx.delete(sessions).where(lt(sessions.startedAt, new Date(now.getTime() - SESSION_TTL_MS)));
      const [old] = await tx.select().from(sessions).where(and(eq(sessions.userId, userId), eq(sessions.requestId, input.requestId)));
      if (old && (old.kind !== input.kind || old.page !== input.page)) return null;
      const session = old ?? (await tx.insert(sessions).values({
        id: randomUUID(), userId, requestId: input.requestId, kind: input.kind, page: input.page, startedAt: now,
      }).returning())[0];
      return { id: session.id, timezone: setting.timezone };
    });
    if (!result) { res.status(409).json({ error: "Conflicting session request" }); return; }
    res.status(201).json(StartStudyActivityResponse.parse(result));
  });
router.post(`${path}/sessions/:sessionId/finish`, authenticationRequired, mutationOriginProtection, rateLimit(240, 3600_000),
  async (req: AuthedRequest, res): Promise<void> => {
    if (!await requireProfile(req, res, "student")) return;
    const params = FinishStudyActivityParams.safeParse(req.params);
    const body = FinishStudyActivityBody.strict().safeParse(req.body);
    if (!params.success || !body.success) { res.status(400).json({ error: "Invalid activity evidence" }); return; }
    const userId = req.mateenUserId!;
    const status = await db.transaction(async tx => {
      const [session] = await tx.select().from(sessions).where(and(eq(sessions.id, params.data.sessionId), eq(sessions.userId, userId))).for("update");
      if (!session) return 404;
      // A replay after midnight must not mint a second day.
      if (session.completedDay) return 200;
      const now = new Date();
      if (!qualifiesActivity(session, body.data, now)) return 409;
      const [setting] = await tx.select().from(settings).where(eq(settings.userId, userId));
      const day = studyDay(now, setting.timezone);
      await tx.insert(days).values({ userId, day }).onConflictDoNothing();
      await tx.update(sessions).set({ completedDay: day }).where(eq(sessions.id, session.id));
      return 200;
    });
    if (status !== 200) { res.status(status).json({ error: status === 404 ? "Study session not found" : "Activity threshold not met or session expired" }); return; }
    res.set("Cache-Control", "no-store").json(FinishStudyActivityResponse.parse(await summary(userId)));
  });
export default router;