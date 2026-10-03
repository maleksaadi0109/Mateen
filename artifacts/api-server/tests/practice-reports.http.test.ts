import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import { db, pool, profilesTable, practiceReportsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import router from "../src/routes/practice-reports";
import { practiceReportInput } from "../src/lib/practice-report-policy";
import { GetPracticeReportResponse, GetPracticeReportWordsResponse, ListPracticeReportsResponse } from "@workspace/api-zod";

const app = express();
app.use("/api", router);
const server = app.listen(0, "127.0.0.1");
let url: string;
before(async () => {
  await new Promise<void>(resolve => server.listening ? resolve() : server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  url = `http://127.0.0.1:${address.port}`;
  await db.insert(profilesTable).values([
    { clerkId: "owner", onboarded: true }, { clerkId: "other", onboarded: true },
    { clerkId: "teacher", role: "teacher", onboarded: true },
  ]);
});
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });
const input = () => ({
  attemptId: "full-attempt", consent: true, complete: true, matched: 2, attempted: 123,
  analyses: [{ id: 1, number: 1, title: "تجربة", start: 0, end: 123, totalWords: 123, matched: 2,
    substitutions: 121, omissions: 0, extras: 0, attempted: 123, heard: 123, covered: 123, successPercent: 2, differencePercent: 98 }],
  issues: Array.from({ length: 121 }, (_, index) => ({ index, expected: "كلمة", heard: "غيرها", kind: "substitution" })),
});
async function call(path = "", user: string | null = "owner", method = "GET", body?: unknown) {
  return fetch(`${url}/api/mateen/practice-reports${path}`, {
    method, headers: { ...(user ? { "x-test-user": user } : {}), Origin: url, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

test("explicit consent, complete cross-session reopen, all >100 words, immutable idempotency and owner isolation", async () => {
  assert.equal((await call("", null)).status, 401);
  assert.equal((await call("", "teacher", "POST", input())).status, 403);
  assert.equal((await call("", "owner", "POST", { ...input(), consent: false })).status, 400);
  assert.equal((await call("", "owner", "POST", { ...input(), userId: "other" })).status, 400);
  const saved = await call("", "owner", "POST", input());
  assert.equal(saved.status, 201);
  const report = GetPracticeReportResponse.parse(await saved.json());
  assert.equal(report.issueCount, 121);
  assert.equal("issues" in report, false);
  const again = await call("", "owner", "POST", input());
  assert.equal(GetPracticeReportResponse.parse(await again.json()).id, report.id);
  assert.equal((await call("", "owner", "POST", { ...input(), complete: false })).status, 409);
  // A separate request, with no browser-local data, reads the durable snapshot.
  const reopened = await call(`/${report.id}`);
  assert.equal(reopened.headers.get("cache-control"), "no-store");
  assert.deepEqual(GetPracticeReportResponse.parse(await reopened.json()).analyses, report.analyses);
  const all: unknown[] = [];
  for (const offset of [0, 50, 100]) {
    const response = await call(`/${report.id}/words/1/${offset}`);
    assert.equal(response.status, 200);
    const details = GetPracticeReportWordsResponse.parse(await response.json());
    all.push(...details.issues);
    assert.equal(details.total, 121);
    assert.equal(details.hasMore, offset < 100);
  }
  assert.deepEqual(all, input().issues);
  assert.equal((await call(`/${report.id}/words/1/-1`)).status, 400);
  assert.equal((await call(`/${report.id}/words/2/0`)).status, 404);
  for (const method of ["GET", "DELETE"]) assert.equal((await call(`/${report.id}`, "other", method)).status, 404);
  assert.equal((await call(`/${report.id}/words/1/0`, "other")).status, 404);
  assert.equal((await call(`/${report.id}`, "other", "PATCH", { userId: "other" })).status, 405);
  assert.equal((await call(`/${report.id}`, "owner", "PATCH", input())).status, 405);
  assert.equal(ListPracticeReportsResponse.parse(await (await call("", "other")).json()).reports.length, 0);
  const noOrigin = await fetch(`${url}/api/mateen/practice-reports/${report.id}`, { method: "DELETE", headers: { "x-test-user": "owner" } });
  assert.equal(noOrigin.status, 403);
  const [record] = await db.select().from(practiceReportsTable).where(eq(practiceReportsTable.id, report.id));
  assert.equal(record.userId, "owner");
  assert.equal(JSON.stringify(record).includes("transcript"), false);
  assert.equal((await call(`/${report.id}`, "owner", "DELETE")).status, 204);
  assert.equal((await call(`/${report.id}`)).status, 404);
});

test("partial legacy import is explicit; rejects transcript, invalid counts, indices and unbounded payloads", async () => {
  const legacy = { ...input(), attemptId: "legacy-attempt", complete: false, issues: input().issues.slice(0, 100) };
  assert.equal((await call("", "owner", "POST", legacy)).status, 201);
  assert.equal((await call("", "owner", "POST", { ...legacy, attemptId: "wrong-complete", complete: true })).status, 400);
  for (const bad of [
    { ...input(), transcript: "full recognized text" },
    { ...input(), audio: "bytes" },
    { ...input(), attempted: 124 },
    { ...input(), analyses: [...input().analyses, ...input().analyses] },
    { ...input(), issues: [{ ...input().issues[0], index: 19999 }] },
    { ...input(), issues: [{ ...input().issues[0], heard: "sentence with spaces" }] },
    { ...input(), issues: [{ ...input().issues[0], heard: "a".repeat(61) }] },
    { ...input(), analyses: [{ ...input().analyses[0], grade: 100 }] },
    { ...input(), issues: Array.from({ length: 20001 }, () => input().issues[0]) },
  ]) assert.equal(practiceReportInput.safeParse(bad).success, false);
});

test("list pagination includes all saved attempts without replacing older reports", async () => {
  for (let n = 0; n < 21; n++) {
    assert.equal((await call("", "owner", "POST", { ...input(), attemptId: `paged-${n}` })).status, 201);
  }
  const first = ListPracticeReportsResponse.parse(await (await call()).json());
  const second = ListPracticeReportsResponse.parse(await (await call("?offset=20")).json());
  assert.equal(first.reports.length, 20);
  assert.equal(first.hasMore, true);
  assert.equal(second.reports.length, 2);
  assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.reports, ...second.reports].map(r => r.id)).size, 22);
});