import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import { pool, db, profilesTable, wordPracticesTable } from "@workspace/db";
import { GetWordPracticeResponse, ListWordPracticesResponse } from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { practiceReference, practiceInput, validAttempt } from "../src/lib/word-practice-policy";
import router from "../src/routes/word-practice";

// Stub only the source reader: no privileges or production source mutations.
// Runner replaces this module with an available reviewed-source fixture.
const app = express(); app.use("/api", router);
const server = app.listen(0, "127.0.0.1");
let url: string;
before(async () => {
  await new Promise<void>(resolve => server.listening ? resolve() : server.once("listening", resolve));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await db.insert(profilesTable).values([
    { clerkId: "owner", name: "test", role: "student", onboarded: true },
    { clerkId: "other", name: "test", role: "student", onboarded: true },
    { clerkId: "teacher", name: "test", role: "teacher", onboarded: true },
  ]);
});
after(async () => { server.close(); await pool.end(); });
const call = (suffix: string, user = "owner", method = "GET", body?: unknown) => fetch(`${url}/api/mateen/word-practice${suffix}`, {
  method, headers: { ...(user ? { "x-test-user": user } : {}), origin: url, "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const ref = practiceReference({ id: 1, title: "test", text: "الله الله كلمة أخرى نهاية" });
const input = () => ({ requestId: randomUUID(), consent: true, hadithId: 1, fingerprint: ref.fingerprint,
  tokenizerVersion: ref.tokenizerVersion, start: 0, end: 5, targets: [0, 1], attempts: [] });
test("shape, repeated positions, limits, no transcripts or fictional extras", () => {
  assert.ok(practiceInput.safeParse(input()).success);
  for (const bad of [{ ...input(), targets: [0, 0] }, { ...input(), targets: [5] },
    { ...input(), end: 121 }, { ...input(), audio: "bytes" }, { ...input(), transcript: "words" },
    { ...input(), consent: false }]) assert.equal(practiceInput.safeParse(bad).success, false);
  assert.equal(validAttempt({ requestId: randomUUID(), status: "comparable", covered: 4, matched: 4 }, 5), false);
  assert.equal(validAttempt({ requestId: randomUUID(), status: "unavailable", covered: 0, matched: 0 }, 5), true);
});
test("owned HTTP CRUD, explicit save, idempotency, source changes and bounded attempts", async () => {
  assert.equal((await call("", "", "GET")).status, 401);
  assert.equal((await call("", "teacher")).status, 403);
  assert.equal((await call("/reference/1")).status, 200);
  const v = input();
  const saved = await call("", "owner", "POST", v);
  assert.equal(saved.status, 201);
  const record = GetWordPracticeResponse.parse(await saved.json());
  assert.deepEqual(record.targets, [0, 1]);
  assert.equal((await call("", "owner", "POST", v)).status, 201);
  assert.equal((await call("", "owner", "POST", { ...v, attempts: [{ requestId: randomUUID(), status: "unavailable", covered: 0, matched: 0 }] })).status, 409);
  assert.equal((await call("", "owner", "POST", { ...v, targets: [2] })).status, 409);
  assert.equal((await call("", "owner", "POST", { ...input(), fingerprint: "0".repeat(64) })).status, 409);
  assert.equal((await call("", "owner", "POST", { ...input(), end: 6 })).status, 400);
  assert.equal((await call(`/${record.id}`, "other")).status, 404);
  assert.equal(ListWordPracticesResponse.parse(await (await call("", "other")).json()).length, 0);
  const attempt = { requestId: randomUUID(), status: "comparable", covered: 5, matched: 4 };
  const payload = { consent: true, fingerprint: ref.fingerprint, attempt };
  assert.equal((await call(`/${record.id}/attempts`, "other", "POST", payload)).status, 404);
  assert.equal((await call(`/${record.id}/attempts`, "owner", "POST", payload)).status, 200);
  const retry = await call(`/${record.id}/attempts`, "owner", "POST", payload);
  assert.equal(GetWordPracticeResponse.parse(await retry.json()).attempts.length, 1);
  assert.equal((await call(`/${record.id}/attempts`, "owner", "POST", { ...payload, transcript: "secret" })).status, 400);
  assert.equal((await call(`/${record.id}/attempts`, "owner", "POST", { ...payload, attempt: { ...attempt, matched: 3 } })).status, 409);
  const concurrent = { ...payload, attempt: { ...attempt, requestId: randomUUID() } };
  const deliveries = await Promise.all(Array.from({ length: 4 }, () => call(`/${record.id}/attempts`, "owner", "POST", concurrent)));
  assert.ok(deliveries.every(r => r.status === 200));
  assert.equal(GetWordPracticeResponse.parse(await (await call(`/${record.id}`)).json()).attempts.length, 2);
  for (let i = 2; i < 20; i++) assert.equal((await call(`/${record.id}/attempts`, "owner", "POST",
    { ...payload, attempt: { ...attempt, requestId: randomUUID() } })).status, 200);
  assert.equal((await call(`/${record.id}/attempts`, "owner", "POST",
    { ...payload, attempt: { ...attempt, requestId: randomUUID() } })).status, 409);
  const [row] = await db.select().from(wordPracticesTable).where(eq(wordPracticesTable.id, record.id));
  await db.update(wordPracticesTable).set({ selection: { ...(row!.selection as object), reference: { ...ref, fingerprint: "0".repeat(64), words: ["withdrawn text"] } } }).where(eq(wordPracticesTable.id, record.id));
  const stale = GetWordPracticeResponse.parse(await (await call(`/${record.id}`)).json());
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.reference.words, ref.words);
  assert.equal((await call(`/${record.id}/attempts`, "owner", "POST", payload)).status, 409);
  assert.equal((await call(`/${record.id}`, "other", "DELETE")).status, 204);
  assert.equal((await call(`/${record.id}`)).status, 200);
  assert.equal((await call(`/${record.id}`, "owner", "DELETE")).status, 204);
  assert.equal((await call(`/${record.id}`, "owner", "DELETE")).status, 204);
  assert.equal((await call(`/${record.id}`)).status, 404);
});
test("account exercise quota serializes concurrent explicit creates without changing learning records", async () => {
  const selection = { reference: ref, start: 0, end: 5, targets: [0, 1], initialAttempts: [] };
  await db.insert(wordPracticesTable).values(Array.from({ length: 99 }, () => ({
    id: randomUUID(), userId: "other", requestId: randomUUID(), selection, attempts: [],
  })));
  const results = await Promise.all(Array.from({ length: 4 }, () => call("", "other", "POST", input())));
  assert.equal(results.filter(r => r.status === 201).length, 1);
  assert.equal(results.filter(r => r.status === 409).length, 3);
  assert.equal(ListWordPracticesResponse.parse(await (await call("", "other")).json()).length, 100);
  // The test DB contains no stage, confirmed-error or study-day tables. Successful
  // CRUD above therefore cannot be creating hidden advancement or streak records.
  assert.equal((await db.select().from(profilesTable).where(eq(profilesTable.clerkId, "other")))[0]!.role, "student");
});
