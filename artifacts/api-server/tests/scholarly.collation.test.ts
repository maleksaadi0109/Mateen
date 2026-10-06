import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import express from "express";
import { db, pool, profilesTable, scholarlyPassagesTable, scholarlySourcesTable } from "@workspace/db";
import { GetScholarlyCollationResponse, GetScholarlyGeometryHistoryResponse, RecordScholarlyGeometryResponse } from "@workspace/api-zod";
import type { CollationGeometryConflict } from "@workspace/api-zod";
import router from "../src/routes/scholarly.collation";
import { getPrivateScholarlyPackage } from "../src/lib/private-scholarly-data";
const { prepared } = getPrivateScholarlyPackage();
import { digest, findCollationPassage } from "../src/lib/scholarly-collation";
import { currentGeometry, excerptFingerprint, geometryHistory } from "../src/lib/scholarly-geometry";
import { identities, type TestIdentity } from "./doubles/preview-auth";

let server: ReturnType<express.Express["listen"]>;
let origin: string;
let sourceId: string;
let rows: (typeof scholarlyPassagesTable.$inferSelect)[];
const reviewer = `collation-test-${randomUUID()}`;
const url = () => `${origin}/api/mateen/admin/scholarly/sources/${sourceId}/collation`;
const imageUrl = () => `${url()}/${rows[0].id}/image`;
const historyUrl = (passageId = rows[0].id, excerptId = prepared.passages[0].corrections[0].id) =>
  `${url()}/${passageId}/geometry/history/${encodeURIComponent(excerptId)}`;
function headers(id = reviewer) { return { "x-test-preview-user": id }; }
before(async () => {
  const cluster = process.env.SCHOLARLY_TEST_CLUSTER;
  assert.ok(cluster?.startsWith("/tmp/mateen-participant-tests-"));
  assert.equal(new URL(process.env.DATABASE_URL!).searchParams.get("host"), `${cluster}/socket`);
  identities.set(reviewer, { content: true, mfa: false, factorAge: [0, null] });
  await db.insert(profilesTable).values({ clerkId: reviewer, name: "اختبار معزول", role: "student" });
  const [source] = await db.insert(scholarlySourcesTable).values({
    title: prepared.source.title, author: prepared.source.author, edition: prepared.source.edition,
    version: prepared.source.version, importKey: "aljam3:disposable-test",
    preparationMetadata: prepared.source, createdBy: reviewer,
    legalAuthorization: "permission_granted", authorizationReference: "Synthetic test only",
  }).returning();
  sourceId = source.id;
  rows = await db.insert(scholarlyPassagesTable).values(prepared.passages.slice(0, 5).map(p => ({
    sourceId, text: p.text.trim(), sourceUrl: p.sourceUrl, viewerPage: p.viewerPage,
  }))).returning();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { Object.assign(req, { log: { warn() {} } }); next(); });
  app.use("/api", router);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });

