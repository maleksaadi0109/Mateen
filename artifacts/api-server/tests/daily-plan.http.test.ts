import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import { eq } from "drizzle-orm";
import { db, pool, profilesTable, dailyPlansTable, learningStagesTable, scheduledReviewsTable, wordPracticesTable,
  studyActivityDaysTable, studyActivitySettingsTable } from "@workspace/db";
import { GetDailyPlanResponse, type DailyPlan } from "@workspace/api-zod";
import router from "../src/routes/daily-plan";
import assessmentRouter from "../src/routes/assessments";
import { practiceReference } from "../src/lib/word-practice-policy";
import * as sourceModule from "../src/lib/source-review";
import { tuhfaText } from "../src/data/tuhfa";

// Only the runner's source-boundary double exposes these test controls.
const source = sourceModule as unknown as { changeSource(s: string): void; failSource(v: boolean): void };
const app = express();
app.use(express.json());
app.use((req, _res, next) => { Object.assign(req, { log: { error() {} } }); next(); });
app.use("/api", router, assessmentRouter);
const server = app.listen(0, "127.0.0.1");
let url: string;
before(async () => {
  await new Promise<void>(resolve => server.listening ? resolve() : server.once("listening", resolve));
  const a = server.address(); assert.ok(a && typeof a !== "string"); url = `http://127.0.0.1:${a.port}`;
});
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });
const prefs = (goal: "memorize" | "review" | "both" = "both", dailyMinutes: 10 | 15 | 30 | 45 | 60 = 15) =>
  ({ age: null, memorized: "إجابة ذاتية ليست إتقاناً", goal, dailyMinutes });
