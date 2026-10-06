import { randomUUID } from "node:crypto";
import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, dailyPlansTable as plans, profilesTable, studyActivitySettingsTable as settings, type DailyPlanRecord } from "@workspace/db";
import { GetDailyPlanResponse, RedistributeDailyPlanBody, ActOnDailyPlanTaskBody, type DailyPlanTask } from "@workspace/api-zod";
import { z } from "zod/v4";
import { authenticationRequired, mutationOriginProtection, rateLimit, requireProfile, type AuthedRequest } from "../lib/mateen-auth";
import { canonicalTimezone, studyDay } from "../lib/study-activity-policy";
import { distribute } from "../lib/daily-plan-policy";
import { dailySources } from "../lib/daily-plan-sources";

const router = Router(), path = "/mateen/daily-plan";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Preferences = NonNullable<typeof profilesTable.$inferSelect.learningPreferences>;
type Sources = Awaited<ReturnType<typeof dailySources>>;
const tasksOf = (p: DailyPlanRecord) => p.tasks as DailyPlanTask[];
const owned = (user: string, id: string) => and(eq(plans.userId, user), eq(plans.id, id));
const decorate = (p: DailyPlanRecord | null, prefs: Preferences | null, timezone: string | null, now: Date, sources?: Sources) => {
  const today = timezone ? studyDay(now, timezone) : null;
  const tasks = p ? tasksOf(p) : [];
  return GetDailyPlanResponse.parse({
    id: p?.id ?? null, day: p?.day ?? today, today, timezone, revision: p?.revision ?? 0,
    status: p && p.day !== today ? "expired" : !prefs ? "needs_preferences" : !timezone ? "needs_calendar" :
      tasks.length === 0 ? "empty" : tasks.every(t => t.status === "completed") ? "completed" : "ready",
    dailyMinutes: p?.dailyMinutes ?? prefs?.dailyMinutes ?? 0, goal: p?.goal ?? prefs?.goal ?? null,
    preferencesChanged: !!p && (!prefs || p.dailyMinutes !== prefs.dailyMinutes || p.goal !== prefs.goal),
    committedOverBudget: !!p && tasks.filter(t => ["completed", "started"].includes(t.status)).reduce((n, t) => n + t.minutes, 0) > p.dailyMinutes,
    deferredCount: sources ? sources.candidates.filter(c => (prefs?.goal !== "review" || c.kind !== "new_learning") &&
      !tasks.some(t => t.sourceKey === c.sourceKey)).length : 0,
    staleCount: sources?.staleCount ?? 0, tasks,
  });
};
function reconcile(p: DailyPlanRecord, sources: Sources) {
  return tasksOf(p).map(t => {
    if (t.status === "completed") return t;
    const valid = sources.available.some(c => c.sourceKey === t.sourceKey && c.sourceHash === t.sourceHash);
    return valid ? t : { ...t, status: "unavailable" as const };
  });
}
async function persistReconciliation(tx: Tx, p: DailyPlanRecord, sources: Sources) {
  const tasks = reconcile(p, sources);
  if (JSON.stringify(tasks) === JSON.stringify(p.tasks)) return p;
  return (await tx.update(plans).set({ tasks, revision: p.revision + 1 }).where(eq(plans.id, p.id)).returning())[0];
}
function freshTasks(sources: Sources, prefs: Preferences, retained: DailyPlanTask[] = []) {
  return [...retained, ...distribute(sources.candidates, prefs.goal, prefs.dailyMinutes, retained).map(({ candidate, minutes }) => ({
    ...candidate, minutes, id: randomUUID(), status: "pending" as const, startedAt: null, completedAt: null,
  }))];
}
router.use(path, authenticationRequired, async (req: AuthedRequest, res, next) => {
  res.set("Cache-Control", "no-store");
  if (await requireProfile(req, res, "student")) next();
});
// GET may create today's snapshot and initialize a previously absent calendar.
// Browser fetch metadata prevents cross-site navigation from choosing that calendar.
router.get(path, (req, res, next) => {
  if (req.get("sec-fetch-site") === "same-origin") next();
  else mutationOriginProtection(req, res, next);
}, async (req: AuthedRequest, res) => {
  const timezone = typeof req.query.timezone === "string" ? canonicalTimezone(req.query.timezone) : null;
  const requestedId = req.query.planId;
  if (requestedId && !z.uuid().safeParse(requestedId).success) { res.status(400).json({ error: "Invalid plan" }); return; }
  try {
    const result = await db.transaction(async tx => {
      const [profile] = await tx.select().from(profilesTable).where(eq(profilesTable.clerkId, req.mateenUserId!)).for("no key update");
      let [setting] = await tx.select().from(settings).where(eq(settings.userId, profile.clerkId));
      if (!setting && timezone && !requestedId) {
        await tx.insert(settings).values({ userId: profile.clerkId, timezone }).onConflictDoNothing();
        [setting] = await tx.select().from(settings).where(eq(settings.userId, profile.clerkId));
      }
      const now = new Date(), prefs = profile.learningPreferences;
      if (!setting) return decorate(null, prefs, null, now);
      const [old] = await tx.select().from(plans).where(requestedId ? owned(profile.clerkId, String(requestedId)) :
        and(eq(plans.userId, profile.clerkId), eq(plans.day, studyDay(now, setting.timezone))));
      if (requestedId && !old) return null;
      if (!prefs && !old) return decorate(null, null, setting.timezone, now);
      const sources = await dailySources(tx, profile.clerkId, now);
      const p = old ? await persistReconciliation(tx, old, sources) : (await tx.insert(plans).values({
        id: randomUUID(), userId: profile.clerkId, day: studyDay(now, setting.timezone), timezone: setting.timezone,
        dailyMinutes: prefs!.dailyMinutes, goal: prefs!.goal, tasks: freshTasks(sources, prefs!),
      }).returning())[0];
      return decorate(p, prefs, setting.timezone, now, sources);
    });
    if (!result) { res.status(404).json({ error: "Plan not found" }); return; }
    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Daily plan inputs unavailable");
    res.status(503).json({ error: "تعذّر تحميل مدخلات برنامج اليوم؛ خطتك محفوظة، أعد المحاولة." });
  }
});
router.post(path, mutationOriginProtection, rateLimit(60, 60_000), async (req: AuthedRequest, res) => {
  const input = RedistributeDailyPlanBody.strict().safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Invalid redistribution" }); return; }
  const result = await db.transaction(async tx => {
    const [profile] = await tx.select().from(profilesTable).where(eq(profilesTable.clerkId, req.mateenUserId!)).for("no key update");
    const [p] = await tx.select().from(plans).where(owned(profile.clerkId, input.data.planId));
    if (!p) return { status: 404 };
    const now = new Date(), prefs = profile.learningPreferences;
    if (!prefs || studyDay(now, p.timezone) !== p.day || input.data.revision !== p.revision) return { status: 409 };
    const sources = await dailySources(tx, profile.clerkId, now);
    const retained = reconcile(p, sources).filter(t => ["completed", "started"].includes(t.status));
    const [updated] = await tx.update(plans).set({ goal: prefs.goal, dailyMinutes: prefs.dailyMinutes,
      tasks: freshTasks(sources, prefs, retained), revision: p.revision + 1 }).where(eq(plans.id, p.id)).returning();
    return { data: decorate(updated, prefs, p.timezone, now, sources) };
  });
  if (!result.data) { res.status(result.status!).json({ error: "الخطة تغيّرت أو انتهى يومها؛ حدّثها قبل إعادة التوزيع." }); return; }
  res.json(result.data);
});
router.post(`${path}/:planId/tasks/:taskId`, mutationOriginProtection, rateLimit(120, 60_000), async (req: AuthedRequest, res) => {
  const input = ActOnDailyPlanTaskBody.strict().safeParse(req.body);
  if (!input.success || !z.uuid().safeParse(req.params.planId).success || !z.uuid().safeParse(req.params.taskId).success) {
    res.status(400).json({ error: "Invalid task action" }); return;
  }
  const result = await db.transaction(async tx => {
    const [profile] = await tx.select().from(profilesTable).where(eq(profilesTable.clerkId, req.mateenUserId!)).for("no key update");
    const [old] = await tx.select().from(plans).where(owned(profile.clerkId, String(req.params.planId)));
    if (!old) return { status: 404 };
    const now = new Date(), sources = await dailySources(tx, profile.clerkId, now);
    const p = await persistReconciliation(tx, old, sources), tasks = structuredClone(tasksOf(p));
    const task = tasks.find(t => t.id === req.params.taskId);
    if (!task) return { status: 404 };
    if (task.status === "completed") return { data: decorate(p, profile.learningPreferences, p.timezone, now, sources) };
    if (task.status === "unavailable") return { status: 409 };
    if (input.data.action === "start") {
      if (studyDay(now, p.timezone) !== p.day || !profile.learningPreferences) return { status: 409 };
      if (task.status === "pending" && (profile.learningPreferences.goal !== p.goal || profile.learningPreferences.dailyMinutes !== p.dailyMinutes)) return { status: 409 };
      if (task.status === "pending") { task.status = "started"; task.startedAt = now.toISOString(); }
    } else {
      if (task.kind === "confirmed_review" || task.status !== "started") return { status: 409 };
      task.status = "completed"; task.completedAt = now.toISOString();
    }
    const changed = JSON.stringify(tasks) !== JSON.stringify(p.tasks);
    if (!changed) return { data: decorate(p, profile.learningPreferences, p.timezone, now, sources) };
    const [updated] = await tx.update(plans).set({ tasks, revision: p.revision + 1 })
      .where(eq(plans.id, p.id)).returning();
    return { data: decorate(updated, profile.learningPreferences, p.timezone, now, sources) };
  });
  if (!result.data) { res.status(result.status!).json({ error: "تعذّر الإجراء: انتهى اليوم أو تغيّر المصدر، أو يلزم مسار المراجعة الأصلي." }); return; }
  res.json(result.data);
});
export default router;
