import { strict as assert } from "node:assert";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import type { ErrorRequestHandler } from "express";
import { and, eq } from "drizzle-orm";
import {
  assessmentAnswersTable,
  assessmentAttemptsTable,
  assessmentReviewerGrantsTable,
  profilesTable,
  assessmentAudioCleanupOutboxTable,
  assessmentAudioUploadCleanupOutboxTable,
  db,
  pool,
} from "@workspace/db";
import router from "../src/routes/assessments";
import { cleanupExpiredAssessmentAudio } from "../src/lib/assessment-retention";
import {
  assessmentAudioTestState,
  resetAssessmentAudioTestState,
} from "./doubles/assessment-audio-state";

const ownerId = "assessment-audio-test-owner";
const sessionId = "d79cc043-d3ca-4a01-a9c4-186392693a66";
const questionId = "d719ddab-4330-4fa3-91c3-9430dcce80cc";
const app = express();
app.use(express.json());
app.use(router);
// This server and database contain synthetic fixtures only. Surface unexpected
// route failures rather than hiding the cause behind an HTTP status assertion.
app.use(((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error instanceof Error ? error.message : "Unexpected test route failure" });
}) as ErrorRequestHandler);

let server: ReturnType<typeof app.listen>;
let baseUrl = "";
let attemptId = "";

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
  await db.delete(assessmentReviewerGrantsTable);
  await db.delete(profilesTable).where(eq(profilesTable.clerkId, ownerId));
  // Each case uses the same test-only principal in the disposable local
  // database; remove its previous active attempt before creating another.
  await db.delete(assessmentAnswersTable).where(eq(assessmentAnswersTable.userId, ownerId));
  await db.delete(assessmentAttemptsTable).where(eq(assessmentAttemptsTable.userId, ownerId));
  resetAssessmentAudioTestState();
  attemptId = crypto.randomUUID();
  const now = new Date();
  await db.insert(assessmentAttemptsTable).values({
    id: attemptId,
    userId: ownerId,
    status: "in_progress",
    textId: "nawawi",
    sourceVersion: "assessment-audio-http-test",
    canonicalHash: "assessment-audio-http-test",
    policySnapshot: { test: true },
    questionsSnapshot: [],
    sessionId,
    activeSeconds: 0,
    activeMilliseconds: 0,
    currentQuestionPosition: 15,
    lastHeartbeatAt: now,
    lastTrustedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(assessmentAnswersTable).values({
    id: crypto.randomUUID(),
    attemptId,
    userId: ownerId,
    questionId,
    position: 16,
    kind: "oral",
    hadithNumber: 1,
    prompt: "Test oral prompt",
    referenceText: "Test reference",
    answerSequence: 0,
    audioSequence: 0,
    audioAvailable: false,
    audioDeletePending: false,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  await db.delete(assessmentAnswersTable).where(eq(assessmentAnswersTable.userId, ownerId));
  await db.delete(assessmentAttemptsTable).where(eq(assessmentAttemptsTable.userId, ownerId));
  await db.delete(assessmentReviewerGrantsTable);
  await db.delete(profilesTable).where(eq(profilesTable.clerkId, ownerId));
  await pool.end();
});

test("coverage admits only independent explicit grants and revocation closes review access", async () => {
  const reviewerId = "synthetic-assessment-reviewer";
  const coverage = async () => {
    const response = await fetch(`${baseUrl}/mateen/assessment/coverage`);
    assert.equal(response.status, 200);
    return response.json() as Promise<{ available: boolean; responseHours: number }>;
  };
  const begin = () => fetch(`${baseUrl}/mateen/assessments`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  await db.delete(assessmentAnswersTable).where(eq(assessmentAnswersTable.userId, ownerId));
  await db.delete(assessmentAttemptsTable).where(eq(assessmentAttemptsTable.userId, ownerId));
  await db.insert(profilesTable).values({ clerkId: ownerId, role: "student", onboarded: true });
  assert.deepEqual(await coverage(), { available: false, responseHours: 48 });
  assert.equal((await begin()).status, 503);
  assert.equal((await db.select().from(assessmentAttemptsTable).where(eq(assessmentAttemptsTable.userId, ownerId))).length, 0);
  // Public teacher role alone must not create coverage.
  await db.insert(profilesTable).values({ clerkId: reviewerId, role: "teacher" }).onConflictDoNothing();
  assert.equal((await coverage()).available, false);
  await db.insert(assessmentReviewerGrantsTable).values({ clerkId: ownerId, enabled: true, operatorLabel: "disposable-test" });
  assert.equal((await coverage()).available, false);
  assert.equal((await begin()).status, 503);
  await db.insert(assessmentReviewerGrantsTable).values({ clerkId: reviewerId, enabled: true, operatorLabel: "disposable-test" });
  assert.equal((await coverage()).available, true);
  const admitted = await begin();
  assert.equal(admitted.status, 201);
  const created = await admitted.json() as { id: string };
  assert.ok(created.id);
  const headers = { "x-test-user": reviewerId };
  assert.equal((await fetch(`${baseUrl}/mateen/assessment/reviewer/queue`, { headers })).status, 200);
  const selfReview = await fetch(`${baseUrl}/mateen/assessment/reviewer/${created.id}`);
  assert.equal(selfReview.status, 403);
  await db.update(assessmentReviewerGrantsTable).set({ enabled: false }).where(eq(assessmentReviewerGrantsTable.clerkId, reviewerId));
  assert.equal((await coverage()).available, false);
  const access = await fetch(`${baseUrl}/mateen/assessment/reviewer-access`, { headers });
  assert.deepEqual(await access.json(), { authorized: false });
  for (const path of ["queue", created.id, `${created.id}/audio/${questionId}`]) {
    assert.equal((await fetch(`${baseUrl}/mateen/assessment/reviewer/${path}`, { headers })).status, 403);
  }
  const decision = await fetch(`${baseUrl}/mateen/assessment/reviewer/${created.id}`, {
    method: "POST", headers: { ...headers, "content-type": "application/json" }, body: "{}",
  });
  assert.equal(decision.status, 403);
  // Coverage loss must not prevent resuming a previously admitted attempt.
  assert.equal((await begin()).status, 200);
  const [unchanged] = await db.select().from(assessmentAttemptsTable).where(eq(assessmentAttemptsTable.id, created.id));
  assert.equal(unchanged.status, "in_progress");
  assert.equal(unchanged.result, null);
  await db.delete(profilesTable).where(eq(profilesTable.clerkId, reviewerId));
});

test("a decision rechecks revocation after its initial access check while waiting on a grant lock", async () => {
  const reviewer = "synthetic-racing-reviewer";
  await db.insert(assessmentReviewerGrantsTable).values({ clerkId: reviewer, enabled: true, operatorLabel: "disposable-test" });
  const client = await pool.connect();
  let pending: Promise<Response> | undefined;
  try {
    await client.query("BEGIN");
    await client.query("SELECT clerk_id FROM mateen_assessment_reviewer_grants WHERE clerk_id = $1 FOR UPDATE", [reviewer]);
    pending = fetch(`${baseUrl}/mateen/assessment/reviewer/${attemptId}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": reviewer },
      body: JSON.stringify({
        questionId, transcript: "verified fixture", technicalIssue: null,
        attestCompleteRecording: true, attestAudioReviewed: true, attestReferenceAccurate: true,
      }),
    });
    // The initial non-locking authorization sees the enabled committed grant;
    // the decision transaction must wait, then read the revoked value.
    let blocked = false;
    for (let i = 0; i < 50; i++) {
      const waiting = await client.query<{ count: string }>(
        "SELECT count(*) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE '%mateen_assessment_reviewer_grants%'",
      );
      if (Number(waiting.rows[0].count) > 0) { blocked = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(blocked, true);
    await client.query("UPDATE mateen_assessment_reviewer_grants SET enabled = false WHERE clerk_id = $1", [reviewer]);
    await client.query("COMMIT");
    const response = await pending;
    assert.equal(response.status, 403);
    const [answer] = await db.select().from(assessmentAnswersTable).where(eq(assessmentAnswersTable.attemptId, attemptId));
    assert.equal(answer.reviewedBy, null);
    assert.equal(answer.score, null);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pending;
  }
});

test("review queue excludes self and active attempts before limiting, with overdue targets", async () => {
  await db.insert(assessmentReviewerGrantsTable).values({ clerkId: ownerId, enabled: true, operatorLabel: "disposable-test" });
  // More than a page of self-owned answers must not hide independent work.
  const submittedAt = new Date(Date.now() - 49 * 3_600_000);
  for (let i = 0; i < 7; i++) {
    const selfAttempt = crypto.randomUUID();
    await db.insert(assessmentAttemptsTable).values({
      id: selfAttempt, userId: ownerId, status: "submitted", sourceVersion: "test",
      canonicalHash: "test", policySnapshot: {}, questionsSnapshot: [], sessionId, submittedAt,
    });
    await db.insert(assessmentAnswersTable).values(Array.from({ length: 15 }, (_, j) => ({
      id: crypto.randomUUID(), attemptId: selfAttempt, userId: ownerId, questionId: crypto.randomUUID(),
      position: j + 16, kind: "oral", hadithNumber: 1, prompt: "fixture", referenceText: "fixture",
      audioAvailable: true, status: "pending",
    })));
  }
  await db.update(assessmentAnswersTable).set({ audioAvailable: true })
    .where(eq(assessmentAnswersTable.attemptId, attemptId));
  const selfQueue = await fetch(`${baseUrl}/mateen/assessment/reviewer/queue`);
  assert.deepEqual(await selfQueue.json(), []);
  const otherAttemptId = crypto.randomUUID();
  const otherOwner = "synthetic-independent-student";
  await db.insert(assessmentAttemptsTable).values({
    id: otherAttemptId, userId: otherOwner, status: "submitted", sourceVersion: "test",
    canonicalHash: "test", policySnapshot: {}, questionsSnapshot: [], sessionId,
    submittedAt,
  });
  await db.insert(assessmentAnswersTable).values({
    id: crypto.randomUUID(), attemptId: otherAttemptId, userId: otherOwner, questionId: crypto.randomUUID(),
    position: 16, kind: "oral", hadithNumber: 1, prompt: "fixture", referenceText: "fixture",
    audioAvailable: true, status: "pending",
  });
  const queue = await fetch(`${baseUrl}/mateen/assessment/reviewer/queue`);
  assert.equal(queue.status, 200);
  const rows = await queue.json() as Array<{ attemptId: string; pendingAnswers: number; overdue: boolean; reviewDueAt: string }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].attemptId, otherAttemptId);
  assert.equal(rows[0].pendingAnswers, 1);
  assert.equal(rows[0].overdue, true);
  assert.equal(new Date(rows[0].reviewDueAt).getTime(), submittedAt.getTime() + 48 * 3_600_000);
  const [attempt] = await db.select().from(assessmentAttemptsTable).where(eq(assessmentAttemptsTable.id, otherAttemptId));
  assert.equal(attempt.result, null);
  assert.equal(attempt.status, "submitted");
  const reviewer = "synthetic-independent-reviewer";
  await db.insert(assessmentReviewerGrantsTable).values({ clerkId: reviewer, enabled: true, operatorLabel: "disposable-test" });
  const independentQueue = await fetch(`${baseUrl}/mateen/assessment/reviewer/queue`, { headers: { "x-test-user": reviewer } });
  const independentRows = await independentQueue.json() as Array<{ attemptId: string }>;
  assert.equal(independentRows.length, 8);
  assert.equal(independentRows.some((row) => row.attemptId === attemptId), false);
  await db.delete(assessmentAnswersTable).where(eq(assessmentAnswersTable.attemptId, otherAttemptId));
  await db.delete(assessmentAttemptsTable).where(eq(assessmentAttemptsTable.id, otherAttemptId));
});

async function requestAudio(sizeBytes = 20) {
  return fetch(`${baseUrl}/mateen/assessments/${attemptId}/answers/${questionId}/audio`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId,
      sequence: 1,
      contentType: "audio/webm;codecs=opus",
      sizeBytes,
      durationSeconds: 1,
      consent: true,
    }),
  });
}

async function confirmAudio() {
  return fetch(`${baseUrl}/mateen/assessments/${attemptId}/answers/${questionId}/audio/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, sequence: 1 }),
  });
}

async function getAnswer() {
  const [answer] = await db.select().from(assessmentAnswersTable)
    .where(and(
      eq(assessmentAnswersTable.attemptId, attemptId),
      eq(assessmentAnswersTable.questionId, questionId),
    ))
    .limit(1);
  assert.ok(answer);
  return answer;
}

test("pending upload allocation replays the same key and expiry, rejecting conflicting payloads", async () => {
  const first = await requestAudio();
  assert.equal(first.status, 201);
  const firstBody = await first.json() as { uploadUrl: string; expiresAt: string };
  const second = await requestAudio();
  assert.equal(second.status, 200);
  const secondBody = await second.json() as { uploadUrl: string; expiresAt: string };
  assert.equal(secondBody.uploadUrl, firstBody.uploadUrl);
  assert.equal(secondBody.expiresAt, firstBody.expiresAt);
  assert.equal(assessmentAudioTestState.signedUrls.length, 2);
  assert.deepEqual(
    assessmentAudioTestState.signedUrls.map((signed) => signed.path),
    [assessmentAudioTestState.signedUrls[0].path, assessmentAudioTestState.signedUrls[0].path],
  );
  assert.equal(assessmentAudioTestState.signedUrls[1].expiresAt, assessmentAudioTestState.signedUrls[0].expiresAt);
  const answer = await getAnswer();
  assert.equal(answer.uploadStoragePath, assessmentAudioTestState.signedUrls[0].path);
  assert.equal(answer.uploadExpiresAt?.toISOString(), firstBody.expiresAt);

  const conflicting = await requestAudio(21);
  assert.equal(conflicting.status, 409);
  assert.equal(assessmentAudioTestState.signedUrls.length, 2);
  assert.equal((await getAnswer()).uploadStoragePath, answer.uploadStoragePath);
});

test("cancelling an incomplete allocation keeps its signed key cleanup durable and allows a fresh key", async () => {
  const firstAllocation = await requestAudio();
  assert.equal(firstAllocation.status, 201);
  const firstAnswer = await getAnswer();
  assert.ok(firstAnswer.uploadStoragePath);

  const cancelled = await fetch(
    `${baseUrl}/mateen/assessments/${attemptId}/answers/${questionId}/audio`,
    { method: "DELETE" },
  );
  assert.equal(cancelled.status, 204);
  const cancelledAnswer = await getAnswer();
  assert.equal(cancelledAnswer.pendingAudioSequence, null);
  assert.equal(cancelledAnswer.uploadStoragePath, null);
  assert.equal(cancelledAnswer.audioDeletedAt, null);
  assert.equal(cancelledAnswer.audioDeletePending, false);
  const attempt = await db.select().from(assessmentAttemptsTable)
    .where(eq(assessmentAttemptsTable.id, attemptId)).limit(1);
  assert.equal(attempt[0]?.status, "in_progress");
  const uploadObligation = await db.select().from(assessmentAudioUploadCleanupOutboxTable)
    .where(eq(assessmentAudioUploadCleanupOutboxTable.objectPath, firstAnswer.uploadStoragePath));
  assert.equal(uploadObligation[0]?.state, "pending");
  assert.ok(uploadObligation[0]!.leaseExpiresAt > new Date());

  const replacement = await requestAudio();
  assert.equal(replacement.status, 201);
  const replacementAnswer = await getAnswer();
  assert.notEqual(replacementAnswer.uploadStoragePath, firstAnswer.uploadStoragePath);

  const cancelledReplacement = await fetch(
    `${baseUrl}/mateen/assessments/${attemptId}/answers/${questionId}/audio`,
    { method: "DELETE" },
  );
  assert.equal(cancelledReplacement.status, 204);
  const sourceCleanupRows = await db.select().from(assessmentAudioUploadCleanupOutboxTable)
    .where(and(
      eq(assessmentAudioUploadCleanupOutboxTable.attemptId, attemptId),
      eq(assessmentAudioUploadCleanupOutboxTable.questionId, questionId),
    ));
  assert.equal(sourceCleanupRows.length, 2);
  assert.notEqual(sourceCleanupRows[0]?.objectPath, sourceCleanupRows[1]?.objectPath);
});

test("confirm retries are idempotent and do not refreeze or overwrite confirmed audio", async () => {
  const allocation = await requestAudio();
  assert.equal(allocation.status, 201);
  const answer = await getAnswer();
  assert.ok(answer.uploadStoragePath);
  assessmentAudioTestState.uploadObjects.set(answer.uploadStoragePath, Buffer.alloc(20, 0x41));

  const first = await confirmAudio();
  assert.equal(first.status, 200);
  const firstBody = await first.json() as { acknowledged: boolean; audioReceived: boolean };
  assert.deepEqual(firstBody, { questionId, sequence: 1, acknowledged: true, audioReceived: true });
  const confirmed = await getAnswer();
  assert.ok(confirmed.storagePath);
  const storedBytes = assessmentAudioTestState.frozenObjects.get(confirmed.storagePath);
  assert.ok(storedBytes);

  const retry = await confirmAudio();
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), firstBody);
  assert.equal(assessmentAudioTestState.validationCalls, 1);
  assert.deepEqual(assessmentAudioTestState.writerInvocationPaths, [confirmed.storagePath]);
  assert.deepEqual(assessmentAudioTestState.frozenObjects.get(confirmed.storagePath), storedBytes);
  assert.equal(confirmed.status, "pending");
  assert.equal(confirmed.score, null);
  const attemptAfterRetry = await db.select().from(assessmentAttemptsTable)
    .where(eq(assessmentAttemptsTable.id, attemptId)).limit(1);
  assert.equal(attemptAfterRetry[0]?.status, "in_progress");
  assert.equal(attemptAfterRetry[0]?.result, null);
  assert.equal(confirmed.frozenReservationPath, null);
  assert.equal((await db.select().from(assessmentAudioCleanupOutboxTable)
    .where(eq(assessmentAudioCleanupOutboxTable.objectPath, confirmed.storagePath))).length, 0);
});