async function student(preferences: ReturnType<typeof prefs> | null = prefs()) {
  const id = randomUUID();
  await db.insert(profilesTable).values({ clerkId: id, name: "طالب", onboarded: true, learningPreferences: preferences });
  return id;
}
const call = (user: string | null, path = "?timezone=Asia/Riyadh", body?: unknown, origin = url) =>
  fetch(`${url}/api/mateen/daily-plan${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { ...(user ? { "x-test-user": user } : {}), Origin: origin, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
async function plan(user: string, path?: string) {
  const r = await call(user, path); assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  return GetDailyPlanResponse.parse(await r.json());
}
async function act(user: string, p: DailyPlan, id: string, action = "start") {
  return call(user, `/${p.id}/tasks/${id}`, { action });
}
async function review(userId: string, daysAgo = 1, legacy = false) {
  const id = randomUUID();
  await db.insert(scheduledReviewsTable).values({ id, userId, hadithNumber: 1, passageKey: id,
    sourceVersion: "reviewed", windowStartWord: 0, passagePrompt: legacy ? null : "اكتب من حفظك",
    referenceText: legacy ? null : "كلمة أولى ثانية نهاية", sourceMistake: "خطأ مؤكد",
    dueAt: new Date(Date.now() - daysAgo * 86400000) });
  return id;
}
async function practice(userId: string) {
  const id = randomUUID(), ref = practiceReference({ id: 1, title: "test", text: "كلمة أولى ثانية نهاية" });
  await db.insert(wordPracticesTable).values({ id, userId, requestId: randomUUID(),
    selection: { reference: ref, start: 0, end: 4, targets: [1], initialAttempts: [] }, attempts: [] });
  return id;
}
test("missing preferences/calendar are explicit; auth, owner, origin and strict fields", async () => {
  assert.equal((await call(null)).status, 401);
  const user = await student(null), other = await student();
  assert.equal((await call(other, "?timezone=UTC", undefined, "https://evil.invalid")).status, 403);
  assert.equal((await plan(user)).status, "needs_preferences");
  assert.equal((await plan(other, "")).status, "needs_calendar");
  assert.equal((await db.select().from(dailyPlansTable).where(eq(dailyPlansTable.userId, user))).length, 0);
  const teacher = randomUUID();
  await db.insert(profilesTable).values({ clerkId: teacher, role: "teacher", onboarded: true });
  assert.equal((await call(teacher)).status, 403);
  const p = await plan(other);
  assert.equal((await act(user, p, p.tasks[0].id)).status, 404);
  assert.equal((await call(other, `?planId=${p.id}`)).status, 200);
  assert.equal((await call(user, `?planId=${p.id}`)).status, 404);
  assert.equal((await call(other, `/${p.id}/tasks/${p.tasks[0].id}`, { action: "start", userId: user })).status, 400);
  assert.equal((await call(other, `/${p.id}/tasks/${p.tasks[0].id}`, { action: "start" }, "https://evil.invalid")).status, 403);
});
test("concurrent devices generate one plan, fixed calendar and no activity/grades/role changes", async () => {
  const user = await student();
  const batch = await Promise.all(Array.from({ length: 8 }, () => plan(user)));
  assert.equal(new Set(batch.map(p => p.id)).size, 1);
  const p = batch[0], task = p.tasks[0];
  assert.equal((await plan(user, "?timezone=Pacific/Honolulu")).timezone, "Asia/Riyadh");
  const starts = await Promise.all([act(user, p, task.id), act(user, p, task.id)]);
  assert.deepEqual(await starts[0].json(), await starts[1].json());
  const acks = await Promise.all([act(user, p, task.id, "acknowledge"), act(user, p, task.id, "acknowledge")]);
  assert.deepEqual(await acks[0].json(), await acks[1].json());
  assert.equal((await plan(user)).tasks[0].status, "completed");
  assert.equal((await db.select().from(studyActivityDaysTable).where(eq(studyActivityDaysTable.userId, user))).length, 0);
  assert.equal((await db.select().from(learningStagesTable).where(eq(learningStagesTable.userId, user))).length, 0);
  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.clerkId, user));
  assert.equal(profile.role, "student"); assert.deepEqual(profile.learningPreferences, prefs());
});
test("review-only excludes new learning; backlog bounded and immutable deferred reviews remain", async () => {
  const user = await student(prefs("review", 60));
  for (let i = 0; i < 9; i++) await review(user, 90 - i);
  await practice(user);
  const p = await plan(user);
  assert.ok(p.tasks.every(t => t.kind !== "new_learning"));
  assert.equal(p.tasks.filter(t => t.kind === "confirmed_review").length, 2);
  assert.equal(p.tasks.filter(t => t.kind === "word_practice").length, 1);
  assert.equal((await db.select().from(scheduledReviewsTable).where(eq(scheduledReviewsTable.userId, user))).length, 9);
  assert.equal(p.deferredCount, 7);
  const t = p.tasks[0];
  assert.equal((await act(user, p, t.id)).status, 200);
  assert.equal((await act(user, p, t.id, "acknowledge")).status, 409);
});
test("real review answer path completes task regardless of correctness; replay is unchanged", async () => {
  const user = await student(prefs("review", 10)), id = await review(user);
  let p = await plan(user);
  assert.equal((await act(user, p, p.tasks[0].id)).status, 200);
  const answer = { writtenAnswer: "إجابة مختلفة", mutationId: randomUUID() };
  const submit = () => fetch(`${url}/api/mateen/assessment/reviews/${id}/complete`, { method: "POST",
    headers: { "x-test-user": user, Origin: url, "Content-Type": "application/json" }, body: JSON.stringify(answer) });
  const r = await submit(); assert.equal(r.status, 200);
  assert.equal((await r.json() as { correctness: boolean }).correctness, false);
  p = await plan(user); assert.equal(p.tasks[0].status, "completed");
  const revision = p.revision; assert.equal((await submit()).status, 200);
  assert.equal((await plan(user)).revision, revision);
});
test("explicit redistribution keeps completed and started tasks, rejects stale revisions", async () => {
  const user = await student(prefs("both", 30));
  await review(user); await practice(user);
  let p = await plan(user);
  const word = p.tasks.find(t => t.kind === "word_practice")!;
  assert.equal((await act(user, p, word.id)).status, 200);
  assert.equal((await act(user, p, word.id, "acknowledge")).status, 200);
  const learning = p.tasks.find(t => t.kind === "new_learning")!;
  assert.equal((await act(user, p, learning.id)).status, 200);
  p = await plan(user);
  await db.update(profilesTable).set({ learningPreferences: prefs("review", 10) }).where(eq(profilesTable.clerkId, user));
  assert.equal((await plan(user)).preferencesChanged, true);
  assert.equal((await act(user, p, p.tasks.find(t => t.status === "pending")!.id)).status, 409);
  const concurrent = await Promise.all([call(user, "", { planId: p.id, revision: p.revision }), call(user, "", { planId: p.id, revision: p.revision })]);
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
  const updated = await plan(user);
  assert.equal(updated.tasks.find(t => t.id === word.id)?.status, "completed");
  assert.equal(updated.tasks.find(t => t.id === learning.id)?.status, "started");
  assert.ok(updated.tasks.reduce((n, t) => n + t.minutes, 0) <= 10);
});
test("stale/deleted practice and changed text cannot be acknowledged, old reviews are explicit", async () => {
  const user = await student(); const id = await practice(user); await review(user, 1, true);
  const p = await plan(user); assert.equal(p.staleCount, 1);
  const t = p.tasks.find(t => t.kind === "word_practice")!;
  assert.equal((await act(user, p, t.id)).status, 200);
  source.changeSource("نص جديد");
  try {
    const changed = await plan(user);
    assert.equal(changed.tasks.find(x => x.id === t.id)?.status, "unavailable");
    assert.equal((await act(user, p, t.id, "acknowledge")).status, 409);
  } finally { source.changeSource("كلمة أولى ثانية نهاية"); }
  await db.delete(wordPracticesTable).where(eq(wordPracticesTable.id, id));
  assert.equal((await act(user, p, t.id)).status, 409);
});
test("reducing below already committed estimates keeps history but proposes no additional work", async () => {
  const user = await student(prefs("both", 30));
  await review(user); await practice(user);
  let p = await plan(user);
  for (const t of p.tasks) await act(user, p, t.id);
  p = await plan(user);
  assert.equal(p.tasks.reduce((n, t) => n + t.minutes, 0), 15);
  await db.update(profilesTable).set({ learningPreferences: prefs("both", 10) }).where(eq(profilesTable.clerkId, user));
  const r = await call(user, "", { planId: p.id, revision: p.revision });
  const next = GetDailyPlanResponse.parse(await r.json());
  assert.equal(next.committedOverBudget, true);
  assert.deepEqual(next.tasks.map(t => t.id), p.tasks.map(t => t.id));
  assert.ok(next.tasks.every(t => t.status === "started"));
  assert.equal(next.tasks.filter(t => t.status === "pending").length, 0);
});
test("input service failure is 503, never a misleading empty plan", async () => {
  const user = await student(); const p = await plan(user);
  source.failSource(true);
  try { assert.equal((await call(user)).status, 503); }
  finally { source.failSource(false); }
  assert.equal((await plan(user)).id, p.id);
});
test("original-day started task can finish after midnight without completing new day", async () => {
  const user = await student(); let p = await plan(user); const t = p.tasks[0];
  await act(user, p, t.id);
  await db.update(dailyPlansTable).set({ day: "2026-01-01" }).where(eq(dailyPlansTable.id, p.id!));
  assert.equal((await act(user, p, t.id)).status, 409);
  const today = await plan(user);
  assert.notEqual(today.id, p.id);
  const done = await act(user, p, t.id, "acknowledge"); assert.equal(done.status, 200);
  p = GetDailyPlanResponse.parse(await done.json());
  assert.equal(p.status, "expired"); assert.equal(p.day, "2026-01-01");
  assert.equal(p.tasks.find(x => x.id === t.id)?.status, "completed");
  assert.ok((await plan(user)).tasks.every(x => x.status === "pending"));
  assert.equal((await db.select().from(studyActivityDaysTable).where(eq(studyActivityDaysTable.userId, user))).length, 0);
});
test("review across midnight completes only the original started task, not duplicate today", async () => {
  const user = await student(prefs("review", 10)); const id = await review(user);
  const old = await plan(user); await act(user, old, old.tasks[0].id);
  await db.update(dailyPlansTable).set({ day: "2026-01-02" }).where(eq(dailyPlansTable.id, old.id!));
  const current = await plan(user); assert.notEqual(current.id, old.id);
  const answer = { writtenAnswer: "كلمة أولى ثانية نهاية", mutationId: randomUUID() };
  const r = await fetch(`${url}/api/mateen/assessment/reviews/${id}/complete`, { method: "POST",
    headers: { "x-test-user": user, Origin: url, "Content-Type": "application/json" }, body: JSON.stringify(answer) });
  assert.equal(r.status, 200);
  assert.equal((await plan(user, `?planId=${old.id}`)).tasks[0].status, "completed");
  assert.equal((await plan(user)).tasks[0].status, "unavailable");
});
test("learning uses contiguous real passes and complete legacy Tuhfa chapters, never locked books", async () => {
  const user = await student(prefs("memorize", 60));
  await db.insert(learningStagesTable).values({ userId: user, textId: "nawawi", stageNumber: 2, bestPercent: 99, passedAt: new Date() });
  const p = await plan(user);
  const learning = p.tasks.find(t => t.kind === "new_learning")!;
  assert.equal(learning.href, "/student/learn/nawawi/1");
  assert.ok(p.tasks.every(t => !/qawaid|nawaqid/.test(t.href)));
  assert.equal(p.tasks.length, 1);
  await db.update(profilesTable).set({ learningPreferences: prefs("review", 10) }).where(eq(profilesTable.clerkId, user));
  const r = await call(user, "", { planId: p.id, revision: p.revision });
  const next = GetDailyPlanResponse.parse(await r.json()); assert.equal(next.status, "empty");
});
test("legacy Tuhfa verse passes open the next chapter only when the entire chapter passed", async () => {
  const user = await student(prefs("memorize", 60));
  await db.insert(learningStagesTable).values(Array.from({ length: 42 }, (_, i) => ({
    userId: user, textId: "nawawi", stageNumber: i + 1, bestPercent: 99, passedAt: new Date(),
  })));
  const verses = tuhfaText.chapters[0].verses;
  await db.insert(learningStagesTable).values(verses.slice(0, -1).map(v => ({
    userId: user, textId: "tuhfa", stageNumber: v.number, bestPercent: 99, passedAt: new Date(),
  })));
  let p = await plan(user);
  assert.equal(p.tasks[0].href, "/student/learn/tuhfa/1");
  await db.insert(learningStagesTable).values({
    userId: user, textId: "tuhfa", stageNumber: verses.at(-1)!.number, bestPercent: 99, passedAt: new Date(),
  });
  const response = await call(user, "", { planId: p.id, revision: p.revision });
  p = GetDailyPlanResponse.parse(await response.json());
  assert.equal(p.tasks[0].href, "/student/learn/tuhfa/2");
});
