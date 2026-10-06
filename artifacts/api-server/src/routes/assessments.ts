import { randomUUID } from "node:crypto";
import { finishDailyReview } from "../lib/daily-plan-review-completion";
import { Router, type Response } from "express";
import {
  AdjudicateAssessmentOralBody,
  AdjudicateAssessmentOralParams,
  AdjudicateAssessmentOralResponse,
  CompleteScheduledReviewBody,
  CompleteScheduledReviewParams,
  CompleteScheduledReviewResponse,
  ConfirmAssessmentAudioBody,
  ConfirmAssessmentAudioParams,
  ConfirmAssessmentAudioResponse,
  DeleteAssessmentAudioParams,
  GetAssessmentParams,
  GetAssessmentPolicyResponse,
  GetAssessmentCoverageResponse,
  GetAssessmentResponse,
  GetAssessmentReviewerAccessResponse,
  GetAssessmentReviewParams,
  GetAssessmentReviewResponse,
  GetAssessmentSummaryResponse,
  GetAssessmentReviewAudioParams,
  HeartbeatAssessmentBody,
  HeartbeatAssessmentParams,
  HeartbeatAssessmentResponse,
  ListAssessmentReviewQueueResponse,
  ListScheduledReviewsResponse,
  RequestAssessmentAudioBody,
  RequestAssessmentAudioParams,
  RequestAssessmentAudioResponse,
  SaveAssessmentAnswerBody,
  SaveAssessmentAnswerParams,
  SaveAssessmentAnswerResponse,
  StartAssessmentBody,
  StartAssessmentResponse,
  SubmitAssessmentBody,
  SubmitAssessmentParams,
  SubmitAssessmentResponse,
} from "@workspace/api-zod";
import {
  assessmentAnswersTable,
  assessmentAttemptsTable,
  assessmentReviewerGrantsTable,
  assessmentAuditEventsTable,
  assessmentAudioCleanupOutboxTable,
  assessmentAudioUploadCleanupOutboxTable,
  db,
  profilesTable,
  scheduledReviewsTable,
} from "@workspace/db";
import { and, count, desc, eq, gt, inArray, isNotNull, isNull, lt, lte, ne, or } from "drizzle-orm";
import { authenticationRequired, mutationOriginProtection, rateLimit, requireProfile, type AuthedRequest } from "../lib/mateen-auth";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  AUDIO_MAX_BYTES,
  AUDIO_MAX_DURATION_SECONDS,
  AUDIO_FROZEN_RESERVATION_GRACE_MS,
  AUDIO_FROZEN_WRITE_LEASE_MS,
  AUDIO_RETENTION_MS,
  AUDIO_UPLOAD_EXPIRY_SKEW_MS,
  AUDIO_UPLOAD_TTL_MS,
  buildQuestions,
  compareWords,
  policySnapshot,
  passageIdentityKey,
  selectedCanonicalHash,
  scoreExact,
  sourceVersion,
} from "../lib/assessment-policy";
import {
  answerSequenceDisposition,
  auditEvent,
  errorSummary,
  finalizeAttempt,
  getAttemptAnswers,
  hasIncompleteAudio,
  isAttemptActive,
  isTrustedAssessmentReviewer,
  hasAssessmentReviewCoverage,
  ASSESSMENT_REVIEW_RESPONSE_HOURS,
  nextReviewIntervalDays,
  projectAttempt,
  reviewerCanReviewAttempt,
  advanceTrustedActiveClock,
  staleHeartbeat,
} from "../lib/assessment-service";
import { getStorageFile, removeRemoteAudio } from "../lib/recitation-service";
import { canonicalizeContentType } from "../lib/recitation-service";
import {
  createFrozenAssessmentStoragePath,
  validateAssessmentAudio,
} from "../lib/assessment-audio-validation";
import {
  assessmentAudioValidationJobId,
  cancelAssessmentAudioValidation,
  isAssessmentAudioValidationActive,
  validateAssessmentAudioQueued,
} from "../lib/assessment-validation-queue";
import { startAssessmentRetentionCleanup } from "../lib/assessment-retention";
import { assessmentAudioCapabilitiesReady } from "../lib/recitation-readiness";

const router = Router();
startAssessmentRetentionCleanup();
const storage = new ObjectStorageService();
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function releaseAssessmentAudioWriteLease(
  attemptId: string,
  questionId: string,
  sequence: number,
  objectPath: string,
): Promise<void> {
  const now = new Date();
  await db.update(assessmentAudioCleanupOutboxTable)
    .set({
      state: "reserved",
      leaseExpiresAt: new Date(now.getTime() + AUDIO_FROZEN_RESERVATION_GRACE_MS),
      updatedAt: now,
    })
    .where(and(
      eq(assessmentAudioCleanupOutboxTable.attemptId, attemptId),
      eq(assessmentAudioCleanupOutboxTable.questionId, questionId),
      eq(assessmentAudioCleanupOutboxTable.sequence, sequence),
      eq(assessmentAudioCleanupOutboxTable.objectPath, objectPath),
      eq(assessmentAudioCleanupOutboxTable.state, "writing"),
    ));
}

function exactKeys(value: unknown, keys: string[]): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}

async function getOwnedAttempt(id: string, userId: string) {
  const [attempt] = await db.select().from(assessmentAttemptsTable)
    .where(and(eq(assessmentAttemptsTable.id, id), eq(assessmentAttemptsTable.userId, userId)))
    .limit(1);
  return attempt;
}

async function attemptResponse(attempt: NonNullable<Awaited<ReturnType<typeof getOwnedAttempt>>>, sessionId: string | null) {
  return projectAttempt(attempt, await getAttemptAnswers(attempt.id), sessionId);
}

function ownerSession(attempt: { sessionId: string }, sessionId: string | null): boolean {
  return Boolean(sessionId && sessionId === attempt.sessionId);
}

async function requireStudent(req: AuthedRequest, res: Response): Promise<boolean> {
  return Boolean(await requireProfile(req, res, "student"));
}

async function requireReviewer(req: AuthedRequest, res: Response): Promise<boolean> {
  const userId = req.mateenUserId!;
  if (!(await isTrustedAssessmentReviewer(userId))) {
    res.status(403).json({ error: "An enabled assessment reviewer grant is required." });
    return false;
  }
  return true;
}

function sessionIdFromHeader(req: AuthedRequest): string | null {
  const sessionId = req.get("x-assessment-session");
  return sessionId && ID.test(sessionId) ? sessionId : null;
}

router.use(rateLimit(120, 60_000));

function registerAssessmentStartRoutes() {
router.get("/mateen/assessment/policy", (_req, res) => {
  res.json(GetAssessmentPolicyResponse.parse(policySnapshot));
});

router.post(
  "/mateen/assessments",
  mutationOriginProtection,
  rateLimit(15, 60_000),
  authenticationRequired,
  async (req: AuthedRequest, res): Promise<void> => {
    if (!(await requireStudent(req, res))) return;
    if (!(await assessmentAudioCapabilitiesReady())) {
      res.status(503).json({ error: "Human oral assessment audio validation is unavailable; no attempt was started." });
      return;
    }
    if (!exactKeys(req.body, ["sessionId"]) || !StartAssessmentBody.safeParse(req.body).success) {
      res.status(400).json({ error: "Provide a valid sessionId." });
      return;
    }
    const { sessionId } = StartAssessmentBody.parse(req.body);
    const outcome = await db.transaction(async (tx) => {
      await tx.select({ clerkId: profilesTable.clerkId })
        .from(profilesTable)
        .where(eq(profilesTable.clerkId, req.mateenUserId!))
        .for("update")
        .limit(1);
      const active = await tx.select().from(assessmentAttemptsTable)
        .where(and(
          eq(assessmentAttemptsTable.userId, req.mateenUserId!),
          inArray(assessmentAttemptsTable.status, ["in_progress", "paused_connection"]),
        ))
        .orderBy(desc(assessmentAttemptsTable.createdAt))
        .limit(1)
        .for("update");
      if (active[0]) {
        if (active[0].sessionId !== sessionId) return { kind: "lease" as const };
        if (active[0].status === "paused_connection") {
          const [resumed] = await tx.update(assessmentAttemptsTable)
            .set({ status: "in_progress", lastHeartbeatAt: new Date(), lastTrustedAt: new Date(), updatedAt: new Date() })
            .where(eq(assessmentAttemptsTable.id, active[0].id))
            .returning();
          return { kind: "resumed" as const, attempt: resumed };
        }
        return { kind: "resumed" as const, attempt: active[0] };
      }
      const latestFailed = await tx.select().from(assessmentAttemptsTable)
        .where(and(
          eq(assessmentAttemptsTable.userId, req.mateenUserId!),
          eq(assessmentAttemptsTable.status, "failed"),
          gt(assessmentAttemptsTable.retryAvailableAt, new Date()),
        ))
        .orderBy(desc(assessmentAttemptsTable.createdAt))
        .limit(1)
        .for("update");
      const failed = latestFailed[0];
      if (failed?.retryAvailableAt && failed.retryAvailableAt > new Date()) {
        return { kind: "cooldown" as const, retryAvailableAt: failed.retryAvailableAt };
      }
      // A shared lock serializes admission with explicit grant revocation.
      // Existing attempts may resume even if coverage is subsequently withdrawn.
      const [coverage] = await tx.select({ clerkId: assessmentReviewerGrantsTable.clerkId })
        .from(assessmentReviewerGrantsTable)
        .where(and(
          eq(assessmentReviewerGrantsTable.enabled, true),
          ne(assessmentReviewerGrantsTable.clerkId, req.mateenUserId!),
        )).limit(1).for("share");
      if (!coverage) return { kind: "uncovered" as const };
      const id = randomUUID();
      const questions = buildQuestions();
      const attemptHash = selectedCanonicalHash(questions);
      const attemptPolicy = { ...policySnapshot, canonicalHash: attemptHash };
      const now = new Date();
      const [attempt] = await tx.insert(assessmentAttemptsTable).values({
        id,
        userId: req.mateenUserId!,
        status: "in_progress",
        sourceVersion,
        canonicalHash: attemptHash,
        policySnapshot: attemptPolicy,
        questionsSnapshot: questions,
        sessionId,
        activeSeconds: 0,
        currentQuestionPosition: 0,
        lastHeartbeatAt: now,
        lastTrustedAt: now,
      }).returning();
      await tx.insert(assessmentAnswersTable).values(questions.map((question) => ({
        id: randomUUID(),
        attemptId: id,
        userId: req.mateenUserId!,
        questionId: question.id,
        position: question.position,
        kind: question.kind,
        hadithNumber: question.hadithNumber,
        prompt: question.prompt,
        referenceText: question.referenceText,
        status: "pending",
      })));
      await tx.insert(assessmentAuditEventsTable).values({
        id: randomUUID(), attemptId: id, actorId: req.mateenUserId!, eventType: "assessment_started",
        payload: { sourceVersion, canonicalHash: attemptHash, policySnapshot: attemptPolicy, questions }, createdAt: now,
      });
      return { kind: "created" as const, attempt };
    });
    if (outcome.kind === "uncovered") {
      res.status(503).json({ error: "لا توجد تغطية مخوّلة للمراجعة البشرية الآن؛ لم يبدأ الاختبار ولم تُسجّل درجة. يمكنك مواصلة التدريب التجريبي." });
      return;
    }
    if (outcome.kind === "lease") {
      res.status(409).json({ error: "This assessment attempt is leased to another browser session." });
      return;
    }
    if (outcome.kind === "cooldown") {
      res.status(409).json({ error: "A failed attempt may be retried after the server-calculated cooldown.", retryAvailableAt: outcome.retryAvailableAt });
      return;
    }
    const payload = await attemptResponse(outcome.attempt, sessionId);
    res.status(outcome.kind === "created" ? 201 : 200).json(StartAssessmentResponse.parse(payload));
  },
);

}