test("every original has exact bounded evidence or explicit exclusion; changed text cannot inherit a page verdict", () => {
  for (const p of prepared.passages) {
    const c = findCollationPassage(p.text.trim(), p.sourceUrl, p.viewerPage);
    assert.ok(c);
    assert.equal(c.originalText, p.text);
    assert.ok(c.exclusionReason);
    for (const x of c.excerpts) assert.equal(c.originalText.slice(x.originalStart, x.originalEnd), x.originalText);
  }
  const p = prepared.passages[0];
  assert.equal(findCollationPassage(`${p.text} altered`, p.sourceUrl, p.viewerPage), null);
  assert.equal(findCollationPassage(p.text, p.sourceUrl, 99), null);
});
test("missing designation, verified email or active account denies metadata and images before disclosure", async () => {
  for (const endpoint of [url(), imageUrl(), historyUrl()]) {
    assert.equal((await fetch(endpoint)).status, 401);
    for (const identity of [{}, { qualification: true }, { content: true, verified: false },
      { content: true, banned: true }, { content: true, locked: true }] as TestIdentity[]) {
      const id = randomUUID(); identities.set(id, identity);
      const res = await fetch(endpoint, { headers: headers(id) });
      assert.equal(res.status, 403);
      assert.ok(res.headers.get("cache-control")?.includes("no-store"));
    }
  }
});
test("read-only inspection provides original/draft/differences, distinct pagination and hash-checked PNG", async () => {
  const res = await fetch(url(), { headers: headers() });
  assert.equal(res.status, 200);
  const data = GetScholarlyCollationResponse.parse(await res.json());
  assert.equal(data.length, rows.length);
  assert.equal(data[0].originalText, prepared.passages[0].text);
  assert.equal(data[0].correctedDraft, prepared.passages[0].correctedDraft);
  assert.equal(data[0].excerpts[0].originalStart, prepared.passages[0].corrections[0].originalStart);
  assert.equal(data[0].pdfPage, 5); assert.equal(data[0].printedPage, "٥");
  assert.equal(data[0].viewerPage, 5);
  assert.equal(data[0].originalTextSha256, digest(data[0].originalText));
  assert.deepEqual(data[0].geometry, []);
  const image = await fetch(imageUrl(), { headers: headers() });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.equal(digest(Buffer.from(await image.arrayBuffer())), data[0].imageSha256);
  const { rows: state } = await pool.query("select status, reviewed_at, indexed_at from mateen_scholarly_sources where id=$1", [sourceId]);
  assert.deepEqual(state[0], { status: "draft", reviewed_at: null, indexed_at: null });
  assert.equal((await fetch(`${url()}/${randomUUID()}/image`, { headers: headers() })).status, 404);
});
const geometryUrl = (passageId: string) => `${url()}/${passageId}/geometry`;
async function comparison() {
  const res = await fetch(url(), { headers: headers() });
  assert.equal(res.status, 200);
  return GetScholarlyCollationResponse.parse(await res.json());
}
function input(c: Awaited<ReturnType<typeof comparison>>[number]) {
  return {
    excerptId: c.excerpts[0].id, imageSha256: c.imageSha256,
    originalTextSha256: c.originalTextSha256,
    expectedRevision: c.geometryStates.find(s => s.excerptId === c.excerpts[0].id)?.revision ?? null,
    rectangles: [{ x: 0.1, y: 0.2, width: 0.5, height: 0.15 }],
    note: "Synthetic geometry, disposable test only", manuallyVerified: true,
  };
}
function record(passageId: string, body: unknown, id = reviewer, requestOrigin = origin) {
  return fetch(geometryUrl(passageId), {
    method: "POST", headers: { ...headers(id), "content-type": "application/json", origin: requestOrigin },
    body: JSON.stringify(body),
  });
}
test("only authorized human-confirmed image bounds can be persisted; fingerprints and origin fail closed", async () => {
  const c = (await comparison()).find(c => c.excerpts.length)!;
  const good = input(c);
  const denied = randomUUID(); identities.set(denied, {});
  assert.equal((await record(c.passageId, good, denied)).status, 403);
  assert.equal((await record(c.passageId, good, reviewer, "https://elsewhere.invalid")).status, 403);
  for (const changes of [
    { manuallyVerified: false }, { note: "short" },
    { rectangles: [{ x: -0.1, y: 0, width: 0.1, height: 0.1 }] },
    { rectangles: [{ x: 0.9, y: 0.2, width: 0.2, height: 0.1 }] },
    { rectangles: [{ x: 0, y: 0, width: 0, height: 0.1 }] },
    { rectangles: [{ x: 0, y: 0, width: 1, height: 1 }] },
    { rectangles: Array(21).fill(good.rectangles[0]) },
    { method: "ocr" }, { actorId: "someone-else" },
    { expectedRevision: undefined }, { expectedRevision: "invalid" },
  ]) assert.equal((await record(c.passageId, { ...good, ...changes })).status, 400);
  assert.equal((await record(c.passageId, { ...good, imageSha256: "a".repeat(64) })).status, 409);
  assert.equal((await record(c.passageId, { ...good, originalTextSha256: "a".repeat(64) })).status, 409);
  assert.equal((await record(c.passageId, { ...good, excerptId: "not-matched" })).status, 404);
  assert.equal((await record(randomUUID(), good)).status, 404);
  assert.deepEqual((await comparison()).find(x => x.passageId === c.passageId)!.geometry, []);
});
test("each of the three PNGs supports durable scoped geometry and revocation without scientific approval", async () => {
  for (const page of [5, 6, 7]) {
    const c = (await comparison()).find(c => c.pdfPage === page && c.excerpts.length)!;
    assert.ok(c);
    const good = input(c);
    const res = await record(c.passageId, good);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("cache-control")?.includes("no-store"));
    const saved = RecordScholarlyGeometryResponse.parse(await res.json());
    assert.equal(saved.method, "manual_visual");
    let reloaded = (await comparison()).find(x => x.passageId === c.passageId)!;
    assert.equal(reloaded.geometry.length, 1);
    assert.equal(reloaded.geometry[0].excerptId, good.excerptId);
    assert.equal(reloaded.geometry[0].imageSha256, c.imageSha256);
    assert.deepEqual(reloaded.geometry[0].rectangles, good.rectangles);
    assert.ok(reloaded.exclusionReason);
    assert.equal((await record(c.passageId, { ...input(reloaded), rectangles: [], note: "Synthetic revocation, test only" })).status, 200);
    reloaded = (await comparison()).find(x => x.passageId === c.passageId)!;
    assert.deepEqual(reloaded.geometry, []);
  }
  const { rows: audits } = await pool.query("select actor_id, details from mateen_scholarly_audit where action='collation_geometry_recorded'");
  assert.equal(audits.length, 6);
  assert.ok(audits.every(a => a.actor_id === reviewer && a.details.method === "manual_visual"));
  const { rows: state } = await pool.query("select status, reviewed_at, indexed_at from mateen_scholarly_sources where id=$1", [sourceId]);
  assert.deepEqual(state[0], { status: "draft", reviewed_at: null, indexed_at: null });
  const { rows: indexed } = await pool.query("select indexed from mateen_scholarly_passages where source_id=$1", [sourceId]);
  assert.ok(indexed.every(p => p.indexed === false));
});
test("changed bindings, corrupted bounds or revocation never resurrect older geometry", () => {
  const p = prepared.passages[0];
  const c = findCollationPassage(p.text.trim(), p.sourceUrl, p.viewerPage)!;
  const { manuallyVerified: _confirmed, expectedRevision: _revision, ...fields } = input({ ...c, passageId: rows[0].id, originalTextSha256: digest(c.originalText), geometry: [], geometryStates: [] });
  const good = { ...fields,
    method: "manual_visual", recordedAt: new Date().toISOString(), excerptSha256: excerptFingerprint(c.excerpts[0]) };
  const old = { details: good };
  assert.equal(currentGeometry(c, [old]).length, 1);
  for (const changes of [{ rectangles: [] }, { imageSha256: "changed" }, { originalTextSha256: "changed" },
    { excerptSha256: "changed" }, { rectangles: [{ x: 0.99, y: 0, width: 0.5, height: 0.1 }] }]) {
    assert.deepEqual(currentGeometry(c, [{ details: { ...good, ...changes } }, old]), []);
  }
});
test("concurrent first saves, replacements and revocations reject stale writers without appending or approval", async () => {
  const reviewers = [randomUUID(), randomUUID()];
  for (const id of reviewers) {
    identities.set(id, { content: true });
    await db.insert(profilesTable).values({ clerkId: id, name: "مراجع اختبار معزول", role: "student" });
  }
  const template = rows[0];
  const [fresh] = await db.insert(scholarlyPassagesTable).values({
    sourceId, text: template.text, sourceUrl: template.sourceUrl, viewerPage: template.viewerPage,
  }).returning();
  let c = (await comparison()).find(c => c.passageId === fresh.id)!;
  assert.equal(input(c).expectedRevision, null);
  for (const operations of [[false, false], [false, true], [true, false], [true, true]]) {
    const stale = input(c);
    const countBefore = await pool.query("select count(*)::int as n from mateen_scholarly_audit where target_id=$1", [fresh.id]);
    const responses = await Promise.all(operations.map((revoke, i) =>
      record(fresh.id, { ...stale, rectangles: revoke ? [] : stale.rectangles,
        note: `Disposable concurrent operation ${i}` }, reviewers[i])));
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
    const winningIndex = responses.findIndex(r => r.status === 200);
    const conflict = await responses.find(r => r.status === 409)!.json() as CollationGeometryConflict;
    assert.equal(conflict.code, "geometry_conflict");
    assert.ok(conflict.state?.current);
    assert.ok(conflict.state.revision);
    assert.equal(conflict.state.current.rectangles.length, operations[winningIndex] ? 0 : 1);
    c = (await comparison()).find(c => c.passageId === fresh.id)!;
    assert.deepEqual(c.geometryStates[0], {
      excerptId: stale.excerptId, revision: conflict.state.revision,
      current: c.geometryStates[0].current,
    });
    assert.equal(c.geometry.length, operations[winningIndex] ? 0 : 1);
    // A stale save AND a stale revoke remain rejected after the race settles.
    for (const rectangles of [[], stale.rectangles]) {
      assert.equal((await record(fresh.id, { ...stale, rectangles }, reviewers[0])).status, 409);
    }
    const countAfter = await pool.query("select count(*)::int as n from mateen_scholarly_audit where target_id=$1", [fresh.id]);
    assert.equal(countAfter.rows[0].n, countBefore.rows[0].n + 1);
  }
  const latestInput = input(c);
  assert.equal((await record(fresh.id, latestInput, reviewers[0])).status, 200);
  const next = (await comparison()).find(c => c.passageId === fresh.id)!;
  assert.notEqual(input(next).expectedRevision, latestInput.expectedRevision);
  const { rows: state } = await pool.query("select status, reviewed_at, indexed_at from mateen_scholarly_sources where id=$1", [sourceId]);
  assert.deepEqual(state[0], { status: "draft", reviewed_at: null, indexed_at: null });
  assert.equal((await db.select().from(scholarlyPassagesTable)).some(p => p.indexed), false);
});
test("changed image bytes block correction inspection and image delivery", async () => {
  const path = `${process.env.SCHOLARLY_TEST_CLUSTER}/collation-evidence/pdf-005.png`;
  const bytes = await readFile(path);
  const c = (await comparison())[0];
  try {
    await writeFile(path, "changed");
    assert.equal((await fetch(url(), { headers: headers() })).status, 503);
    assert.equal((await fetch(imageUrl(), { headers: headers() })).status, 503);
    assert.equal((await record(c.passageId, input(c))).status, 503);
  } finally { await writeFile(path, bytes); }
});

