import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, beforeEach, test } from "node:test";
import express from "express";
import { eq } from "drizzle-orm";
import { qualificationDocumentsTable, teacherReviewsTable } from "@workspace/db";
import teacherReviewRouter from "../src/routes/teacher-review";
import { db, pool, resetFixtures } from "./scholarly.harness";

// The runner generates the schema in a disposable, socket-only PostgreSQL cluster.
// Real Clerk identities, storage, credentials and application data are never used.
let server: ReturnType<ReturnType<typeof express>["listen"]>;
let origin: string;
before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", teacherReviewRouter);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
});
beforeEach(async () => {
  await resetFixtures();
  await db.delete(qualificationDocumentsTable);
  await db.delete(teacherReviewsTable);
});
async function request(actor: string, method: string, path: string, body?: unknown) {
  const response = await fetch(`${origin}/api/mateen${path}`, {
    method,
    headers: { "x-test-participant": actor, Origin: origin, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const bodyData: unknown = await response.json();
  assert.ok(bodyData && typeof bodyData === "object" && !Array.isArray(bodyData));
  return { status: response.status, body: bodyData as Record<string, unknown> };
}
async function document(contentType = "application/pdf", status = "clean") {
  const id = randomUUID();
  await db.insert(qualificationDocumentsTable).values({
    id, userId: "teacher-a", name: "TEST-ONLY.pdf", kind: "qualification",
    size: 100, contentType, status, stagingObject: "disposable/not-stored",
    cleanObject: status === "clean" ? "disposable/not-stored" : null,
  });
  return id;
}
async function submitted() {
  await document();
  const saved = await request("teacher-a", "PUT", "/teacher", {
    biography: "Technical test, not a real qualification", specialties: "TEST ONLY", available: false,
  });
  assert.equal(saved.status, 200);
  const sent = await request("teacher-a", "POST", "/teacher/submit", { revision: saved.body.revision });
  assert.equal(sent.status, 200);
  return sent.body.revision;
}
test("normal verified teachers can read and save without MFA; cannot self-grant approval", async () => {
  const read = await request("teacher-a", "GET", "/teacher");
  assert.equal(read.status, 200);
  assert.equal(read.body.status, "draft");
  const saved = await request("teacher-a", "PUT", "/teacher", { biography: "TEST ONLY", specialties: "Technical test", available: true });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.available, false);
  assert.equal(saved.body.status, "draft");
  const injection = await request("teacher-a", "PUT", "/teacher", { biography: "", specialties: "", available: true, status: "approved" });
  assert.equal(injection.status, 400);
  assert.equal((await request("student-a", "GET", "/teacher")).status, 403);
});
test("PDF is mandatory: image upload denied and clean images cannot satisfy submission", async () => {
  assert.equal((await request("teacher-a", "POST", "/teacher/documents/upload", {
    name: "not-a-certificate.png", size: 100, kind: "qualification", contentType: "image/png",
  })).status, 400);
  await document("image/png");
  assert.equal((await request("teacher-a", "POST", "/teacher/submit", { revision: 0 })).status, 409);
  assert.equal((await db.select().from(teacherReviewsTable))[0]?.status, "draft");
});
test("PDF submission, independent approval and stale decision protection work over HTTP", async () => {
  const revision = await submitted();
  const approved = await request("student-b", "POST", "/admin/teachers/teacher-a/decision", {
    revision, decision: "approved", reason: "Disposable policy test only",
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, "approved");
  assert.equal((await request("teacher-a", "GET", "/teacher")).body.available, true);
  assert.equal((await request("student-b", "POST", "/admin/teachers/teacher-a/decision", {
    revision, decision: "rejected", reason: "This is a stale decision",
  })).status, 409);
});
test("rejection returns its reason to the teacher; non-reviewers cannot inspect queue or certificates", async () => {
  const revision = await submitted();
  const rejected = await request("student-b", "POST", "/admin/teachers/teacher-a/decision", {
    revision, decision: "rejected", reason: "Certificate requires clarification",
  });
  assert.equal(rejected.status, 200);
  const teacher = await request("teacher-a", "GET", "/teacher");
  assert.equal(teacher.body.status, "rejected");
  assert.equal(teacher.body.reason, "Certificate requires clarification");
  assert.equal(teacher.body.available, false);
  assert.equal((await request("teacher-a", "GET", "/admin/teachers")).status, 403);
  const [doc] = await db.select().from(qualificationDocumentsTable);
  assert.equal((await request("student-a", "GET", `/documents/${doc.id}/download`)).status, 403);
});
test("approval refuses pending applications without a clean PDF", async () => {
  await document("image/png");
  await db.insert(teacherReviewsTable).values({ userId: "teacher-a", status: "pending_review", revision: 1 });
  const result = await request("student-b", "POST", "/admin/teachers/teacher-a/decision", {
    revision: 1, decision: "approved", reason: "Technical test of missing certificate",
  });
  assert.equal(result.status, 422);
  const [review] = await db.select().from(teacherReviewsTable).where(eq(teacherReviewsTable.userId, "teacher-a"));
  assert.equal(review.status, "pending_review");
});