function registerAssessmentAnswerRoutes() {
router.post(
  "/mateen/assessments/:attemptId/heartbeat",
  mutationOriginProtection,
  rateLimit(120, 60_000),
  authenticationRequired,
  async (req: AuthedRequest, res): Promise<void> => {
    if (!(await requireStudent(req, res))) return;
    const params = HeartbeatAssessmentParams.safeParse(req.params);
    const body = HeartbeatAssessmentBody.safeParse(req.body);
    if (!params.success || !body.success || !exactKeys(req.body, ["sessionId", "currentQuestionPosition"])) {
      res.status(400).json({ error: "Invalid heartbeat checkpoint." });
      return;
    }
    const now = new Date();
    const outcome = await db.transaction(async (tx) => {
      const [attempt] = await tx.select().from(assessmentAttemptsTable)
        .where(and(
          eq(assessmentAttemptsTable.id, params.data.attemptId),
          eq(assessmentAttemptsTable.userId, req.mateenUserId!),
        ))
        .for("update")
        .limit(1);
      if (!attempt) return { kind: "missing" as const };
      if (!ownerSession(attempt, body.data.sessionId)) return { kind: "lease" as const };
      if (!isAttemptActive(attempt.status)) return { kind: "inactive" as const, attempt };
      if (attempt.status === "paused_connection") {
        const [resumed] = await tx.update(assessmentAttemptsTable)
          .set({
            status: "in_progress",
            lastHeartbeatAt: now,
            lastTrustedAt: now,
            currentQuestionPosition: body.data.currentQuestionPosition,
            updatedAt: now,
          })
          .where(eq(assessmentAttemptsTable.id, attempt.id))
          .returning();
        return { kind: "resumed" as const, attempt: resumed };
      }
      if (staleHeartbeat(attempt, now.getTime())) {
        const [paused] = await tx.update(assessmentAttemptsTable)
          .set({ status: "paused_connection", lastHeartbeatAt: null, updatedAt: now })
          .where(and(eq(assessmentAttemptsTable.id, attempt.id), eq(assessmentAttemptsTable.status, "in_progress")))
          .returning();
        await tx.insert(assessmentAuditEventsTable).values({
          id: randomUUID(), attemptId: attempt.id, actorId: req.mateenUserId!,
          eventType: "connection_paused", payload: { trustedActiveSeconds: attempt.activeSeconds }, createdAt: now,
        });
        return { kind: "paused" as const, attempt: paused ?? attempt };
      }
      const clock = advanceTrustedActiveClock(attempt, now.getTime());
      const activeSeconds = clock.activeSeconds;
      const autoSubmit = clock.atLimit;
      const [updated] = await tx.update(assessmentAttemptsTable)
        .set({
          activeSeconds,
          activeMilliseconds: clock.activeMilliseconds,
          currentQuestionPosition: body.data.currentQuestionPosition,
          status: autoSubmit ? "submitted" : "in_progress",
          submittedAt: autoSubmit ? now : null,
          submitMutationId: autoSubmit ? randomUUID() : null,
          lastHeartbeatAt: autoSubmit ? null : now,
          lastTrustedAt: now,
          updatedAt: now,
        })
        .where(and(eq(assessmentAttemptsTable.id, attempt.id), eq(assessmentAttemptsTable.status, "in_progress")))
        .returning();
      return { kind: autoSubmit ? "timeout" as const : "updated" as const, attempt: updated ?? attempt };
    });
    if (outcome.kind === "missing") {
      res.status(404).json({ error: "Assessment attempt not found." });
      return;
    }
    if (outcome.kind === "lease") {
      res.status(409).json({ error: "This browser session does not hold the assessment lease." });
      return;
    }
    if (outcome.kind === "inactive") {
      res.status(409).json({ error: "This assessment is no longer active." });
      return;
    }
    let attempt = outcome.attempt;
    if (outcome.kind === "timeout") {
      const answers = await getAttemptAnswers(attempt.id);
      if (hasIncompleteAudio(answers)) {
        const [updated] = await db.update(assessmentAttemptsTable)
          .set({ status: "technical_review", updatedAt: now })
          .where(eq(assessmentAttemptsTable.id, attempt.id)).returning();
        attempt = updated ?? attempt;
      } else {
        const result = await finalizeAttempt(attempt, answers, "system:assessment-timeout", now);
        if (result.kind === "final" || result.kind === "technical_review") attempt = result.attempt;
      }
    }
    res.json(HeartbeatAssessmentResponse.parse(await attemptResponse(attempt, body.data.sessionId)));
  },
);

router.put(
  "/mateen/assessments/:attemptId/answers/:questionId",
  mutationOriginProtection,
  rateLimit(120, 60_000),
  authenticationRequired,
  async (req: AuthedRequest, res): Promise<void> => {
    if (!(await requireStudent(req, res))) return;
    const params = SaveAssessmentAnswerParams.safeParse(req.params);
    const body = SaveAssessmentAnswerBody.safeParse(req.body);
    if (!params.success || !body.success || !exactKeys(req.body, ["sessionId", "sequence", "mutationId", "writtenAnswer"])) {
      res.status(400).json({ error: "Invalid answer sequence." });
      return;
    }
    const now = new Date();
    const outcome = await db.transaction(async (tx) => {
      const [attempt] = await tx.select().from(assessmentAttemptsTable)
        .where(and(eq(assessmentAttemptsTable.id, params.data.attemptId), eq(assessmentAttemptsTable.userId, req.mateenUserId!)))
        .for("update").limit(1);
      if (!attempt) return { kind: "missing" as const };
      if (!ownerSession(attempt, body.data.sessionId)) return { kind: "lease" as const };
      if (attempt.status !== "in_progress") return { kind: "inactive" as const };
      if (staleHeartbeat(attempt, now.getTime())) {
        await tx.update(assessmentAttemptsTable)
          .set({ status: "paused_connection", lastHeartbeatAt: null, updatedAt: now })
          .where(eq(assessmentAttemptsTable.id, attempt.id));
        return { kind: "paused" as const };
      }
      const [answer] = await tx.select().from(assessmentAnswersTable)
        .where(and(
          eq(assessmentAnswersTable.attemptId, attempt.id),
          eq(assessmentAnswersTable.questionId, params.data.questionId),
        ))
        .for("update").limit(1);
      if (!answer || answer.kind !== "written") return { kind: "question" as const };
      const disposition = answerSequenceDisposition({
        savedSequence: answer.answerSequence,
        savedMutationId: answer.lastMutationId,
        savedAnswer: answer.writtenAnswer,
        requestedSequence: body.data.sequence,
        requestedMutationId: body.data.mutationId,
        requestedAnswer: body.data.writtenAnswer,
      });
      if (disposition === "replay") return { kind: "ack" as const, answer };
      if (disposition !== "next") return { kind: "sequence" as const };
      const [updated] = await tx.update(assessmentAnswersTable)
        .set({
          writtenAnswer: body.data.writtenAnswer,
          answerSequence: body.data.sequence,
          lastMutationId: body.data.mutationId,
          updatedAt: now,
        })
        .where(and(eq(assessmentAnswersTable.id, answer.id), eq(assessmentAnswersTable.answerSequence, answer.answerSequence)))
        .returning();
      if (!updated) return { kind: "sequence" as const };
      await tx.insert(assessmentAuditEventsTable).values({
        id: randomUUID(), attemptId: attempt.id, actorId: req.mateenUserId!, eventType: "written_answer_saved",
        payload: { questionId: answer.questionId, sequence: body.data.sequence, mutationId: body.data.mutationId },
        createdAt: now,
      });
      return { kind: "ack" as const, answer: updated };
    });
    if (outcome.kind === "missing") {
      res.status(404).json({ error: "Assessment attempt not found." });
      return;
    }
    if (outcome.kind === "question") {
      res.status(404).json({ error: "Written assessment question not found." });
      return;
    }
    if (outcome.kind !== "ack") {
      res.status(409).json({ error: `Assessment answer was not accepted (${outcome.kind}).` });
      return;
    }
    res.json(SaveAssessmentAnswerResponse.parse({
      questionId: outcome.answer.questionId,
      sequence: outcome.answer.answerSequence,
      acknowledged: true,
      audioReceived: false,
    }));
  },
);

router.post(
  "/mateen/assessments/:attemptId",
  mutationOriginProtection,
  rateLimit(15, 60_000),
  authenticationRequired,
  async (req: AuthedRequest, res): Promise<void> => {
    if (!(await requireStudent(req, res))) return;
    const params = SubmitAssessmentParams.safeParse(req.params);
    const body = SubmitAssessmentBody.safeParse(req.body);
    if (!params.success || !body.success || !exactKeys(req.body, ["sessionId", "mutationId"])) {
      res.status(400).json({ error: "Invalid assessment submission." });
      return;
    }
    const now = new Date();
    const outcome = await db.transaction(async (tx) => {
      const [attempt] = await tx.select().from(assessmentAttemptsTable)
        .where(and(eq(assessmentAttemptsTable.id, params.data.attemptId), eq(assessmentAttemptsTable.userId, req.mateenUserId!)))
        .for("update").limit(1);
      if (!attempt) return { kind: "missing" as const };
      if (!ownerSession(attempt, body.data.sessionId)) return { kind: "lease" as const };
      if (attempt.submitMutationId === body.data.mutationId && attempt.status !== "in_progress") {
        return { kind: "replay" as const, attempt };
      }
      if (attempt.status !== "in_progress") return { kind: "inactive" as const };
      if (staleHeartbeat(attempt, now.getTime())) {
        const [paused] = await tx.update(assessmentAttemptsTable)
          .set({ status: "paused_connection", lastHeartbeatAt: null, updatedAt: now })
          .where(eq(assessmentAttemptsTable.id, attempt.id)).returning();
        return { kind: "paused" as const, attempt: paused ?? attempt };
      }
      const clock = advanceTrustedActiveClock(attempt, now.getTime());
      const [submitted] = await tx.update(assessmentAttemptsTable)
        .set({
          status: "submitted",
          activeSeconds: clock.activeSeconds,
          activeMilliseconds: clock.activeMilliseconds,
          submittedAt: now,
          submitMutationId: body.data.mutationId,
          lastHeartbeatAt: null,
          updatedAt: now,
        })
        .where(and(eq(assessmentAttemptsTable.id, attempt.id), eq(assessmentAttemptsTable.status, "in_progress")))
        .returning();
      await tx.insert(assessmentAuditEventsTable).values({
        id: randomUUID(), attemptId: attempt.id, actorId: req.mateenUserId!, eventType: "assessment_submitted",
        payload: { mutationId: body.data.mutationId, activeSeconds: submitted.activeSeconds }, createdAt: now,
      });
      return { kind: "submitted" as const, attempt: submitted ?? attempt };
    });
    if (outcome.kind === "missing") {
      res.status(404).json({ error: "Assessment attempt not found." });
      return;
    }
    if (outcome.kind === "lease") {
      res.status(409).json({ error: "This browser session does not hold the attempt lease." });
      return;
    }
    if (outcome.kind === "paused") {
      res.status(409).json({ error: "The last trusted connection checkpoint was paused; reconnect before submitting." });
      return;
    }
    if (outcome.kind === "inactive") {
      res.status(409).json({ error: "This assessment is not accepting submission." });
      return;
    }
    let attempt = outcome.attempt;
    if (outcome.kind === "submitted") {
      let answers = await getAttemptAnswers(attempt.id);
      const incomplete = answers.filter((answer) =>
        answer.kind === "oral" && answer.expectedSizeBytes !== null &&
        (!answer.audioAvailable || answer.audioDeletePending),
      );
      if (incomplete.length) {
        for (const answer of incomplete) {
          await db.update(assessmentAnswersTable)
            .set({ status: "technical_review", technicalIssue: "An initiated audio recording was incomplete or deleted before submission.", updatedAt: now })
            .where(eq(assessmentAnswersTable.id, answer.id));
        }
        const [updated] = await db.update(assessmentAttemptsTable)
          .set({ status: "technical_review", updatedAt: now })
          .where(eq(assessmentAttemptsTable.id, attempt.id)).returning();
        attempt = updated ?? attempt;
      } else {
        const result = await finalizeAttempt(attempt, answers, req.mateenUserId!, now);
        if (result.kind === "final" || result.kind === "technical_review") attempt = result.attempt;
      }
      answers = await getAttemptAnswers(attempt.id);
    }
    const response = await attemptResponse(attempt, body.data.sessionId);
    res.json(SubmitAssessmentResponse.parse(response));
  },
);

}

