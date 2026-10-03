import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import { db, pool, profilesTable, stageAttemptsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import router from "../src/routes/learning-stages";
import { learningRecords, isStageWord } from "../src/lib/learning-stage-policy";
import { StartStageAttemptResponse, FinishStageAttemptResponse, GetLearningMapResponse } from "@workspace/api-zod";

const app = express();
app.use(express.json({ limit: "64kb" }));
app.use("/api", router);
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