test("a failed frozen write keeps its reservation and cleanup retries deletion after restart", async () => {
  const allocation = await requestAudio();
  assert.equal(allocation.status, 201);
  const answer = await getAnswer();
  assert.ok(answer.uploadStoragePath);
  assessmentAudioTestState.uploadObjects.set(answer.uploadStoragePath, Buffer.alloc(20, 0x42));
  assessmentAudioTestState.failValidationAfterWrite = true;

  const failedConfirm = await confirmAudio();
  assert.equal(failedConfirm.status, 409);
  const failed = await getAnswer();
  assert.ok(failed.frozenReservationPath);
  assert.ok(failed.frozenReservationExpiresAt);
  assert.equal(failed.frozenReservationSequence, 1);
  assert.equal(failed.storagePath, null);
  assert.equal(failed.audioAvailable, false);
  assert.equal(failed.status, "pending");
  assert.equal(failed.score, null);
  const attemptAfterFailedWrite = await db.select().from(assessmentAttemptsTable)
    .where(eq(assessmentAttemptsTable.id, attemptId)).limit(1);
  assert.equal(attemptAfterFailedWrite[0]?.status, "in_progress");
  assert.equal(attemptAfterFailedWrite[0]?.result, null);
  assert.ok(assessmentAudioTestState.frozenObjects.has(failed.frozenReservationPath));
  assert.deepEqual(assessmentAudioTestState.writerInvocationPaths, [failed.frozenReservationPath]);

  // The failed HTTP work has settled and left no in-memory validation job. Waiting
  // beyond the test-only grace interval models a process restart/orphan recovery.
  await new Promise((resolve) => setTimeout(resolve, 300));
  assessmentAudioTestState.failDeletesRemaining = 1;
  await cleanupExpiredAssessmentAudio();
  const afterDeleteFailure = await getAnswer();
  assert.equal(afterDeleteFailure.frozenReservationPath, failed.frozenReservationPath);
  assert.equal(afterDeleteFailure.frozenReservationCleanupPending, true);
  const failedObligation = await db.select().from(assessmentAudioCleanupOutboxTable)
    .where(eq(assessmentAudioCleanupOutboxTable.objectPath, failed.frozenReservationPath));
  assert.equal(failedObligation[0]?.state, "cleanup_pending");
  assert.ok(assessmentAudioTestState.frozenObjects.has(failed.frozenReservationPath));

  // The obligation is intentionally independent of an assessment-answer FK:
  // cancellation/replacement may remove the row before a later retry succeeds.
  await db.delete(assessmentAnswersTable).where(eq(assessmentAnswersTable.id, failed.id));
  await cleanupExpiredAssessmentAudio();
  assert.equal(assessmentAudioTestState.frozenObjects.has(failed.frozenReservationPath), false);
  assert.equal((await db.select().from(assessmentAudioCleanupOutboxTable)
    .where(eq(assessmentAudioCleanupOutboxTable.objectPath, failed.frozenReservationPath))).length, 0);
});