function registerAssessmentReviewerRoutes() {
router.get(
  "/mateen/assessment/coverage",
  authenticationRequired,
  async (req: AuthedRequest, res): Promise<void> => {
    res.json(GetAssessmentCoverageResponse.parse({
      available: await hasAssessmentReviewCoverage(req.mateenUserId!),
      responseHours: ASSESSMENT_REVIEW_RESPONSE_HOURS,
    }));
  },
);
router.get(
  "/mateen/assessment/reviewer-access",
  authenticationRequired,
  async (req: AuthedRequest, res): Promise<void> => {
    res.json(GetAssessmentReviewerAccessResponse.parse({
      authorized: await isTrustedAssessmentReviewer(req.mateenUserId!),
    }));
  },
);

router.get(
  "/mateen/assessment/reviewer/queue",
  authenticationRequired,
  async (req: AuthedRequest, res): Promise<void> => {
    if (!(await requireReviewer(req, res))) return;
    // Limit attempts, not answers, after filtering submission and self-review.
    const pending = await db.select({
      attemptId: assessmentAnswersTable.attemptId,
      studentId: assessmentAttemptsTable.userId,
      submittedAt: assessmentAttemptsTable.submittedAt,
      createdAt: assessmentAttemptsTable.createdAt,
      pendingAnswers: count(),
    })
      .from(assessmentAnswersTable)
      .innerJoin(assessmentAttemptsTable, eq(assessmentAnswersTable.attemptId, assessmentAttemptsTable.id))
      .where(and(
        eq(assessmentAnswersTable.kind, "oral"),
        eq(assessmentAnswersTable.status, "pending"),
        eq(assessmentAnswersTable.audioAvailable, true),
        eq(assessmentAnswersTable.audioDeletePending, false),
        isNull(assessmentAnswersTable.audioDeletedAt),
        ne(assessmentAttemptsTable.userId, req.mateenUserId!),
        inArray(assessmentAttemptsTable.status, ["submitted", "technical_review"]),
      ))
      .groupBy(assessmentAnswersTable.attemptId, assessmentAttemptsTable.userId,
        assessmentAttemptsTable.submittedAt, assessmentAttemptsTable.createdAt)
      .orderBy(assessmentAttemptsTable.submittedAt, assessmentAttemptsTable.createdAt)
      .limit(100);
    res.json(ListAssessmentReviewQueueResponse.parse(pending.map((row) => {
      const submittedAt = row.submittedAt ?? row.createdAt;
      const reviewDueAt = new Date(submittedAt.getTime() + ASSESSMENT_REVIEW_RESPONSE_HOURS * 3_600_000);
      return { ...row, submittedAt, reviewDueAt, overdue: reviewDueAt.getTime() <= Date.now() };
    })));
  },
);

router.get(
  "/mateen/assessment/reviewer/:attemptId",
  authenticationRequired,
  async (req: AuthedRequest, res): Promise<void> => {
    if (!(await requireReviewer(req, res))) return;
    const params = GetAssessmentReviewParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid review attempt identifier." });
      return;
    }
    const [attempt] = await db.select().from(assessmentAttemptsTable)
      .where(eq(assessmentAttemptsTable.id, params.data.attemptId)).limit(1);
    if (!attempt) {
      res.status(404).json({ error: "Assessment review not found." });
      return;
    }
    if (!reviewerCanReviewAttempt(req.mateenUserId!, attempt.userId)) {
      res.status(403).json({ error: "Reviewers cannot access their own assessment attempt." });
      return;
    }
    if (!["submitted", "technical_review", "passed", "failed"].includes(attempt.status)) {
      res.status(409).json({ error: "Oral assessment reference is not available before submission." });
      return;
    }
    const answers = await getAttemptAnswers(attempt.id);
    const detail = {
      attemptId: attempt.id,
      sourceVersion: attempt.sourceVersion,
      canonicalHash: attempt.canonicalHash,
      answers: answers.filter((answer) => answer.kind === "oral").map((answer) => ({
        questionId: answer.questionId,
        prompt: answer.prompt,
        referenceText: answer.referenceText,
        audioAvailable: answer.audioAvailable && !answer.audioDeletedAt && !answer.audioDeletePending,
        status: answer.status === "technical_review" ? "technical_review" : answer.status === "scored" ? "scored" : "pending",
      })),
    };
    res.json(GetAssessmentReviewResponse.parse(detail));
  },
);

