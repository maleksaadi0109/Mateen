import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import "./stage-threshold.test";
import { after, before, test } from "node:test";
import express from "express";
import { db, pool, profilesTable, stageAttemptsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import router from "../src/routes/learning-stages";
import mateenRouter from "../src/routes/mateen";
import { learningRecords, isStageWord, learningRecord } from "../src/lib/learning-stage-policy";
import { tuhfaText, tuhfaVerses } from "../src/data/tuhfa";
import { StartStageAttemptResponse, FinishStageAttemptResponse, GetLearningMapResponse, GetProfileResponse } from "@workspace/api-zod";

const app = express();
app.use(express.json({ limit: "64kb" }));
app.use("/api", router);
app.use("/api", mateenRouter);
const server = app.listen(0, "127.0.0.1");
let url: string;
before(async () => {
  await new Promise<void>(resolve => server.listening ? resolve() : server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string"); url = `http://127.0.0.1:${address.port}`;
  await db.insert(profilesTable).values([
    { clerkId: "learner", onboarded: true }, { clerkId: "other", onboarded: true },
    { clerkId: "teacher", role: "teacher", onboarded: true },
  ]);
});
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });
const call = (path: string, user: string | null = "learner", body?: unknown, origin = url) => fetch(`${url}/api/mateen/learning${path}`, {
  method: body === undefined ? "GET" : "POST",
  headers: { ...(user ? { "x-test-user": user } : {}), Origin: origin, "Content-Type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const startBody = () => ({ requestId: randomUUID(), consent: true });
const full = (n = 1) => ({ matchedIndices: learningRecords[n - 1].words.flatMap((w, i) => isStageWord(w) ? [i] : []), issues: [] });
const finish = (id: string) => `/attempts/${id}/finish`;
const start = async (user = "learner", n = 1, body = startBody()) =>
  StartStageAttemptResponse.parse(await (await call(`/nawawi/stages/${n}/attempts`, user, body)).json());
const readMap = async (user = "learner") => GetLearningMapResponse.parse(await (await call("/nawawi", user)).json());

test("Tuhfa source contains exactly 61 distinct verses in complete source chapters", () => {
  assert.equal(tuhfaVerses.length, 61);
  assert.deepEqual(tuhfaVerses.map(v => v.number), Array.from({ length: 61 }, (_, i) => i + 1));
  assert.deepEqual(tuhfaText.chapters.map(c => c.verses.length), [5, 11, 1, 6, 6, 5, 7, 6, 10, 4]);
  for (const v of tuhfaVerses) {
    assert.equal(v.text.split("\n").length, 2);
    assert.ok(v.sourcePage >= 2 && v.sourcePage <= 8);
    assert.ok(!/<|>|________|\([٠-٩]+\)/u.test(v.text));
  }
});

test("Tuhfa verse progress is private, source-bound, sequential and isolated from Nawawi", async () => {
  const user = "poem-student";
  await db.insert(profilesTable).values({ clerkId: user, onboarded: true });
  const poemMap = async () => GetLearningMapResponse.parse(await (await call("/tuhfa", user)).json());
  const initial = await poemMap();
  assert.equal(initial.stages.length, 61);
  assert.equal(initial.stages[0].status, "current");
  assert.equal(initial.stages[1].status, "locked");
  assert.equal((await call("/tuhfa", null)).status, 401);
  assert.equal((await call("/tuhfa", "teacher")).status, 403);
  assert.equal((await call("/tuhfa/stages/6/attempts", user, startBody())).status, 403);
  assert.equal((await call("/tuhfa/stages/62/attempts", user, startBody())).status, 400);
  const input = startBody();
  const a = StartStageAttemptResponse.parse(await (await call("/tuhfa/stages/1/attempts", user, input)).json());
  assert.equal(a.sourceHash, learningRecord(tuhfaVerses[0]).hash);
  const replay = StartStageAttemptResponse.parse(await (await call("/tuhfa/stages/1/attempts", user, input)).json());
  assert.equal(replay.id, a.id);
  assert.equal((await call("/nawawi/stages/1/attempts", user, input)).status, 409);
  const verseFull = (n: number) => ({
    matchedIndices: learningRecord(tuhfaVerses[n - 1]).words.flatMap((w, i) => isStageWord(w) ? [i] : []),
    issues: [],
  });
  assert.equal((await call(finish(a.id), "other", verseFull(1))).status, 404);
  const partial = StartStageAttemptResponse.parse(await (await call("/tuhfa/stages/1/attempts", user, startBody())).json());
  await call(finish(partial.id), user, { matchedIndices: [0], issues: [] });
  assert.equal((await poemMap()).stages[1].status, "locked");
  const outcome = FinishStageAttemptResponse.parse(await (await call(finish(a.id), user, verseFull(1))).json());
  assert.equal(outcome.passed, true);
  assert.equal(outcome.nextStage, 2);
  assert.deepEqual(await (await call(finish(a.id), user, verseFull(1))).json(), outcome);
  assert.equal((await poemMap()).stages[0].status, "passed");
  assert.equal((await readMap(user)).stages[0].status, "current");
  // Completing the introduction opens the first verse in the next chapter,
  // not all its verses and never the next Nawawi hadith.
  for (let n = 2; n <= 5; n++) {
    const b = StartStageAttemptResponse.parse(await (await call(`/tuhfa/stages/${n}/attempts`, user, startBody())).json());
    const result = FinishStageAttemptResponse.parse(await (await call(finish(b.id), user, verseFull(n))).json());
    assert.equal(result.passed, true);
  }
  assert.equal((await poemMap()).stages[5].status, "current");
  assert.equal((await poemMap()).stages[6].status, "locked");
  assert.equal((await readMap(user)).stages[1].status, "locked");
});

test("private welcome answers persist, validate strictly, and do not unlock stages", async () => {
  const profileCall = (user: string | null, body?: unknown) => fetch(`${url}/api/mateen/profile`, {
    method: body === undefined ? "GET" : "PUT",
    headers: { ...(user ? { "x-test-user": user } : {}), Origin: url, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const readProfile = async (user: string) => GetProfileResponse.parse(await (await profileCall(user)).json());
  assert.equal((await profileCall(null)).status, 401);
  const initial = await readProfile("welcome");
  assert.equal(initial.onboarded, false);
  assert.equal(initial.learningPreferences, null);
  const prefs = { age: 25, memorized: "  أجزاء من القرآن  ", goal: "both", dailyMinutes: 15 };
  const body = { name: "طالب تجريبي", role: "student", learningPreferences: prefs };
  for (const invalid of [
    { ...prefs, age: 0 }, { ...prefs, age: 121 }, { ...prefs, age: 25.5 },
    { ...prefs, dailyMinutes: 17 }, { ...prefs, goal: "admin" },
    { ...prefs, memorized: " " }, { ...prefs, memorized: "أ".repeat(1001) },
    { ...prefs, approved: true },
  ]) {
    assert.equal((await profileCall("welcome", { ...body, learningPreferences: invalid })).status, 400);
  }
  assert.equal((await readProfile("welcome")).onboarded, false);
  assert.equal((await profileCall("welcome", body)).status, 200);
  const saved = await readProfile("welcome");
  assert.equal(saved.onboarded, true);
  assert.deepEqual(saved.learningPreferences, { ...prefs, memorized: prefs.memorized.trim() });
  assert.equal((await readMap("welcome")).stages[0].status, "current");
  assert.equal((await readMap("welcome")).stages[1].status, "locked");
  assert.equal((await readProfile("other")).learningPreferences, null);
  assert.equal((await profileCall("welcome", { name: "اسم جديد", role: "student" })).status, 200);
  assert.deepEqual((await readProfile("welcome")).learningPreferences, saved.learningPreferences);
  assert.equal((await profileCall("welcome", { ...body, role: "teacher" })).status, 400);
  assert.equal((await profileCall("welcome", { name: "اسم جديد", role: "teacher" })).status, 409);
  assert.equal((await profileCall("welcome", { ...body, learningPreferences: { ...prefs, age: null } })).status, 200);
  assert.equal((await readProfile("welcome")).learningPreferences?.age, null);
  // Post-registration edits and clears are scoped to the signed-in account,
  // never to a supplied profile id, and never change learning progression.
  const beforeMap = await readMap("welcome");
  const edited = { age: 120, memorized: "أ".repeat(1000), goal: "review", dailyMinutes: 60 };
  const editBody = { name: "اسم جديد", role: "student", learningPreferences: edited };
  assert.equal((await profileCall("welcome", { ...editBody, id: "other" })).status, 400);
  assert.equal((await profileCall("welcome", editBody)).status, 200);
  const reloaded = await profileCall("welcome");
  assert.equal(reloaded.headers.get("cache-control"), "no-store");
  assert.deepEqual(GetProfileResponse.parse(await reloaded.json()).learningPreferences, edited);
  assert.equal((await profileCall("welcome", { ...editBody, learningPreferences: { ...edited, age: "25" } })).status, 400);
  assert.deepEqual((await readProfile("welcome")).learningPreferences, edited, "failed edits retain saved answers");
  assert.equal((await profileCall("welcome", { ...editBody, learningPreferences: { ...edited, age: 1, dailyMinutes: 10 } })).status, 200);
  assert.equal((await readProfile("welcome")).learningPreferences?.age, 1, "retry succeeds");
  assert.equal((await profileCall(null, { ...editBody, learningPreferences: null })).status, 401);
  assert.equal((await profileCall("welcome", { ...editBody, learningPreferences: null })).status, 200);
  const cleared = await readProfile("welcome");
  assert.equal(cleared.learningPreferences, null);
  assert.equal(cleared.name, "اسم جديد");
  assert.equal(cleared.role, "student");
  assert.equal(cleared.onboarded, true);
  assert.deepEqual(await readMap("welcome"), beforeMap);
  assert.equal((await readProfile("other")).learningPreferences, null);
  // Clearing is idempotent; adding again accepts the remaining advertised options.
  assert.equal((await profileCall("welcome", { ...editBody, learningPreferences: null })).status, 200);
  for (const dailyMinutes of [30, 45]) {
    assert.equal((await profileCall("welcome", { ...editBody, learningPreferences: { ...prefs, age: null, goal: "memorize", dailyMinutes } })).status, 200);
  }
  assert.equal((await readProfile("welcome")).learningPreferences?.dailyMinutes, 45);
});

test("auth, consent, path validation, origins, locked stage and foreign attempt ownership enforced", async () => {
  assert.equal((await call("/nawawi", null)).status, 401);
  assert.equal((await call("/nawawi", "teacher")).status, 403);
  assert.equal((await call("/nawawi/stages/2/attempts", "learner", startBody())).status, 403);
  assert.equal((await call("/nawawi/stages/1.5/attempts", "learner", startBody())).status, 400);
  assert.equal((await call("/nawaqid/stages/1/attempts", "learner", startBody())).status, 400);
  assert.equal((await call("/nawawi/stages/1/attempts", "learner", { ...startBody(), consent: false })).status, 400);
  assert.equal((await call("/nawawi/stages/1/attempts", "learner", { ...startBody(), userId: "other" })).status, 400);
  assert.equal((await call("/nawawi/stages/1/attempts", "learner", startBody(), "https://evil.invalid")).status, 403);
  const input = startBody();
  const a = await start("learner", 1, input);
  assert.match(a.sourceHash, /^[a-f0-9]{64}$/);
  assert.equal((await start("learner", 1, input)).id, a.id);
  assert.equal((await call(finish(a.id), "other", full())).status, 404);
  assert.equal((await call(finish(a.id), "learner", { ...full(), score: 100 })).status, 400);
  assert.equal((await call(finish(a.id), "learner", { matchedIndices: [0, 0], issues: [] })).status, 400);
});

test("incomplete attempt does not unlock; complete pass is durable, idempotent and cannot be downgraded", async () => {
  const a = await start();
  const partial = FinishStageAttemptResponse.parse(await (await call(finish(a.id), "learner", { matchedIndices: [0], issues: [] })).json());
  assert.equal(partial.passed, false); assert.equal(partial.complete, false);
  const beforeMap = await readMap();
  assert.equal(beforeMap.stages[1].status, "locked");
  const fractional = await start();
  const original = full();
  const missed = original.matchedIndices[0];
  const fractionResponse = await call(finish(fractional.id), "learner", {
    matchedIndices: original.matchedIndices.slice(1),
    issues: [{ index: missed, kind: "substitution" }],
  });
  assert.equal(fractionResponse.status, 200);
  const fractionOutcome = FinishStageAttemptResponse.parse(await fractionResponse.json());
  assert.equal(fractionOutcome.passed, true);
  assert.ok(fractionOutcome.percent > 90 && fractionOutcome.percent < 100);
  assert.equal((await readMap()).stages[0].bestPercent, fractionOutcome.percent);
  const b = await start();
  const passed = await Promise.all([call(finish(b.id), "learner", full()), call(finish(b.id), "learner", full())]);
  for (const p of passed) { assert.equal(p.status, 200); assert.equal(FinishStageAttemptResponse.parse(await p.json()).passed, true); }
  const response = await call("/nawawi");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const map = GetLearningMapResponse.parse(await response.json());
  assert.equal(map.stages[0].status, "passed"); assert.equal(map.stages[1].status, "current");
  assert.equal(map.stages[2].status, "locked");
  assert.equal((await readMap("other")).stages[0].status, "current");
  const retry = await start();
  await call(finish(retry.id), "learner", { matchedIndices: [], issues: [] });
  assert.equal((await readMap()).stages[0].bestPercent, 100);
  assert.equal((await readMap()).stages[0].status, "passed");
  assert.equal((await call("/nawawi/stages/2/attempts", "learner", startBody())).status, 201);
});

test("expired and changed-source attempts never record a pass", async () => {
  const a = await start("other");
  await db.update(stageAttemptsTable).set({ sourceHash: "old-text" }).where(eq(stageAttemptsTable.id, a.id));
  assert.equal((await call(finish(a.id), "other", full())).status, 409);
  const b = await start("other");
  await db.update(stageAttemptsTable).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(stageAttemptsTable.id, b.id));
  assert.equal((await call(finish(b.id), "other", full())).status, 409);
  assert.equal((await readMap("other")).stages[1].status, "locked");
});