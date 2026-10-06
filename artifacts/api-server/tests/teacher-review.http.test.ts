import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, beforeEach, test } from "node:test";
import express from "express";
import { eq } from "drizzle-orm";
import { qualificationDocumentsTable, teacherReviewsTable } from "@workspace/db";
import teacherReviewRouter from "../src/routes/teacher-review";
import sourceReviewRouter from "../src/routes/source-review";
import { db, pool, resetFixtures } from "./scholarly.harness";

// The runner generates the schema in a disposable, socket-only PostgreSQL cluster.
// Real Clerk identities, storage, credentials and application data are never used.
let server: ReturnType<ReturnType<typeof express>["listen"]>;
let origin: string;
before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", teacherReviewRouter);
  app.use("/api", sourceReviewRouter);
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
  assert.ok(bodyData && typeof bodyData === "object");
  return { status: response.status, body: bodyData as Record<string, unknown>, headers: response.headers };
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

test("ordinary reviewer sessions read queues, private PDFs and audit without MFA; unauthorized requests fail closed", async () => {
  const revision = await submitted();
  const [doc] = await db.select().from(qualificationDocumentsTable);
  for (const [actor, mfa, secure] of [
    ["reviewer-no-mfa", false, false], ["reviewer-old", true, false], ["reviewer-ok", true, true],
  ] as const) {
    const access = await request(actor, "GET", "/review-access");
    assert.equal(access.status, 200);
    assert.equal(access.headers.get("cache-control"), "private, no-store");
    assert.equal(access.body.qualificationReviewer, true);
    assert.equal(access.body.mfaEnabled, mfa);
    assert.equal(access.body.secureSession, secure);
  }
  for (const actor of ["anonymous", "student-a", "content-reviewer", "reviewer-unverified", "reviewer-disabled", "reviewer-locked"]) {
    const expected = actor === "anonymous" ? 401 : 403;
    assert.equal((await request(actor, "GET", "/admin/teachers")).status, expected, actor);
    assert.equal((await request(actor, "GET", `/documents/${doc.id}/download`)).status, expected, actor);
    if (actor !== "content-reviewer") assert.equal((await request(actor, "GET", "/admin/audit")).status, expected, actor);
    for (const decision of ["approved", "rejected"]) {
      assert.equal((await request(actor, "POST", "/admin/teachers/teacher-a/decision", {
        revision, decision, reason: "Isolated security regression",
      })).status, expected, `${actor}: ${decision}`);
    }
  }
  for (const actor of ["reviewer-no-mfa", "reviewer-old", "reviewer-ok"]) {
    const queue = await request(actor, "GET", "/admin/teachers");
    assert.equal(queue.status, 200);
    assert.equal(queue.headers.get("cache-control"), "private, no-store");
    assert.equal(Array.isArray(queue.body), true);
    const pdf = await fetch(`${origin}/api/mateen/documents/${doc.id}/download`, { headers: { "x-test-participant": actor } });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get("content-type"), "application/octet-stream");
    assert.ok((await pdf.text()).startsWith("%PDF-"));
    const audit = await request(actor, "GET", "/admin/audit");
    assert.equal(audit.status, 200);
    assert.ok(JSON.stringify(audit.body).includes("teacher_document_downloaded"));
  }
  assert.equal((await db.select().from(teacherReviewsTable))[0].status, "pending_review");
});

test("ordinary sessions can approve and reject; stale and self decisions stay denied", async () => {
  for (const actor of ["reviewer-no-mfa", "reviewer-old", "reviewer-ok"]) {
    for (const decision of ["approved", "rejected"]) {
      await resetFixtures();
      await db.delete(qualificationDocumentsTable);
      await db.delete(teacherReviewsTable);
      await document();
      const revision = 1;
      await db.insert(teacherReviewsTable).values({ userId: "teacher-a", status: "pending_review", revision });
      const result = await request(actor, "POST", "/admin/teachers/teacher-a/decision", {
        revision, decision, reason: "Isolated ordinary-session decision",
      });
      assert.equal(result.status, 200, `${actor}: ${decision}`);
      assert.equal(result.body.status, decision);
      assert.equal((await request(actor, "POST", "/admin/teachers/teacher-a/decision", {
        revision, decision, reason: "Stale revision must not be accepted",
      })).status, 409);
    }
  }
  assert.equal((await request("self-reviewer", "POST", "/admin/teachers/self-reviewer/decision", {
    revision: 0, decision: "approved", reason: "Self-review must stay forbidden",
  })).status, 403);
});

test("audit scopes stay separate and unverified email has a specific denial", async () => {
  await submitted();
  const contentAudit = await request("content-reviewer", "GET", "/admin/audit");
  assert.equal(contentAudit.status, 200);
  assert.deepEqual(contentAudit.body, []);
  for (const path of ["/admin/audit", "/admin/teachers"]) {
    assert.equal((await request("reviewer-unverified", "GET", path)).body.error,
      "A verified email is required for administrative review");
  }
});

test("direct source requests keep content scope and allow a content reviewer without MFA", async () => {
  for (const actor of ["anonymous", "student-a", "reviewer-no-mfa", "reviewer-old", "reviewer-unverified", "reviewer-disabled", "reviewer-locked"]) {
    const expected = actor === "anonymous" ? 401 : 403;
    assert.equal((await request(actor, "GET", "/admin/sources")).status, expected, actor);
    assert.equal((await request(actor, "POST", "/admin/sources", {})).status, expected, actor);
    assert.equal((await request(actor, "POST", "/admin/sources/isolated-version/decision", {})).status, expected, actor);
  }
  const created = await request("content-reviewer", "POST", "/admin/sources", {
    hadithNumber: 1, text: "Synthetic policy regression wording, not an approved religious source.",
    printedPage: 1, viewerPage: 1, viewerUrl: "https://example.invalid/test",
    edition: "Synthetic isolated edition", changeReason: "Disposable policy regression only",
    rightsEvidence: "", rightsUrl: "",
  });
  assert.equal(created.status, 201);
  assert.equal((await request("content-reviewer", "GET", "/admin/sources")).status, 200);
  const decision = await request("content-reviewer", "POST", `/admin/sources/${created.body.id}/decision`, {
    decision: "rejected", scientificStatus: "rejected", rightsStatus: "pending",
    reason: "Synthetic content, not for publication",
  });
  assert.equal(decision.status, 200);
  assert.equal(decision.body.status, "rejected");
  const contentAudit = await request("content-reviewer", "GET", "/admin/audit");
  assert.ok(JSON.stringify(contentAudit.body).includes(String(created.body.id)));
  const qualificationAudit = await request("reviewer-no-mfa", "GET", "/admin/audit");
  assert.ok(!JSON.stringify(qualificationAudit.body).includes(String(created.body.id)));
});