test("history compares immediate before/after edits and revocation, scoped to source and excerpt without restoring bounds", async () => {
  const c = (await comparison()).find(c => c.pdfPage === 5 && c.excerpts.length)!;
  const endpoint = historyUrl(c.passageId, c.excerpts[0].id);
  let res = await fetch(endpoint, { headers: headers() });
  assert.equal(res.status, 200);
  assert.ok(res.headers.get("cache-control")?.includes("no-store"));
  let events = GetScholarlyGeometryHistoryResponse.parse(await res.json());
  assert.equal(events.length, 2);
  assert.equal(events[0].change, "revoked");
  assert.deepEqual(events[0].after!.rectangles, []);
  assert.deepEqual(events[0].before!.rectangles, input(c).rectangles);
  assert.equal(events[0].actorId, reviewer);
  assert.ok(events[0].createdAt);
  assert.equal(events[0].reason, "Synthetic revocation, test only");
  assert.equal(events[0].before!.imageMatches, true);
  assert.equal(events[0].before!.textMatches, true);
  assert.equal(events[1].before, null);
  assert.equal((await fetch(historyUrl(c.passageId, "unknown"), { headers: headers() })).status, 404);
  assert.equal((await fetch(historyUrl(randomUUID(), c.excerpts[0].id), { headers: headers() })).status, 404);
  assert.equal((await fetch(endpoint.replace(sourceId, randomUUID()), { headers: headers() })).status, 404);
  // New geometry after revocation must compare against the empty record, not
  // resurrect the first non-empty record.
  const changed = { ...input(c), rectangles: [{ x: 0.2, y: 0.3, width: 0.4, height: 0.1 }] };
  assert.equal((await record(c.passageId, changed)).status, 200);
  res = await fetch(endpoint, { headers: headers() });
  events = GetScholarlyGeometryHistoryResponse.parse(await res.json());
  assert.deepEqual(events[0].before!.rectangles, []);
  assert.deepEqual(events[0].after!.rectangles, changed.rectangles);
  assert.equal((await record(c.passageId, { ...input((await comparison()).find(x => x.passageId === c.passageId)!), rectangles: [] })).status, 200);
  assert.deepEqual((await comparison()).find(x => x.passageId === c.passageId)!.geometry, []);
  await fetch(endpoint, { headers: headers() });
  assert.deepEqual((await comparison()).find(x => x.passageId === c.passageId)!.geometry, []);
});
test("history marks mismatched fingerprints and invalid intervening audits without borrowing older coordinates", () => {
  const p = prepared.passages[0];
  const c = findCollationPassage(p.text.trim(), p.sourceUrl, p.viewerPage)!;
  const { manuallyVerified: _confirmed, expectedRevision: _revision, ...fields } = input({ ...c, passageId: rows[0].id, originalTextSha256: digest(c.originalText), geometry: [], geometryStates: [] });
  const details = { ...fields, method: "manual_visual", recordedAt: new Date().toISOString(),
    excerptSha256: excerptFingerprint(c.excerpts[0]) };
  const audit = { id: randomUUID(), actorId: reviewer, reason: "Historical test only", createdAt: new Date(), details };
  const events = geometryHistory(c, c.excerpts[0].id, [
    { ...audit, details: { ...details, imageSha256: "a".repeat(64), excerptSha256: "stale", originalTextSha256: "b".repeat(64) } },
    { ...audit, details: { ...details, rectangles: [{ x: 0, y: 0, width: 1, height: 1 }] } },
    audit,
    { ...audit, details: { ...details, excerptId: "other-excerpt" } },
  ]);
  assert.equal(events.length, 3);
  assert.equal(events[0].after!.imageMatches, false);
  assert.equal(events[0].after!.textMatches, false);
  assert.equal(events[0].before, null);
  assert.equal(events[1].change, "invalid");
  assert.equal(events[1].after, null);
  assert.deepEqual(events[1].before!.rectangles, details.rectangles);
  assert.equal(events[2].before, null);
});