router.get(
  "/mateen/assessment/reviewer/:attemptId/audio/:questionId",
  authenticationRequired,
  async (req: AuthedRequest, res): Promise<void> => {
    if (!(await requireReviewer(req, res))) return;
    const params = GetAssessmentReviewAudioParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid audio identifiers." });
      return;
    }
    const [attempt] = await db.select().from(assessmentAttemptsTable)
      .where(eq(assessmentAttemptsTable.id, params.data.attemptId))
      .limit(1);
    if (!attempt) {
      res.status(404).json({ error: "Assessment review not found." });
      return;
    }
    if (!reviewerCanReviewAttempt(req.mateenUserId!, attempt.userId)) {
      res.status(403).json({ error: "Reviewers cannot access audio from their own assessment attempt." });
      return;
    }
    if (!["submitted", "technical_review", "passed", "failed"].includes(attempt.status)) {
      res.status(409).json({ error: "Assessment audio is not available for review before submission." });
      return;
    }
    const [answer] = await db.select().from(assessmentAnswersTable)
      .where(and(
        eq(assessmentAnswersTable.attemptId, params.data.attemptId),
        eq(assessmentAnswersTable.questionId, params.data.questionId),
        eq(assessmentAnswersTable.kind, "oral"),
        eq(assessmentAnswersTable.audioAvailable, true),
        eq(assessmentAnswersTable.audioDeletePending, false),
        isNotNull(assessmentAnswersTable.storagePath),
        gt(assessmentAnswersTable.audioExpiresAt, new Date()),
      ))
      .limit(1);
    if (!answer?.storagePath) {
      res.status(404).json({ error: "The private recording is unavailable or past retention." });
      return;
    }
    try {
      const file = await getStorageFile(answer.storagePath);
      const metadata = await file.getMetadata();
      const size = Number(metadata[0].size);
      if (!Number.isSafeInteger(size) || size > AUDIO_MAX_BYTES) {
        res.status(404).json({ error: "The private recording is unavailable." });
        return;
      }
      res.setHeader("Content-Type", answer.expectedContentType ?? "application/octet-stream");
      res.setHeader("Content-Length", size);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      file.createReadStream().on("error", () => {
        if (!res.headersSent) res.status(404).json({ error: "The private recording could not be streamed." });
        else res.destroy();
      }).pipe(res);
    } catch {
      res.status(404).json({ error: "The private recording is unavailable." });
    }
  },
);

}

