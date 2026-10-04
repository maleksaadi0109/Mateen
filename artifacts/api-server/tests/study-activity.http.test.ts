import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import { db, pool, profilesTable, studyActivitySessionsTable as sessions, studyActivityDaysTable as days } from "@workspace/db";
import { eq } from "drizzle-orm";
import router from "../src/routes/study-activity";
import reports from "../src/routes/practice-reports";
import { GetStudyActivityResponse, StartStudyActivityResponse } from "@workspace/api-zod";
import { studyDay } from "../src/lib/study-activity-policy";

const app = express();
app.use(express.json({ limit: "64kb" }));
app.use("/api", router, reports);
const server = app.listen(0, "127.0.0.1");
let url: string;
before(async () => {
  await new Promise<void>(resolve => server.listening ? resolve() : server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string"); url = `http://127.0.0.1:${address.port}`;
  await db.insert(profilesTable).values([
    { clerkId: "learner", onboarded: true }, { clerkId: "other", onboarded: true },
    { clerkId: "reports-only", onboarded: true },
    { clerkId: "teacher", role: "teacher", onboarded: true },
  ]);
});
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });
const call = (path: string, user: string | null = "learner", body?: unknown, origin = url) => fetch(`${url}/api/mateen/study-activity${path}`, {
  method: body === undefined ? "GET" : "POST",
  headers: { ...(user ? { "x-test-user": user } : {}), Origin: origin, "Content-Type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const startBody = () => ({ requestId: randomUUID(), timezone: "Asia/Riyadh", kind: "reading", page: 1 });
const evidence = { page: 2, activeSeconds: 30, spokenWords: 0 };
const finish = (id: string) => `/sessions/${id}/finish`;
const start = async (user = "learner", body = startBody()) => {
  const response = await call("/sessions", user, body);
  assert.equal(response.status, 201);
  return StartStudyActivityResponse.parse(await response.json());
};
const summary = async (user = "learner") => {
  const response = await call("", user);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return GetStudyActivityResponse.parse(await response.json());
};
const age = (id: string, ms = 31_000) => db.update(sessions).set({ startedAt: new Date(Date.now() - ms) }).where(eq(sessions.id, id));

test("authentication, role, origin, ownership and strict server-owned fields", async () => {
  assert.equal((await call("", null)).status, 401);
  assert.equal((await call("", "teacher")).status, 403);
  assert.equal((await call("/sessions", null, startBody())).status, 401);
  assert.equal((await call("/sessions", "learner", startBody(), "https://evil.invalid")).status, 403);
  for (const body of [
    { ...startBody(), userId: "other" }, { ...startBody(), startedAt: "2020-01-01" },
    { ...startBody(), day: "2020-01-01" }, { ...startBody(), timezone: "bad/timezone" },
    { ...startBody(), page: 1.5 },
  ]) assert.equal((await call("/sessions", "learner", body)).status, 400);
  const session = await start();
  assert.equal((await call(finish(session.id), "other", evidence)).status, 404);
  assert.equal((await call(finish(session.id), "learner", { ...evidence, userId: "other" })).status, 400);
  assert.equal((await call(finish(session.id), "learner", { ...evidence, transcript: "sensitive" })).status, 400);
  assert.equal((await summary("other")).timezone, null);
  assert.equal((await summary()).activeDays, 0); // Merely opening is not activity.
});

test("idempotent starts, fixed timezone, server timing, concurrent daily dedup and account isolation", async () => {
  const body = startBody();
  const [a, duplicate] = await Promise.all([start("learner", body), start("learner", body)]);
  assert.equal(a.id, duplicate.id);
  assert.equal((await call("/sessions", "learner", { ...body, page: 2 })).status, 409);
  const b = await start("learner", { ...startBody(), timezone: "America/New_York" });
  assert.equal(b.timezone, "Asia/Riyadh");
  assert.equal((await call(finish(a.id), "learner", evidence)).status, 409); // server elapsed
  await age(a.id); await age(b.id);
  assert.equal((await call(finish(a.id), "learner", { ...evidence, page: 1 })).status, 409);
  assert.equal((await call(finish(a.id), "learner", { ...evidence, activeSeconds: 29 })).status, 409);
  const results = await Promise.all([a.id, a.id, b.id].map(id => call(finish(id), "learner", evidence)));
  assert.deepEqual(results.map(r => r.status), [200, 200, 200]);
  const read = await summary();
  assert.equal(read.activeDays, 1); assert.equal(read.currentStreak, 1); assert.equal(read.studiedToday, true);
  assert.equal(read.lastStudyDay, studyDay(new Date(), "Asia/Riyadh"));
  assert.equal((await summary("other")).activeDays, 0);
});

test("expired sessions fail; recitation requires actual word evidence but not a match score", async () => {
  const expired = await start("other");
  await age(expired.id, 7200001);
  assert.equal((await call(finish(expired.id), "other", evidence)).status, 409);
  const a = await start("other", { ...startBody(), kind: "recitation" });
  await age(a.id, 6000);
  assert.equal((await call(finish(a.id), "other", { page: 1, activeSeconds: 5, spokenWords: 0 })).status, 409);
  assert.equal((await call(finish(a.id), "other", { page: 1, activeSeconds: 5, spokenWords: 4 })).status, 409);
  assert.equal((await call(finish(a.id), "other", { page: 1, activeSeconds: 5, spokenWords: 5 })).status, 200);
  assert.equal((await summary("other")).activeDays, 1);
});

test("retrying a completed session from yesterday cannot manufacture today's activity", async () => {
  const a = await start();
  const yesterday = studyDay(new Date(Date.now() - 86400000), "Asia/Riyadh");
  await db.delete(days).where(eq(days.userId, "learner"));
  await db.insert(days).values({ userId: "learner", day: yesterday });
  await db.update(sessions).set({ completedDay: yesterday }).where(eq(sessions.id, a.id));
  assert.equal((await call(finish(a.id), "learner", evidence)).status, 200);
  const read = await summary();
  assert.equal(read.activeDays, 1); assert.equal(read.studiedToday, false); assert.equal(read.currentStreak, 1);
  const fresh = await start();
  await age(fresh.id);
  assert.equal((await call(finish(fresh.id), "learner", evidence)).status, 200);
  assert.equal((await summary()).currentStreak, 2);
});

test("importing and deleting report snapshots neither creates nor erases historical activity", async () => {
  const reportInput = {
    attemptId: "imported-snapshot", consent: true, complete: true, matched: 2, attempted: 2,
    analyses: [{ id: 1, number: 1, title: "تجربة", start: 0, end: 2, totalWords: 2, matched: 2,
      substitutions: 0, omissions: 0, extras: 0, attempted: 2, heard: 2, covered: 2, successPercent: 100, differencePercent: 0 }],
    issues: [],
  };
  for (const user of ["reports-only", "learner"]) {
    const before = await summary(user);
    const reportCall = (suffix: string, method: string, body?: unknown) => fetch(`${url}/api/mateen/practice-reports${suffix}`, {
      method, headers: { "x-test-user": user, Origin: url, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const saved = await reportCall("", "POST", reportInput);
    assert.equal(saved.status, 201);
    const report = await saved.json() as { id: string };
    assert.deepEqual(await summary(user), before);
    assert.equal((await reportCall(`/${report.id}`, "DELETE")).status, 204);
    assert.deepEqual(await summary(user), before);
  }
});