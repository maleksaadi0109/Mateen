import assert from "node:assert/strict";
import { before, after, beforeEach, test } from "node:test";
import express from "express";
import { eq } from "drizzle-orm";
import { assessmentAnswersTable, assessmentAttemptsTable, assessmentReviewerGrantsTable, practiceRecitationsTable, qualificationDocumentsTable, teacherReviewsTable } from "@workspace/db";
import { randomUUID } from "node:crypto";
import teacherRouter from "../src/routes/teacher-review";
import uploadRouter from "../src/routes/local-storage-upload";
import assessmentRouter from "../src/routes/assessments";
import recitationRouter from "../src/routes/recitations";
import { ObjectStorageService } from "../src/lib/objectStorage";
import { db, pool, resetFixtures } from "./scholarly.harness";
import { LocalPrivateFile } from "../src/lib/local-private-storage";
import { scannedBytes, setScannerUnavailable } from "./doubles/private-storage-scanner";

let server: ReturnType<ReturnType<typeof express>["listen"]>;
let origin: string;
const pdf = Buffer.from("%PDF-1.4\nSynthetic qualification fixture; no real certificate.\n%%EOF");
before(async () => {
  const app = express();
  app.use("/api", uploadRouter); // Same order as app.ts: before parsers/auth.
  app.use(express.json());
  app.use("/api", teacherRouter);
  app.use("/api", assessmentRouter);
  app.use("/api", recitationRouter);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
  process.env.LOCAL_PRIVATE_STORAGE_ORIGIN = origin;
});
after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await pool.end();
});
beforeEach(async () => {
  await resetFixtures();
  await db.delete(qualificationDocumentsTable);
  await db.delete(teacherReviewsTable);
  await db.delete(assessmentAnswersTable);
  await db.delete(assessmentAttemptsTable);
  await db.delete(assessmentReviewerGrantsTable);
  setScannerUnavailable(false);
});
function request(actor: string, method: string, route: string, body?: unknown) {
  return fetch(`${origin}/api/mateen${route}`, {
    method, headers: { "x-test-participant": actor, Origin: origin, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function startUpload() {
  const response = await request("teacher-a", "POST", "/teacher/documents/upload", {
    name: "synthetic.pdf", kind: "qualification", size: pdf.length, contentType: "application/pdf",
  });
  assert.equal(response.status, 200);
  return await response.json() as { documentId: string; uploadURL: string };
}
async function put(url: string, bytes: Buffer) {
  return fetch(new URL(url, origin), { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: bytes });
}

test("synthetic owner uploads real bytes, promotes and downloads; other users and anonymous cannot", async () => {
  for (const [actor, status] of [["anonymous", 401], ["student-a", 403]] as const) {
    const denied = await request(actor, "POST", "/teacher/documents/upload", {
      name: "synthetic.pdf", kind: "qualification", size: pdf.length, contentType: "application/pdf",
    });
    assert.equal(denied.status, status);
  }
  const upload = await startUpload();
  assert.equal((await put(upload.uploadURL, pdf)).status, 204);
  const complete = `/teacher/documents/${upload.documentId}/complete`;
  assert.equal((await request("teacher-b", "POST", complete)).status, 404);
  assert.equal((await request("teacher-a", "POST", complete)).status, 200);
  assert.deepEqual(scannedBytes, pdf);
  const download = `/documents/${upload.documentId}/download`;
  for (const [actor, status] of [["anonymous", 401], ["student-a", 403], ["teacher-b", 403], ["content-reviewer", 403]] as const) {
    assert.equal((await request(actor, "GET", download)).status, status, actor);
  }
  for (const actor of ["teacher-a", "reviewer-ok"]) {
    const response = await request(actor, "GET", download);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
  }
  // The original capability is reusable, but never points at scanned evidence.
  assert.equal((await put(upload.uploadURL, Buffer.from("%PDF-replaced"))).status, 204);
  const [document] = await db.select().from(qualificationDocumentsTable).where(eq(qualificationDocumentsTable.id, upload.documentId));
  assert.ok(document.cleanObject?.startsWith("/local-private/qualification/"));
  const clean = new LocalPrivateFile(document.cleanObject!.slice("/local-private/".length));
  await assert.rejects(clean.save(Buffer.from("replace")));
  assert.deepEqual(Buffer.from(await (await request("teacher-a", "GET", download)).arrayBuffer()), pdf);
  assert.equal((await fetch(upload.uploadURL)).status, 404); // no GET on PUT URL
  assert.equal((await fetch(`${origin}${document.cleanObject}`)).status, 404); // no static directory
  assert.equal((await request("teacher-b", "DELETE", `/teacher/documents/${upload.documentId}`)).status, 404);
  assert.equal((await request("teacher-a", "DELETE", `/teacher/documents/${upload.documentId}`)).status, 204);
  assert.deepEqual(await clean.exists(), [false]);
});

test("bad signatures, invalid capability and missing scanner never produce clean evidence", async () => {
  const upload = await startUpload();
  const tampered = `${upload.uploadURL}tampered`;
  assert.equal((await put(tampered, pdf)).status, 403);
  assert.equal((await put("/api/storage/local-upload", pdf)).status, 403);
  assert.equal((await put(upload.uploadURL, pdf)).status, 204);
  setScannerUnavailable(true);
  const complete = `/teacher/documents/${upload.documentId}/complete`;
  assert.equal((await request("teacher-a", "POST", complete)).status, 503);
  const [document] = await db.select().from(qualificationDocumentsTable).where(eq(qualificationDocumentsTable.id, upload.documentId));
  assert.equal(document.status, "uploading");
  assert.equal(document.cleanObject, null);
  assert.equal((await request("teacher-a", "GET", `/documents/${upload.documentId}/download`)).status, 404);
  setScannerUnavailable(false);
  assert.equal((await put(upload.uploadURL, Buffer.alloc(pdf.length, 65))).status, 204);
  assert.equal((await request("teacher-a", "POST", complete)).status, 422);
});

test("real signed audio upload and frozen reviewer download preserve grant, independence and retention checks", async () => {
  const storage = new ObjectStorageService();
  const uploadPath = storage.createObjectEntityUploadPath();
  const url = await storage.getObjectEntityUploadURLForPath(uploadPath, new Date(Date.now() + 60_000));
  const audio = Buffer.from("Synthetic recording fixture, not a learner's voice");
  assert.equal((await put(url, audio)).status, 204);
  const uploaded = await storage.getObjectEntityFile(uploadPath);
  assert.deepEqual((await uploaded.download())[0], audio);
  // The freezer itself is exercised with real streaming writes in the unit suite.
  const frozenPath = `/objects/assessment-audio/frozen/${randomUUID()}`;
  await uploaded.bucket.file(frozenPath.slice("/objects/".length)).save(audio, {
    contentType: "audio/webm", preconditionOpts: { ifGenerationMatch: 0 },
  });
  const attemptId = randomUUID();
  const questionId = randomUUID();
  await db.insert(assessmentAttemptsTable).values({
    id: attemptId, userId: "student-a", status: "submitted", textId: "nawawi",
    sourceVersion: "synthetic-storage-test", canonicalHash: "synthetic",
    policySnapshot: {}, questionsSnapshot: [], sessionId: randomUUID(),
  });
  await db.insert(assessmentAnswersTable).values({
    id: randomUUID(), attemptId, userId: "student-a", questionId, position: 16,
    kind: "oral", hadithNumber: 1, prompt: "Synthetic test", referenceText: "Synthetic",
    audioAvailable: true, audioDeletePending: false, storagePath: frozenPath,
    expectedContentType: "audio/webm", audioExpiresAt: new Date(Date.now() + 60_000),
  });
  await db.insert(assessmentReviewerGrantsTable).values([
    { clerkId: "student-b", enabled: true, operatorLabel: "Disposable test only" },
    { clerkId: "student-a", enabled: true, operatorLabel: "Disposable self-review test" },
  ]);
  const download = `/assessment/reviewer/${attemptId}/audio/${questionId}`;
  for (const [actor, status] of [["anonymous", 401], ["teacher-a", 403], ["student-a", 403]] as const) {
    assert.equal((await request(actor, "GET", download)).status, status);
  }
  assert.equal((await put(url, Buffer.from("Replacement staging bytes"))).status, 204);
  const response = await request("student-b", "GET", download);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), audio);
  await db.update(assessmentReviewerGrantsTable).set({ enabled: false }).where(eq(assessmentReviewerGrantsTable.clerkId, "student-b"));
  assert.equal((await request("student-b", "GET", download)).status, 403);
  await db.update(assessmentReviewerGrantsTable).set({ enabled: true }).where(eq(assessmentReviewerGrantsTable.clerkId, "student-b"));
  await db.update(assessmentAnswersTable).set({ audioExpiresAt: new Date(Date.now() - 1000) }).where(eq(assessmentAnswersTable.questionId, questionId));
  assert.equal((await request("student-b", "GET", download)).status, 404);
});

test("practice route stores an object key, confirms upload, lets the real worker read bytes and cleans them privately", async () => {
  const audio = Buffer.from("Synthetic practice bytes, no real learner recording");
  const started = await request("student-a", "POST", "/recitations", {
    textId: "nawawi", hadithNumber: 1, contentType: "audio/webm", sizeBytes: audio.length, consent: true,
  });
  assert.equal(started.status, 201);
  const upload = await started.json() as { id: string; uploadUrl: string; expiresAt: string };
  const [row] = await db.select().from(practiceRecitationsTable).where(eq(practiceRecitationsTable.id, upload.id));
  assert.match(row.storagePath!, /^\/objects\/uploads\/[0-9a-f-]+$/);
  assert.notEqual(row.storagePath, upload.uploadUrl);
  assert.equal(row.uploadExpiresAt.toISOString(), upload.expiresAt);
  assert.equal((await fetch(upload.uploadUrl, {
    method: "PUT", headers: { "Content-Type": "audio/webm" }, body: audio,
  })).status, 204);
  const file = await new ObjectStorageService().getObjectEntityFile(row.storagePath!);
  assert.deepEqual((await file.download())[0], audio);
  for (const method of ["GET", "DELETE"]) {
    assert.equal((await request("student-b", method, `/recitations/${upload.id}`)).status, 404);
    assert.equal((await request("anonymous", method, `/recitations/${upload.id}`)).status, 401);
  }
  assert.equal((await request("student-b", "POST", `/recitations/${upload.id}/analyze`)).status, 404);
  const savedPath = process.env.PATH;
  try {
    // Exercise the actual queue, object resolver, bounded streaming download,
    // metadata checks and worker cleanup, but intentionally make inference
    // unavailable. No fabricated transcription or learner grade is returned.
    process.env.PATH = "";
    const confirmed = await request("student-a", "POST", `/recitations/${upload.id}/analyze`);
    assert.equal(confirmed.status, 200);
    assert.equal((await confirmed.json() as { status: string }).status, "processing");
    let finished = row;
    for (let tries = 0; tries < 100; tries++) {
      [finished] = await db.select().from(practiceRecitationsTable).where(eq(practiceRecitationsTable.id, upload.id));
      if (finished.audioDeleted && finished.status === "error") break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    // This specific error occurs only after successful download and declared
    // metadata verification; an invalid storage reference gives a different error.
    assert.equal(finished.error, "Local recitation runtime is not ready.");
    assert.equal(finished.audioDeleted, true);
    assert.equal(finished.result, null);
    assert.deepEqual(await file.exists(), [false]);
  } finally {
    if (savedPath === undefined) delete process.env.PATH;
    else process.env.PATH = savedPath;
  }
  // Replay is allowed until expiry, and explicit owner cleanup removes it again.
  assert.equal((await fetch(upload.uploadUrl, {
    method: "PUT", headers: { "Content-Type": "audio/webm" }, body: audio,
  })).status, 204);
  assert.equal((await request("student-a", "DELETE", `/recitations/${upload.id}`)).status, 204);
  assert.deepEqual(await file.exists(), [false]);
  const deleted = await request("student-a", "GET", `/recitations/${upload.id}`);
  assert.equal(deleted.status, 200);
  const deletedState = await deleted.json() as { status: string; audioDeleted: boolean; result: unknown };
  assert.equal(deletedState.status, "deleted");
  assert.equal(deletedState.audioDeleted, true);
  assert.equal(deletedState.result, null);
});