function registerAssessmentAudioRoutes() {
router.post(
  "/mateen/assessment/reviewer/:attemptId",
  mutationOriginProtection,
  rateLimit(60, 60_000),
  authenticationRequired,
  async (req: AuthedRequest, res): Promise<void> => {
    if (!(await requireReviewer(req, res))) return;
    const params = AdjudicateAssessmentOralParams.safeParse(req.params);
    const body = AdjudicateAssessmentOralBody.safeParse(req.body);
    const expectedKeys = ["questionId", "transcript", "technicalIssue", "attestCompleteRecording", "attestAudioReviewed", "attestReferenceAccurate"];
    if (!params.success || !body.success || !exactKeys(req.body, expectedKeys)) {
      res.status(400).json({ error: "Invalid human review decision." });
      return;
    }
    const input = body.data;
    const hasTranscript = input.transcript !== null && input.transcript.trim().length > 0;
    const hasIssue = input.technicalIssue !== null && input.technicalIssue.trim().length > 0;
    if (hasTranscript === hasIssue) {
      res.status(400).json({ error: "Provide either a verified heard transcript or a technical issue, but not both." });
      return;
    }
    const now = new Date();
    const outcome = await db.transaction(async (tx) => {
      const [grant] = await tx.select({ enabled: assessmentReviewerGrantsTable.enabled })
        .from(assessmentReviewerGrantsTable)
        .where(eq(assessmentReviewerGrantsTable.clerkId, req.mateenUserId!))
        .for("share").limit(1);
      if (!grant?.enabled) return { kind: "revoked" as const };
      const [attempt] = await tx.select().from(assessmentAttemptsTable)
        .where(eq(assessmentAttemptsTable.id, params.data.attemptId))
        .for("update").limit(1);
      if (!attempt) return { kind: "missing" as const };
      if (!reviewerCanReviewAttempt(req.mateenUserId!, attempt.userId)) return { kind: "self_review" as const };
      const [answer] = await tx.select().from(assessmentAnswersTable)
        .where(and(
          eq(assessmentAnswersTable.attemptId, attempt.id),
          eq(assessmentAnswersTable.questionId, input.questionId),
          eq(assessmentAnswersTable.kind, "oral"),
        ))
        .for("update").limit(1);
      if (!answer) return { kind: "question" as const };
      if (answer.status === "scored") {
        if (hasTranscript && answer.verifiedTranscript === input.transcript) return { kind: "replay" as const, attempt };
        return { kind: "conflict" as const };
      }
      if (!answer.audioAvailable || answer.audioDeletePending || answer.audioDeletedAt) return { kind: "audio" as const };
      if (!["submitted", "technical_review"].includes(attempt.status)) return { kind: "conflict" as const };
      if (hasIssue) {
        await tx.update(assessmentAnswersTable)
          .set({
            status: "technical_review",
            technicalIssue: input.technicalIssue!.trim(),
            reviewedBy: req.mateenUserId!,
            reviewedAt: now,
            updatedAt: now,
          })
          .where(eq(assessmentAnswersTable.id, answer.id));
        const [updated] = await tx.update(assessmentAttemptsTable)
          .set({ status: "technical_review", updatedAt: now })
          .where(eq(assessmentAttemptsTable.id, attempt.id)).returning();
        await tx.insert(assessmentAuditEventsTable).values({
          id: randomUUID(), attemptId: attempt.id, actorId: req.mateenUserId!, eventType: "oral_technical_issue",
          payload: {
            questionId: answer.questionId,
            issue: input.technicalIssue!.trim(),
            attestCompleteRecording: true,
            attestAudioReviewed: true,
            attestReferenceAccurate: true,
          },
          createdAt: now,
        });
        return { kind: "technical" as const, attempt: updated ?? attempt };
      }
      const transcript = input.transcript!.trim();
      const score = (await import("../lib/assessment-policy")).scoreExact(answer.referenceText, transcript);
      const differences = (await import("../lib/assessment-policy")).compareWords(answer.referenceText, transcript);
      await tx.update(assessmentAnswersTable)
        .set({
          status: "scored",
          verifiedTranscript: transcript,
          score,
          differences,
          provenance: "human_verified_oral",
          reviewedBy: req.mateenUserId!,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(eq(assessmentAnswersTable.id, answer.id));
      await tx.insert(assessmentAuditEventsTable).values({
        id: randomUUID(), attemptId: attempt.id, actorId: req.mateenUserId!, eventType: "oral_human_adjudication",
        payload: {
          questionId: answer.questionId,
          transcript,
          score,
          differences,
          attestCompleteRecording: true,
          attestAudioReviewed: true,
          attestReferenceAccurate: true,
        },
        createdAt: now,
      });
      if (score === 0) {
        const questionSnapshot = (attempt.questionsSnapshot as Array<{
          id: string;
          sourceSelection?: { windowStartWord?: number };
        }>).find((question) => question.id === answer.questionId);
        if (typeof questionSnapshot?.sourceSelection?.windowStartWord !== "number") {
          throw new Error("The immutable oral passage selection is unavailable for scheduled review.");
        }
        const mistake = errorSummary(answer.referenceText, transcript);
        const dueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        await tx.insert(scheduledReviewsTable).values({
          id: randomUUID(),
          userId: attempt.userId,
          textId: "nawawi",
          hadithNumber: answer.hadithNumber,
          passageKey: passageIdentityKey(
            attempt.sourceVersion,
            answer.hadithNumber,
            questionSnapshot.sourceSelection.windowStartWord,
            answer.referenceText,
          ),
          sourceVersion: attempt.sourceVersion,
          windowStartWord: questionSnapshot.sourceSelection.windowStartWord,
          passagePrompt: answer.prompt,
          referenceText: answer.referenceText,
          sourceAttemptId: attempt.id,
          sourceQuestionId: answer.questionId,
          sourceMistake: mistake,
          intervalDays: 1,
          dueAt,
          lastCorrect: false,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: [scheduledReviewsTable.userId, scheduledReviewsTable.passageKey],
          set: {
            intervalDays: 1,
            dueAt,
            lastCorrect: false,
            completedAt: null,
            lastMutationId: null,
            lastResponse: null,
            lastAnswer: null,
            updatedAt: now,
          },
        });
      }
      return { kind: "scored" as const, attempt };
    });
    if (outcome.kind === "missing") {
      res.status(404).json({ error: "Assessment review not found." });
      return;
    }
    if (outcome.kind === "revoked") {
      res.status(403).json({ error: "Assessment reviewer access was revoked; no decision was saved." });
      return;
    }
    if (outcome.kind === "self_review") {
      res.status(403).json({ error: "Reviewers cannot adjudicate their own assessment attempt." });
      return;
    }
    if (outcome.kind === "question") {
      res.status(404).json({ error: "Oral answer not found." });
      return;
    }
    if (outcome.kind === "audio") {
      res.status(409).json({ error: "The recording is no longer available for verification." });
      return;
    }
    if (outcome.kind === "conflict") {
      res.status(409).json({ error: "The human review decision is immutable or the attempt is not submitted." });
      return;
    }
    let attempt = outcome.attempt;
    if (outcome.kind === "scored") {
      const answers = await getAttemptAnswers(attempt.id);
      const final = await finalizeAttempt(attempt, answers, req.mateenUserId!, now);
      if (final.kind === "final" || final.kind === "technical_review") attempt = final.attempt;
    }
    const result = await attemptResponse(attempt, null);
    res.json(AdjudicateAssessmentOralResponse.parse(result));
  },
);

router.post(
  "/mateen/assessments/:attemptId/answers/:questionId/audio",
  mutationOriginProtection,
  rateLimit(30, 60_000),
  authenticationRequired,
  async (req: AuthedRequest, res): Promise<void> => {
    if (!(await requireStudent(req, res))) return;
    if (!(await assessmentAudioCapabilitiesReady())) {
      res.status(503).json({ error: "Human assessment audio validation is unavailable; no upload URL was issued." });
      return;
    }
    const params = RequestAssessmentAudioParams.safeParse(req.params);
    const body = RequestAssessmentAudioBody.safeParse(req.body);
    if (!params.success || !body.success || !exactKeys(req.body, [
      "sessionId", "sequence", "contentType", "sizeBytes", "durationSeconds", "consent",
    ])) {
      res.status(400).json({ error: "Invalid audio upload request; explicit 30-day retention consent is required." });
      return;
    }
    const contentType = canonicalizeContentType(body.data.contentType);
    if (!contentType || body.data.consent !== true || body.data.durationSeconds > AUDIO_MAX_DURATION_SECONDS) {
      res.status(400).json({ error: "Unsupported audio format, duration, or consent." });
      return;
    }
    const now = new Date();
    let candidateUploadPath: string;
    try {
      candidateUploadPath = storage.createObjectEntityUploadPath();
    } catch {
      res.status(503).json({ error: "Private assessment audio upload is currently unavailable." });
      return;
    }
    const allocation = await db.transaction(async (tx) => {
      const [attempt] = await tx.select().from(assessmentAttemptsTable)
        .where(and(
          eq(assessmentAttemptsTable.id, params.data.attemptId),
          eq(assessmentAttemptsTable.userId, req.mateenUserId!),
        ))
        .for("update").limit(1);
      if (!attempt) return { kind: "missing" as const };
      if (!ownerSession(attempt, body.data.sessionId)) return { kind: "lease" as const };
      if (attempt.status !== "in_progress") return { kind: "inactive" as const };
      if (staleHeartbeat(attempt, now.getTime())) {
        await tx.update(assessmentAttemptsTable)
          .set({ status: "paused_connection", lastHeartbeatAt: null, updatedAt: now })
          .where(eq(assessmentAttemptsTable.id, attempt.id));
        return { kind: "paused" as const };
      }
      const [answer] = await tx.select().from(assessmentAnswersTable)
        .where(and(
          eq(assessmentAnswersTable.attemptId, attempt.id),
          eq(assessmentAnswersTable.questionId, params.data.questionId),
          eq(assessmentAnswersTable.kind, "oral"),
        ))
        .for("update").limit(1);
      if (!answer) return { kind: "question" as const };
      if (answer.audioAvailable) return { kind: "already" as const };
      if (answer.audioDeletePending || answer.audioDeletedAt) return { kind: "deleted" as const };
      if (
        answer.pendingAudioSequence !== null &&
        answer.pendingAudioSequence !== undefined
      ) {
        if (answer.pendingAudioSequence !== body.data.sequence) return { kind: "pending" as const };
        if (
          answer.expectedSizeBytes !== body.data.sizeBytes ||
          answer.expectedContentType !== contentType
        ) return { kind: "payload" as const };
        if (
          !answer.uploadStoragePath ||
          !answer.uploadExpiresAt ||
          answer.uploadExpiresAt <= now
        ) return { kind: "expired" as const };
        return {
          kind: "reuse" as const,
          uploadPath: answer.uploadStoragePath,
          expiresAt: answer.uploadExpiresAt,
        };
      }
      if (
        answer.frozenReservationPath ||
        answer.uploadStoragePath ||
        answer.storagePath ||
        body.data.sequence !== answer.audioSequence + 1
      ) return { kind: "sequence" as const };
      const expiresAt = new Date(now.getTime() + AUDIO_UPLOAD_TTL_MS);
      const [reserved] = await tx.update(assessmentAnswersTable)
        .set({
          uploadStoragePath: candidateUploadPath,
          expectedSizeBytes: body.data.sizeBytes,
          expectedContentType: contentType,
          pendingAudioSequence: body.data.sequence,
          uploadExpiresAt: expiresAt,
          audioAvailable: false,
          actualDurationSeconds: null,
          updatedAt: now,
        })
        .where(and(
          eq(assessmentAnswersTable.id, answer.id),
          eq(assessmentAnswersTable.audioSequence, body.data.sequence - 1),
          isNull(assessmentAnswersTable.pendingAudioSequence),
          isNull(assessmentAnswersTable.uploadStoragePath),
          isNull(assessmentAnswersTable.storagePath),
          isNull(assessmentAnswersTable.frozenReservationPath),
          eq(assessmentAnswersTable.audioAvailable, false),
          eq(assessmentAnswersTable.audioDeletePending, false),
          isNull(assessmentAnswersTable.audioDeletedAt),
        ))
        .returning({ id: assessmentAnswersTable.id });
      if (!reserved) return { kind: "pending" as const };
      await tx.insert(assessmentAuditEventsTable).values({
        id: randomUUID(),
        attemptId: attempt.id,
        actorId: req.mateenUserId!,
        eventType: "assessment_audio_requested",
        payload: {
          questionId: answer.questionId,
          sequence: body.data.sequence,
          sizeBytes: body.data.sizeBytes,
          contentType,
          retentionDays: 30,
          consent: true,
        },
        createdAt: now,
      });
      return { kind: "new" as const, uploadPath: candidateUploadPath, expiresAt };
    });
    if (allocation.kind === "missing") {
      res.status(404).json({ error: "Assessment attempt not found." });
      return;
    }
    if (allocation.kind === "already") {
      res.status(409).json({ error: "This audio sequence is already confirmed." });
      return;
    }
    if (allocation.kind !== "new" && allocation.kind !== "reuse") {
      const status = allocation.kind === "question" ? 404
        : allocation.kind === "lease" || allocation.kind === "inactive" || allocation.kind === "paused" ? 409
          : allocation.kind === "expired" ? 409
            : 409;
      const message = allocation.kind === "expired"
        ? "The reserved upload URL has expired; wait for private cleanup before requesting another."
        : allocation.kind === "payload"
          ? "A different size or media type is already reserved for this sequence."
          : `Audio request was not accepted (${allocation.kind}).`;
      res.status(status).json({ error: message });
      return;
    }
    let uploadUrl: string;
    try {
      uploadUrl = await storage.getObjectEntityUploadURLForPath(
        allocation.uploadPath,
        allocation.expiresAt,
      );
    } catch {
      res.status(503).json({ error: "Private assessment audio upload is currently unavailable." });
      return;
    }
    res.status(allocation.kind === "new" ? 201 : 200).json(RequestAssessmentAudioResponse.parse({
      uploadUrl,
      expiresAt: allocation.expiresAt,
      maxBytes: AUDIO_MAX_BYTES,
      maxDurationSeconds: AUDIO_MAX_DURATION_SECONDS,
      retentionDays: 30,
    }));
  },
);

router.post(
  "/mateen/assessments/:attemptId/answers/:questionId/audio/confirm",
  mutationOriginProtection,
  rateLimit(30, 60_000),
  authenticationRequired,
  async (req: AuthedRequest, res): Promise<void> => {
    if (!(await requireStudent(req, res))) return;
    if (!(await assessmentAudioCapabilitiesReady())) {
      res.status(503).json({ error: "Human assessment audio validation is temporarily unavailable." });
      return;
    }
    const params = ConfirmAssessmentAudioParams.safeParse(req.params);
    const body = ConfirmAssessmentAudioBody.safeParse(req.body);
    if (!params.success || !body.success || !exactKeys(req.body, ["sessionId", "sequence"])) {
      res.status(400).json({ error: "Invalid audio confirmation." });
      return;
    }
    const attempt = await getOwnedAttempt(params.data.attemptId, req.mateenUserId!);
    if (!attempt) {
      res.status(404).json({ error: "Assessment attempt not found." });
      return;
    }
    if (!ownerSession(attempt, body.data.sessionId)) {
      res.status(409).json({ error: "This browser session does not hold the assessment lease." });
      return;
    }
    if (attempt.status !== "in_progress" || staleHeartbeat(attempt)) {
      res.status(409).json({ error: "The assessment connection is paused or inactive." });
      return;
    }
    const [answer] = await db.select().from(assessmentAnswersTable)
      .where(and(
        eq(assessmentAnswersTable.attemptId, attempt.id),
        eq(assessmentAnswersTable.userId, req.mateenUserId!),
        eq(assessmentAnswersTable.questionId, params.data.questionId),
        eq(assessmentAnswersTable.kind, "oral"),
      ))
      .limit(1);
    if (!answer) {
      res.status(404).json({ error: "Oral question not found." });
      return;
    }
    if (answer.audioAvailable && answer.audioSequence === body.data.sequence) {
      res.json(ConfirmAssessmentAudioResponse.parse({
        questionId: answer.questionId, sequence: answer.audioSequence, acknowledged: true, audioReceived: true,
      }));
      return;
    }
    let candidateFrozenPath: string;
    try {
      if (!answer.uploadStoragePath) throw new Error("The upload reservation is missing.");
      candidateFrozenPath = createFrozenAssessmentStoragePath(answer.uploadStoragePath);
    } catch {
      res.status(409).json({ error: "Private audio is missing or has no valid durable upload reservation." });
      return;
    }
    const validationJobId = assessmentAudioValidationJobId(
      attempt.id,
      answer.questionId,
      body.data.sequence,
    );
    const now = new Date();
    const reservation = await db.transaction(async (tx) => {
      const [currentAttempt] = await tx.select().from(assessmentAttemptsTable)
        .where(and(
          eq(assessmentAttemptsTable.id, attempt.id),
          eq(assessmentAttemptsTable.userId, req.mateenUserId!),
        ))
        .for("update").limit(1);
      if (!currentAttempt) return { kind: "missing" as const };
      if (!ownerSession(currentAttempt, body.data.sessionId)) return { kind: "lease" as const };
      if (currentAttempt.status !== "in_progress" || staleHeartbeat(currentAttempt, now.getTime())) {
        return { kind: "inactive" as const };
      }
      const [currentAnswer] = await tx.select().from(assessmentAnswersTable)
        .where(and(
          eq(assessmentAnswersTable.id, answer.id),
          eq(assessmentAnswersTable.attemptId, attempt.id),
          eq(assessmentAnswersTable.userId, req.mateenUserId!),
        ))
        .for("update").limit(1);
      if (!currentAnswer) return { kind: "missing" as const };
      if (
        currentAnswer.audioAvailable &&
        currentAnswer.audioSequence === body.data.sequence
      ) return { kind: "confirmed" as const };
      if (
        currentAnswer.pendingAudioSequence !== body.data.sequence ||
        currentAnswer.audioSequence + 1 !== body.data.sequence ||
        !currentAnswer.uploadStoragePath ||
        currentAnswer.storagePath ||
        currentAnswer.audioDeletePending ||
        currentAnswer.audioDeletedAt ||
        !currentAnswer.expectedSizeBytes ||
        !currentAnswer.expectedContentType ||
        !currentAnswer.uploadExpiresAt ||
        currentAnswer.uploadExpiresAt <= now
      ) return { kind: "invalid" as const };
      if (currentAnswer.frozenReservationPath) {
        if (
          !currentAnswer.frozenReservationCleanupPending &&
          currentAnswer.frozenReservationSequence === body.data.sequence &&
          isAssessmentAudioValidationActive(validationJobId)
        ) {
          return {
            kind: "active" as const,
            answer: currentAnswer,
            frozenStoragePath: currentAnswer.frozenReservationPath,
          };
        }
        return { kind: "reserved" as const };
      }
      const reservationExpiresAt = new Date(now.getTime() + AUDIO_FROZEN_RESERVATION_GRACE_MS);
      const [reserved] = await tx.update(assessmentAnswersTable)
        .set({
          frozenReservationPath: candidateFrozenPath,
          frozenReservationExpiresAt: reservationExpiresAt,
          frozenReservationSequence: body.data.sequence,
          frozenReservationCleanupPending: false,
          updatedAt: now,
        })
        .where(and(
          eq(assessmentAnswersTable.id, currentAnswer.id),
          eq(assessmentAnswersTable.uploadStoragePath, currentAnswer.uploadStoragePath),
          eq(assessmentAnswersTable.pendingAudioSequence, body.data.sequence),
          eq(assessmentAnswersTable.audioSequence, body.data.sequence - 1),
          isNull(assessmentAnswersTable.storagePath),
          isNull(assessmentAnswersTable.frozenReservationPath),
          eq(assessmentAnswersTable.audioAvailable, false),
          eq(assessmentAnswersTable.audioDeletePending, false),
          isNull(assessmentAnswersTable.audioDeletedAt),
        ))
        .returning();
      if (!reserved) return { kind: "reserved" as const };
      await tx.insert(assessmentAudioCleanupOutboxTable).values({
        id: randomUUID(),
        attemptId: attempt.id,
        questionId: currentAnswer.questionId,
        sequence: body.data.sequence,
        objectPath: candidateFrozenPath,
        state: "reserved",
        leaseExpiresAt: reservationExpiresAt,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(assessmentAuditEventsTable).values({
        id: randomUUID(),
        attemptId: attempt.id,
        actorId: req.mateenUserId!,
        eventType: "assessment_audio_freeze_reserved",
        payload: { questionId: currentAnswer.questionId, sequence: body.data.sequence },
        createdAt: now,
      });
      return {
        kind: "reserved-for-us" as const,
        answer: reserved,
        frozenStoragePath: candidateFrozenPath,
      };
    });
    if (reservation.kind === "confirmed") {
      res.json(ConfirmAssessmentAudioResponse.parse({
        questionId: answer.questionId,
        sequence: body.data.sequence,
        acknowledged: true,
        audioReceived: true,
      }));
      return;
    }
    if (reservation.kind !== "reserved-for-us" && reservation.kind !== "active") {
      const status = reservation.kind === "missing" ? 404 : 409;
      const message = reservation.kind === "reserved"
        ? "A prior frozen-write reservation is awaiting cleanup; retry after its bounded reservation window."
        : "Private audio is missing, invalid, expired, or out of sequence.";
      res.status(status).json({ error: message });
      return;
    }
    const controller = new AbortController();
    const abortValidation = () => controller.abort();
    req.once("aborted", abortValidation);
    res.once("close", () => {
      if (!res.writableEnded) abortValidation();
    });
    let validated: { durationSeconds: number; actualSizeBytes: number; frozenStoragePath: string };
    try {
      const pendingValidation = validateAssessmentAudioQueued(
        validationJobId,
        (signal) => validateAssessmentAudio(
          reservation.answer.uploadStoragePath!,
          reservation.answer.expectedSizeBytes!,
          reservation.answer.expectedContentType!,
          reservation.frozenStoragePath,
          async () => {
            const leaseNow = new Date();
            const [lease] = await db.update(assessmentAudioCleanupOutboxTable)
              .set({
                state: "writing",
                leaseExpiresAt: new Date(leaseNow.getTime() + AUDIO_FROZEN_WRITE_LEASE_MS),
                updatedAt: leaseNow,
              })
              .where(and(
                eq(assessmentAudioCleanupOutboxTable.attemptId, attempt.id),
                eq(assessmentAudioCleanupOutboxTable.questionId, answer.questionId),
                eq(assessmentAudioCleanupOutboxTable.sequence, body.data.sequence),
                eq(assessmentAudioCleanupOutboxTable.objectPath, reservation.frozenStoragePath),
                inArray(assessmentAudioCleanupOutboxTable.state, ["reserved", "writing"]),
                gt(assessmentAudioCleanupOutboxTable.leaseExpiresAt, leaseNow),
              ))
              .returning({ id: assessmentAudioCleanupOutboxTable.id });
            if (!lease) throw new Error("The frozen object write reservation expired or was claimed for cleanup.");
          },
          signal,
        ),
        controller.signal,
      );
      if (!pendingValidation) {
        res.status(429).json({ error: "Assessment audio validation is busy; retry shortly." });
        return;
      }
      validated = await pendingValidation;
    } catch {
      await releaseAssessmentAudioWriteLease(
        attempt.id,
        answer.questionId,
        body.data.sequence,
        reservation.frozenStoragePath,
      ).catch(() => undefined);
      if (!res.headersSent) {
        res.status(409).json({ error: "The uploaded recording failed local size, signature, or duration validation; no grade was generated." });
      }
      return;
    } finally {
      req.removeListener("aborted", abortValidation);
    }
    if (validated.frozenStoragePath !== reservation.frozenStoragePath) {
      await releaseAssessmentAudioWriteLease(
        attempt.id,
        answer.questionId,
        body.data.sequence,
        reservation.frozenStoragePath,
      ).catch(() => undefined);
      res.status(409).json({ error: "The validated recording did not match its durable frozen reservation." });
      return;
    }
    const confirmedAt = new Date();
    let outcome: "confirmed" | "replay" | "missing" | "lease" | "inactive" | "raced" = "raced";
    try {
      outcome = await db.transaction(async (tx) => {
        const [currentAttempt] = await tx.select().from(assessmentAttemptsTable)
          .where(and(
            eq(assessmentAttemptsTable.id, attempt.id),
            eq(assessmentAttemptsTable.userId, req.mateenUserId!),
          ))
          .for("update").limit(1);
        if (!currentAttempt) return "missing";
        if (!ownerSession(currentAttempt, body.data.sessionId)) return "lease";
        if (currentAttempt.status !== "in_progress" || staleHeartbeat(currentAttempt, confirmedAt.getTime())) return "inactive";
        const [currentAnswer] = await tx.select().from(assessmentAnswersTable)
          .where(and(
            eq(assessmentAnswersTable.id, answer.id),
            eq(assessmentAnswersTable.attemptId, attempt.id),
            eq(assessmentAnswersTable.userId, req.mateenUserId!),
          ))
          .for("update").limit(1);
        if (!currentAnswer) return "raced";
        if (
          currentAnswer.audioAvailable &&
          currentAnswer.audioSequence === body.data.sequence &&
          currentAnswer.storagePath === validated.frozenStoragePath
        ) return "replay";
        if (
          currentAnswer.pendingAudioSequence !== body.data.sequence ||
          currentAnswer.audioSequence + 1 !== body.data.sequence ||
          currentAnswer.uploadStoragePath !== reservation.answer.uploadStoragePath ||
          currentAnswer.frozenReservationPath !== reservation.frozenStoragePath ||
          currentAnswer.frozenReservationSequence !== body.data.sequence ||
          currentAnswer.storagePath !== null ||
          currentAnswer.audioAvailable ||
          currentAnswer.audioDeletePending ||
          currentAnswer.audioDeletedAt ||
          currentAnswer.uploadExpiresAt?.getTime() !== answer.uploadExpiresAt?.getTime() ||
          !currentAnswer.uploadExpiresAt ||
          currentAnswer.uploadExpiresAt <= confirmedAt
        ) return "raced";
        const [confirmed] = await tx.update(assessmentAnswersTable)
          .set({
            storagePath: validated.frozenStoragePath,
            frozenReservationPath: null,
            frozenReservationExpiresAt: null,
            frozenReservationSequence: null,
            frozenReservationCleanupPending: false,
            audioSequence: body.data.sequence,
            pendingAudioSequence: null,
            actualDurationSeconds: validated.durationSeconds,
            audioAvailable: true,
            audioDeletePending: false,
            audioExpiresAt: new Date(confirmedAt.getTime() + AUDIO_RETENTION_MS),
            updatedAt: confirmedAt,
          })
          .where(and(
            eq(assessmentAnswersTable.id, answer.id),
            eq(assessmentAnswersTable.userId, req.mateenUserId!),
            eq(assessmentAnswersTable.uploadStoragePath, reservation.answer.uploadStoragePath!),
            eq(assessmentAnswersTable.pendingAudioSequence, body.data.sequence),
            eq(assessmentAnswersTable.frozenReservationPath, reservation.frozenStoragePath),
            eq(assessmentAnswersTable.frozenReservationSequence, body.data.sequence),
            eq(assessmentAnswersTable.frozenReservationCleanupPending, false),
            eq(assessmentAnswersTable.audioSequence, body.data.sequence - 1),
            eq(assessmentAnswersTable.audioAvailable, false),
            eq(assessmentAnswersTable.audioDeletePending, false),
            isNull(assessmentAnswersTable.storagePath),
            isNull(assessmentAnswersTable.audioDeletedAt),
          ))
          .returning({ id: assessmentAnswersTable.id });
        if (!confirmed) return "raced";
        const [completedWrite] = await tx.delete(assessmentAudioCleanupOutboxTable)
          .where(and(
            eq(assessmentAudioCleanupOutboxTable.attemptId, attempt.id),
            eq(assessmentAudioCleanupOutboxTable.questionId, answer.questionId),
            eq(assessmentAudioCleanupOutboxTable.sequence, body.data.sequence),
            eq(assessmentAudioCleanupOutboxTable.objectPath, reservation.frozenStoragePath),
            eq(assessmentAudioCleanupOutboxTable.state, "writing"),
          ))
          .returning({ id: assessmentAudioCleanupOutboxTable.id });
        if (!completedWrite) return "raced";
        await tx.insert(assessmentAuditEventsTable).values({
          id: randomUUID(),
          attemptId: attempt.id,
          actorId: req.mateenUserId!,
          eventType: "assessment_audio_confirmed",
          payload: {
            questionId: answer.questionId,
            sequence: body.data.sequence,
            actualSizeBytes: validated.actualSizeBytes,
            actualDurationSeconds: validated.durationSeconds,
            retentionDays: 30,
          },
          createdAt: confirmedAt,
        });
        return "confirmed";
      });
    } catch {
      outcome = "raced";
    }
    if (outcome !== "confirmed" && outcome !== "replay") {
      const [current] = await db.select().from(assessmentAnswersTable)
        .where(eq(assessmentAnswersTable.id, answer.id)).limit(1);
      if (
        current?.audioAvailable &&
        current.audioSequence === body.data.sequence &&
        current.storagePath === reservation.frozenStoragePath
      ) {
        res.json(ConfirmAssessmentAudioResponse.parse({
          questionId: answer.questionId,
          sequence: body.data.sequence,
          acknowledged: true,
          audioReceived: true,
        }));
        return;
      }
      await releaseAssessmentAudioWriteLease(
        attempt.id,
        answer.questionId,
        body.data.sequence,
        reservation.frozenStoragePath,
      ).catch(() => undefined);
      const status = outcome === "missing" ? 404 : 409;
      res.status(status).json({ error: "The attempt or audio upload changed during validation; its frozen reservation is retained for bounded cleanup." });
      return;
    }
    res.json(ConfirmAssessmentAudioResponse.parse({
      questionId: answer.questionId, sequence: body.data.sequence, acknowledged: true, audioReceived: true,
    }));
  },
);

router.delete(
  "/mateen/assessments/:attemptId/answers/:questionId/audio",
  mutationOriginProtection,
  rateLimit(15, 60_000),
  authenticationRequired,
  async (req: AuthedRequest, res): Promise<void> => {
    if (!(await requireStudent(req, res))) return;
    const params = DeleteAssessmentAudioParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid audio identifiers." });
      return;
    }
    const now = new Date();
    const outcome = await db.transaction(async (tx) => {
      const [attempt] = await tx.select().from(assessmentAttemptsTable)
        .where(and(
          eq(assessmentAttemptsTable.id, params.data.attemptId),
          eq(assessmentAttemptsTable.userId, req.mateenUserId!),
        ))
        .for("update").limit(1);
      if (!attempt) return { kind: "missing" as const };
      const [answer] = await tx.select().from(assessmentAnswersTable)
        .where(and(
          eq(assessmentAnswersTable.attemptId, params.data.attemptId),
          eq(assessmentAnswersTable.userId, req.mateenUserId!),
          eq(assessmentAnswersTable.questionId, params.data.questionId),
          eq(assessmentAnswersTable.kind, "oral"),
        ))
        .for("update").limit(1);
      if (!answer) return { kind: "missing" as const };
      if (
        answer.audioDeletedAt &&
        !answer.storagePath &&
        !answer.uploadStoragePath &&
        !answer.frozenReservationPath
      ) {
        return { kind: "already" as const };
      }
      const cancelPendingUpload = answer.pendingAudioSequence !== null &&
        answer.pendingAudioSequence !== undefined &&
        !answer.audioAvailable &&
        !answer.storagePath;
      if (cancelPendingUpload) {
        if (answer.uploadStoragePath) {
          const signedUploadExpiry = answer.uploadExpiresAt ??
            new Date(now.getTime() + AUDIO_UPLOAD_TTL_MS);
          await tx.insert(assessmentAudioUploadCleanupOutboxTable).values({
            id: randomUUID(),
            attemptId: answer.attemptId,
            questionId: answer.questionId,
            sequence: answer.pendingAudioSequence!,
            objectPath: answer.uploadStoragePath,
            state: "pending",
            leaseExpiresAt: new Date(signedUploadExpiry.getTime() + AUDIO_UPLOAD_EXPIRY_SKEW_MS),
            createdAt: now,
            updatedAt: now,
          });
        }
        await tx.update(assessmentAnswersTable)
          .set({
            audioAvailable: false,
            audioDeletePending: false,
            audioDeletedAt: null,
            pendingAudioSequence: null,
            expectedSizeBytes: null,
            expectedContentType: null,
            uploadStoragePath: null,
            uploadExpiresAt: null,
            updatedAt: now,
          })
          .where(eq(assessmentAnswersTable.id, answer.id));
        await tx.insert(assessmentAuditEventsTable).values({
          id: randomUUID(),
          attemptId: params.data.attemptId,
          actorId: req.mateenUserId!,
          eventType: "assessment_audio_upload_cancelled",
          payload: {
            questionId: answer.questionId,
            sequence: answer.pendingAudioSequence,
            signedUploadCleanupScheduled: Boolean(answer.uploadStoragePath),
            frozenReservationCleanupScheduled: Boolean(answer.frozenReservationPath),
          },
          createdAt: now,
        });
        return {
          kind: "cancelled" as const,
          answer: {
            ...answer,
            audioDeletePending: false,
            audioDeletedAt: null,
            pendingAudioSequence: null,
            uploadStoragePath: null,
          },
        };
      }
      const unreviewed = answer.status !== "scored";
      await tx.update(assessmentAnswersTable)
        .set({
          audioAvailable: false,
          audioDeletePending: Boolean(
            answer.storagePath || answer.uploadStoragePath || answer.frozenReservationPath,
          ),
          audioDeletedAt: now,
          pendingAudioSequence: null,
          status: unreviewed ? "technical_review" : answer.status,
          technicalIssue: unreviewed ? "The owner deleted an unreviewed recording; it cannot receive an oral grade." : answer.technicalIssue,
          updatedAt: now,
        })
        .where(eq(assessmentAnswersTable.id, answer.id));
      if (unreviewed) {
        await tx.update(assessmentAttemptsTable)
          .set({ status: "technical_review", updatedAt: now })
          .where(and(
            eq(assessmentAttemptsTable.id, params.data.attemptId),
            eq(assessmentAttemptsTable.userId, req.mateenUserId!),
            inArray(assessmentAttemptsTable.status, ["in_progress", "paused_connection", "submitted"]),
          ));
      }
      await tx.insert(assessmentAuditEventsTable).values({
        id: randomUUID(), attemptId: params.data.attemptId, actorId: req.mateenUserId!,
        eventType: "assessment_audio_deleted",
        payload: {
          questionId: answer.questionId,
          unreviewed,
          priorAudioSequence: answer.audioSequence,
          hadFrozenAudio: Boolean(answer.storagePath),
          hadSignedUpload: Boolean(answer.uploadStoragePath),
        },
        createdAt: now,
      });
      return {
        kind: "deleted" as const,
        answer: {
          ...answer,
          audioDeletePending: Boolean(
            answer.storagePath || answer.uploadStoragePath || answer.frozenReservationPath,
          ),
        },
      };
    });
    if (outcome.kind === "missing") {
      res.status(404).json({ error: "Assessment audio not found." });
      return;
    }
    if (outcome.kind === "already") {
      res.status(204).end();
      return;
    }
    if (outcome.answer.frozenReservationSequence !== null) {
      cancelAssessmentAudioValidation(assessmentAudioValidationJobId(
        outcome.answer.attemptId,
        outcome.answer.questionId,
        outcome.answer.frozenReservationSequence!,
      ));
    }
    if (outcome.kind === "cancelled") {
      res.status(204).end();
      return;
    }
    let deletionFailed = false;
    if (outcome.answer.storagePath) {
      try {
        await removeRemoteAudio(outcome.answer.storagePath);
        await db.update(assessmentAnswersTable)
          .set({ storagePath: null, updatedAt: new Date() })
          .where(and(
            eq(assessmentAnswersTable.id, outcome.answer.id),
            eq(assessmentAnswersTable.storagePath, outcome.answer.storagePath),
            eq(assessmentAnswersTable.audioDeletePending, true),
          ));
      } catch {
        deletionFailed = true;
      }
    }
    if (outcome.answer.uploadStoragePath) {
      try {
        await removeRemoteAudio(outcome.answer.uploadStoragePath);
        const uploadExpired = outcome.answer.uploadExpiresAt !== null &&
          outcome.answer.uploadExpiresAt.getTime() <= now.getTime() - AUDIO_UPLOAD_EXPIRY_SKEW_MS;
        if (uploadExpired) {
          await db.update(assessmentAnswersTable)
            .set({ uploadStoragePath: null, uploadExpiresAt: null, updatedAt: new Date() })
            .where(and(
              eq(assessmentAnswersTable.id, outcome.answer.id),
              eq(assessmentAnswersTable.uploadStoragePath, outcome.answer.uploadStoragePath),
              eq(assessmentAnswersTable.audioDeletePending, true),
            ));
        }
      } catch {
        deletionFailed = true;
      }
    }
    const [remaining] = await db.select({
      storagePath: assessmentAnswersTable.storagePath,
      uploadStoragePath: assessmentAnswersTable.uploadStoragePath,
      frozenReservationPath: assessmentAnswersTable.frozenReservationPath,
    }).from(assessmentAnswersTable)
      .where(eq(assessmentAnswersTable.id, outcome.answer.id)).limit(1);
    if (
      !remaining?.storagePath &&
      !remaining?.uploadStoragePath &&
      !remaining?.frozenReservationPath
    ) {
      await db.update(assessmentAnswersTable)
        .set({ audioDeletePending: false, updatedAt: new Date() })
        .where(and(
          eq(assessmentAnswersTable.id, outcome.answer.id),
          eq(assessmentAnswersTable.audioDeletePending, true),
          isNotNull(assessmentAnswersTable.audioDeletedAt),
        ));
    }
    if (deletionFailed) {
      res.status(503).json({ error: "Audio access is disabled; private deletion is queued for retry." });
      return;
    }
    res.status(204).end();
  },
);

}

function registerAssessmentSummaryRoutes() {
router.get(
  "/mateen/assessments",
  authenticationRequired,
  async (req: AuthedRequest, res): Promise<void> => {
    if (!(await requireStudent(req, res))) return;
    const attempts = await db.select().from(assessmentAttemptsTable)
      .where(eq(assessmentAttemptsTable.userId, req.mateenUserId!))
      .orderBy(desc(assessmentAttemptsTable.createdAt))
      .limit(100);
    const latest = attempts[0];
    const active = attempts.find((item) => isAttemptActive(item.status));
    const latestResult = attempts.find((item) => item.result)?.result ?? null;
    const passed = await db.select({ id: assessmentAttemptsTable.id })
      .from(assessmentAttemptsTable)
      .where(and(eq(assessmentAttemptsTable.userId, req.mateenUserId!), eq(assessmentAttemptsTable.status, "passed")))
      .limit(1);
    const retry = latest?.status === "failed" && latest.retryAvailableAt && latest.retryAvailableAt > new Date()
      ? latest.retryAvailableAt
      : null;
    const now = new Date();
    const [due] = await db.select({ value: count() }).from(scheduledReviewsTable)
      .where(and(eq(scheduledReviewsTable.userId, req.mateenUserId!), lt(scheduledReviewsTable.dueAt, new Date(now.getTime() + 1))));
    const [mistakes] = await db.select({ value: count() }).from(assessmentAnswersTable)
      .where(and(
        eq(assessmentAnswersTable.userId, req.mateenUserId!),
        eq(assessmentAnswersTable.status, "scored"),
        eq(assessmentAnswersTable.score, 0),
        inArray(assessmentAnswersTable.provenance, ["written", "human_verified_oral"]),
      ));
    res.json(GetAssessmentSummaryResponse.parse({
      available: true,
      completedAvailableContent: passed.length > 0,
      nextLevel: null,
      activeAttempt: active?.id ?? null,
      latestResult,
      retryAvailableAt: retry,
      nextAssessmentAvailableAt: retry,
      serverNow: now,
      dueReviewsCount: due?.value ?? 0,
      confirmedMistakesCount: mistakes?.value ?? 0,
    }));
  },
);

router.get(
  "/mateen/assessments/:attemptId",
  authenticationRequired,
  async (req: AuthedRequest, res): Promise<void> => {
    if (!(await requireStudent(req, res))) return;
    const params = GetAssessmentParams.safeParse(req.params);
    const sessionId = sessionIdFromHeader(req);
    if (!params.success || !sessionId) {
      res.status(400).json({ error: "A valid X-Assessment-Session header is required." });
      return;
    }
    const attempt = await getOwnedAttempt(params.data.attemptId, req.mateenUserId!);
    if (!attempt) {
      res.status(404).json({ error: "Assessment attempt not found." });
      return;
    }
    let current = attempt;
    if (attempt.status === "in_progress" && staleHeartbeat(attempt)) {
      const [paused] = await db.update(assessmentAttemptsTable)
        .set({ status: "paused_connection", lastHeartbeatAt: null, updatedAt: new Date() })
        .where(and(
          eq(assessmentAttemptsTable.id, attempt.id),
          eq(assessmentAttemptsTable.status, "in_progress"),
          eq(assessmentAttemptsTable.sessionId, sessionId),
        ))
        .returning();
      current = paused ?? attempt;
    }
    const response = await attemptResponse(current, sessionId);
    res.json(GetAssessmentResponse.parse(response));
  },
);

}

function reviewPassage(review: { passagePrompt: string | null; referenceText: string | null }) {
  if (!review.passagePrompt || !review.referenceText) {
    throw new Error("This saved review has no immutable passage snapshot and needs explicit reconciliation.");
  }
  return { prompt: review.passagePrompt, reference: review.referenceText };
}

function registerScheduledReviewRoutes() {
router.get(
  "/mateen/assessment/reviews",
  authenticationRequired,
  async (req: AuthedRequest, res): Promise<void> => {
    if (!(await requireStudent(req, res))) return;
    const rows = await db.select().from(scheduledReviewsTable)
      .where(and(
        eq(scheduledReviewsTable.userId, req.mateenUserId!),
        lt(scheduledReviewsTable.dueAt, new Date(Date.now() + 1)),
      ))
      .orderBy(scheduledReviewsTable.dueAt)
      .limit(100);
    if (rows.some((row) => !row.passagePrompt || !row.referenceText)) {
      res.status(409).json({ error: "A legacy scheduled review lacks an immutable passage snapshot; no current-corpus reference was substituted." });
      return;
    }
    const result = rows.map((row) => {
      const { prompt } = reviewPassage(row);
      return {
        id: row.id,
        hadithNumber: row.hadithNumber,
        prompt,
        sourceMistake: row.sourceMistake,
        dueAt: row.dueAt,
        intervalDays: row.intervalDays,
        status: "due",
        nextDueAt: null,
        correctness: null,
        feedback: null,
        referenceText: null,
        mutationId: null,
        differences: [],
      };
    });
    res.json(ListScheduledReviewsResponse.parse(result));
  },
);

router.post(
  "/mateen/assessment/reviews/:reviewId/complete",
  mutationOriginProtection,
  rateLimit(60, 60_000),
  authenticationRequired,
  async (req: AuthedRequest, res): Promise<void> => {
    if (!(await requireStudent(req, res))) return;
    const params = CompleteScheduledReviewParams.safeParse(req.params);
    const body = CompleteScheduledReviewBody.safeParse(req.body);
    if (!params.success || !body.success || !exactKeys(req.body, ["writtenAnswer", "mutationId"])) {
      res.status(400).json({ error: "Invalid scheduled review response." });
      return;
    }
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      // Same account lock as daily-plan writes: answer and task completion are atomic.
      await tx.select().from(profilesTable).where(eq(profilesTable.clerkId, req.mateenUserId!)).for("no key update");
      const [review] = await tx.select().from(scheduledReviewsTable)
        .where(and(
          eq(scheduledReviewsTable.id, params.data.reviewId),
          eq(scheduledReviewsTable.userId, req.mateenUserId!),
        ))
        .for("update").limit(1);
      if (!review) return { kind: "missing" as const };
      if (review.lastMutationId === body.data.mutationId && review.lastResponse) {
        return { kind: "replay" as const, response: review.lastResponse };
      }
      if (review.dueAt > now) return { kind: "early" as const, dueAt: review.dueAt };
      if (!review.passagePrompt || !review.referenceText) return { kind: "legacy" as const };
      const { reference } = reviewPassage(review);
      const correctness = scoreExact(reference, body.data.writtenAnswer);
      const differences = correctness ? [] : compareWords(reference, body.data.writtenAnswer);
      const nextInterval = nextReviewIntervalDays(review.intervalDays, Boolean(correctness));
      const nextDueAt = new Date(now.getTime() + nextInterval * 24 * 60 * 60 * 1000);
      const response = {
        id: review.id,
        hadithNumber: review.hadithNumber,
        prompt: reviewPassage(review).prompt,
        sourceMistake: review.sourceMistake,
        dueAt: review.dueAt,
        intervalDays: nextInterval,
        status: "completed",
        nextDueAt,
        correctness: Boolean(correctness),
        feedback: correctness ? "الإجابة مطابقة للنص وفق المطابقة النصية الحتمية." : "الإجابة غير مطابقة تماماً؛ راجع النص واحفظه كما ورد.",
        referenceText: reference,
        mutationId: body.data.mutationId,
        differences,
      };
      await tx.update(scheduledReviewsTable)
        .set({
          intervalDays: nextInterval,
          dueAt: nextDueAt,
          completedAt: now,
          lastMutationId: body.data.mutationId,
          lastResponse: response,
          lastCorrect: Boolean(correctness),
          lastAnswer: body.data.writtenAnswer,
          updatedAt: now,
        })
        .where(eq(scheduledReviewsTable.id, review.id));
      await finishDailyReview(tx, review, now);
      if (review.sourceAttemptId) {
        await tx.insert(assessmentAuditEventsTable).values({
          id: randomUUID(),
          attemptId: review.sourceAttemptId,
          actorId: req.mateenUserId!,
          eventType: "scheduled_review_completed",
          payload: {
            reviewId: review.id,
            mutationId: body.data.mutationId,
            correctness: Boolean(correctness),
            nextIntervalDays: nextInterval,
          },
          createdAt: now,
        });
      }
      return { kind: "completed" as const, response };
    });
    if (result.kind === "missing") {
      res.status(404).json({ error: "Scheduled review not found." });
      return;
    }
    if (result.kind === "early") {
      res.status(409).json({ error: "This scheduled review is not due yet.", dueAt: result.dueAt });
      return;
    }
    if (result.kind === "legacy") {
      res.status(409).json({ error: "This saved review has no immutable passage snapshot; no current-corpus reference was substituted." });
      return;
    }
    res.json(CompleteScheduledReviewResponse.parse(result.response));
  },
);

}

registerAssessmentStartRoutes();
registerAssessmentAnswerRoutes();
registerAssessmentReviewerRoutes();
registerAssessmentAudioRoutes();
registerAssessmentSummaryRoutes();
registerScheduledReviewRoutes();

export default router;