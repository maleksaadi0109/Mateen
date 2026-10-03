import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import {
  assessmentAnswersTable,
  assessmentAttemptsTable,
  assessmentAuditEventsTable,
  assessmentReviewerGrantsTable,
  db,
  scheduledReviewsTable,
  type AssessmentAttemptRecord,
  type AssessmentAnswerRecord,
} from "@workspace/db";
import {
  ACTIVE_SECONDS,
  AUDIO_RETENTION_MS,
  HEARTBEAT_STALE_MS,
  RETRY_DELAY_MS,
  compareWords,
  normalizeAssessmentText,
  scoreExact,
  passageIdentityKey,
  type QuestionSnapshot,
} from "./assessment-policy";

export function auditEvent(
  attemptId: string,
  actorId: string,
  eventType: string,
  payload: Record<string, unknown>,
) {
  return db.insert(assessmentAuditEventsTable).values({
    id: randomUUID(),
    attemptId,
    actorId,
    eventType,
    payload,
  });
}

export function isAttemptActive(status: AssessmentAttemptRecord["status"]): boolean {
  return status === "in_progress" || status === "paused_connection";
}

export function remainingSeconds(attempt: AssessmentAttemptRecord): number {
  const elapsedMilliseconds = attempt.activeSeconds * 1000 + attempt.activeMilliseconds;
  return Math.max(0, Math.ceil((ACTIVE_SECONDS * 1000 - elapsedMilliseconds) / 1000));
}

export function advanceTrustedActiveClock(
  attempt: Pick<AssessmentAttemptRecord, "activeSeconds" | "activeMilliseconds" | "lastHeartbeatAt">,
  now = Date.now(),
) {
  const priorMilliseconds = attempt.activeSeconds * 1000 + attempt.activeMilliseconds;
  const sinceCheckpoint = attempt.lastHeartbeatAt
    ? Math.max(0, now - attempt.lastHeartbeatAt.getTime())
    : 0;
  const totalMilliseconds = Math.min(ACTIVE_SECONDS * 1000, priorMilliseconds + sinceCheckpoint);
  return {
    activeSeconds: Math.floor(totalMilliseconds / 1000),
    activeMilliseconds: totalMilliseconds % 1000,
    atLimit: totalMilliseconds >= ACTIVE_SECONDS * 1000,
  };
}

export function failedRetryAvailableAt(submittedAt: Date | null, completedAt: Date): Date {
  return new Date((submittedAt ?? completedAt).getTime() + RETRY_DELAY_MS);
}

export function staleHeartbeat(attempt: AssessmentAttemptRecord, now = Date.now()): boolean {
  return !attempt.lastHeartbeatAt || now - attempt.lastHeartbeatAt.getTime() > HEARTBEAT_STALE_MS;
}

export function projectAttempt(
  attempt: AssessmentAttemptRecord,
  answers: AssessmentAnswerRecord[],
  sessionId: string | null,
  now = Date.now(),
) {
  const leaseHeld = sessionId === attempt.sessionId && !staleHeartbeat(attempt, now);
  const canSeeQuestions = attempt.status !== "paused_connection" &&
    (attempt.status !== "in_progress" || leaseHeld);
  const questions = canSeeQuestions
    ? answers.sort((a, b) => a.position - b.position).map((answer) => ({
        id: answer.questionId,
        position: answer.position,
        kind: answer.kind,
        prompt: answer.prompt,
        answerSequence: answer.answerSequence,
        audioReceived: answer.audioAvailable && !answer.audioDeletedAt,
        audioDeletionAvailable: Boolean(
          answer.storagePath || answer.uploadStoragePath || answer.frozenReservationPath,
        ),
        writtenAnswer: answer.kind !== "written"
          ? null
          : attempt.result
            ? answer.writtenAnswer
            : attempt.status === "in_progress"
              ? answer.writtenAnswer
              : null,
      }))
    : [];
  return {
    id: attempt.id,
    status: attempt.status,
    questions,
    activeSeconds: attempt.activeSeconds,
    remainingSeconds: remainingSeconds(attempt),
    currentQuestionPosition: attempt.currentQuestionPosition,
    expiresAt: new Date(now + remainingSeconds(attempt) * 1000),
    result: attempt.result,
    sourceVersion: attempt.sourceVersion,
    canonicalHash: attempt.canonicalHash,
    policy: attempt.policySnapshot,
  };
}

export async function getAttemptAnswers(attemptId: string) {
  return db
    .select()
    .from(assessmentAnswersTable)
    .where(eq(assessmentAnswersTable.attemptId, attemptId))
    .orderBy(assessmentAnswersTable.position);
}

// Operational response target, not an automatic grading deadline.
export const ASSESSMENT_REVIEW_RESPONSE_HOURS = 48;

export async function hasAssessmentReviewCoverage(ownerId: string): Promise<boolean> {
  const [grant] = await db.select({ clerkId: assessmentReviewerGrantsTable.clerkId })
    .from(assessmentReviewerGrantsTable)
    .where(and(
      eq(assessmentReviewerGrantsTable.enabled, true),
      ne(assessmentReviewerGrantsTable.clerkId, ownerId),
    )).limit(1);
  return Boolean(grant);
}

export async function isTrustedAssessmentReviewer(clerkId: string): Promise<boolean> {
  const [grant] = await db
    .select({ enabled: assessmentReviewerGrantsTable.enabled })
    .from(assessmentReviewerGrantsTable)
    .where(eq(assessmentReviewerGrantsTable.clerkId, clerkId))
    .limit(1);
  return reviewerGrantIsEnabled(grant?.enabled);
}

export function reviewerGrantIsEnabled(enabled: unknown): boolean {
  return enabled === true;
}

export function reviewerCanReviewAttempt(reviewerId: string, ownerId: string): boolean {
  return reviewerId !== ownerId;
}

export function answerSequenceDisposition(input: {
  savedSequence: number;
  savedMutationId: string | null;
  savedAnswer: string | null;
  requestedSequence: number;
  requestedMutationId: string;
  requestedAnswer: string;
}): "replay" | "next" | "conflict" {
  if (input.requestedSequence === input.savedSequence) {
    return input.savedMutationId === input.requestedMutationId &&
      input.savedAnswer === input.requestedAnswer
      ? "replay"
      : "conflict";
  }
  return input.requestedSequence === input.savedSequence + 1 ? "next" : "conflict";
}

export function nextReviewIntervalDays(current: number, correct: boolean): 1 | 3 | 7 | 14 | 30 {
  if (!correct) return 1;
  const intervals = [1, 3, 7, 14, 30] as const;
  const index = intervals.indexOf(current as (typeof intervals)[number]);
  return intervals[Math.min(Math.max(0, index) + 1, intervals.length - 1)]!;
}

export function hasIncompleteAudio(answers: AssessmentAnswerRecord[]): boolean {
  return answers.some(
    (answer) =>
      answer.kind === "oral" &&
      answer.expectedSizeBytes !== null &&
      (!answer.audioAvailable || Boolean(answer.audioDeletePending)),
  );
}

export async function upsertMistakeReview(input: {
  userId: string;
  hadithNumber: number;
  sourceVersion: string;
  windowStartWord: number;
  passagePrompt: string;
  referenceText: string;
  attemptId: string;
  questionId: string;
  mistake: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  await db
    .insert(scheduledReviewsTable)
    .values({
      id: randomUUID(),
      userId: input.userId,
      textId: "nawawi",
      hadithNumber: input.hadithNumber,
      passageKey: passageIdentityKey(
        input.sourceVersion,
        input.hadithNumber,
        input.windowStartWord,
        input.referenceText,
      ),
      sourceVersion: input.sourceVersion,
      windowStartWord: input.windowStartWord,
      passagePrompt: input.passagePrompt,
      referenceText: input.referenceText,
      sourceAttemptId: input.attemptId,
      sourceQuestionId: input.questionId,
      sourceMistake: input.mistake.slice(0, 2000),
      intervalDays: 1,
      dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      lastCorrect: false,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [scheduledReviewsTable.userId, scheduledReviewsTable.passageKey],
      set: {
        intervalDays: 1,
        dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        lastCorrect: false,
        completedAt: null,
        lastMutationId: null,
        lastResponse: null,
        lastAnswer: null,
        updatedAt: now,
      },
    });
}

function scoreAnswer(answer: AssessmentAnswerRecord, text: string | null, provenance: string) {
  const score = text === null ? 0 : scoreExact(answer.referenceText, text);
  return {
    questionId: answer.questionId,
    kind: answer.kind,
    expectedText: answer.referenceText,
    submittedText: text,
    score,
    provenance,
    differences: text === null ? [] : compareWords(answer.referenceText, text),
  };
}

export async function finalizeAttempt(
  attempt: AssessmentAttemptRecord,
  _answers: AssessmentAnswerRecord[],
  reviewerId: string,
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const [lockedAttempt] = await tx.select().from(assessmentAttemptsTable)
      .where(eq(assessmentAttemptsTable.id, attempt.id))
      .for("update").limit(1);
    if (!lockedAttempt) return { kind: "raced" as const };
    if (lockedAttempt.result) return { kind: "final" as const, attempt: lockedAttempt };
    const answers = await tx.select().from(assessmentAnswersTable)
      .where(eq(assessmentAnswersTable.attemptId, lockedAttempt.id))
      .orderBy(assessmentAnswersTable.position)
      .for("update");
    if (answers.some((answer) => answer.kind === "oral" && answer.status === "pending" && answer.audioAvailable && !answer.audioDeletedAt)) {
      return { kind: "pending" as const };
    }
    if (answers.some((answer) => answer.kind === "oral" && answer.status === "technical_review")) {
      const [updated] = await tx.update(assessmentAttemptsTable)
        .set({ status: "technical_review", updatedAt: now })
        .where(eq(assessmentAttemptsTable.id, lockedAttempt.id))
        .returning();
      return { kind: "technical_review" as const, attempt: updated ?? lockedAttempt };
    }

    const finalAnswers = answers.map((answer) => {
      if (answer.kind === "written") {
        const submitted = answer.writtenAnswer?.trim() ? answer.writtenAnswer : null;
        return scoreAnswer(answer, submitted, submitted === null ? "unanswered" : "written");
      }
      if (answer.status === "scored") {
        return scoreAnswer(answer, answer.verifiedTranscript, "human_verified_oral");
      }
      return scoreAnswer(answer, null, "unanswered");
    });
    const writtenScore = finalAnswers
      .filter((answer) => answer.kind === "written")
      .reduce((sum, answer) => sum + answer.score, 0);
    const oralScore = finalAnswers
      .filter((answer) => answer.kind === "oral")
      .reduce((sum, answer) => sum + answer.score, 0);
    const score = writtenScore + oralScore;
    const passed = score >= 25;
    const endedAt = lockedAttempt.submittedAt ?? now;
    const retryAvailableAt = passed ? null : failedRetryAvailableAt(lockedAttempt.submittedAt, endedAt);
    const reviewedAt = answers
      .map((answer) => answer.reviewedAt)
      .filter((date): date is Date => date !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const result = {
      score,
      passed,
      completedAt: now,
      reviewedAt,
      retryAvailableAt,
      writtenScore,
      oralScore,
      technicalReview: false,
      sourceVersion: lockedAttempt.sourceVersion,
      canonicalHash: lockedAttempt.canonicalHash,
      policy: lockedAttempt.policySnapshot,
      retentionNotice: "Assessment audio is retained privately for 30 days for review/appeal, then deleted. Owner deletion removes audio; unreviewed deletion cannot receive an oral grade.",
      answers: finalAnswers,
    };

    for (const answerResult of finalAnswers) {
      await tx.update(assessmentAnswersTable)
        .set({
          score: answerResult.score,
          provenance: answerResult.provenance,
          differences: answerResult.differences,
          status: "scored",
          updatedAt: now,
        })
        .where(and(
          eq(assessmentAnswersTable.attemptId, lockedAttempt.id),
          eq(assessmentAnswersTable.questionId, answerResult.questionId),
        ));
    }
    const status = passed ? "passed" : "failed";
    const [updatedAttempt] = await tx.update(assessmentAttemptsTable)
      .set({
        status,
        result,
        submittedAt: lockedAttempt.submittedAt ?? now,
        retryAvailableAt,
        updatedAt: now,
      })
      .where(and(
        eq(assessmentAttemptsTable.id, lockedAttempt.id),
        inArray(assessmentAttemptsTable.status, ["submitted", "in_progress", "paused_connection", "technical_review"]),
      ))
      .returning();
    if (!updatedAttempt) return { kind: "raced" as const };

    for (const answerResult of finalAnswers) {
      if (answerResult.score === 0 && answerResult.submittedText !== null) {
        const source = answers.find((answer) => answer.questionId === answerResult.questionId);
        if (source) {
          const snapshot = (lockedAttempt.questionsSnapshot as QuestionSnapshot[])
            .find((question) => question.id === source.questionId);
          if (!snapshot) {
            throw new Error("A source-bound assessment passage snapshot is unavailable for scheduled review.");
          }
          const mistake = errorSummary(source.referenceText, answerResult.submittedText);
          const dueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          const passageKey = passageIdentityKey(
            lockedAttempt.sourceVersion,
            source.hadithNumber,
            snapshot.sourceSelection.windowStartWord,
            source.referenceText,
          );
          await tx.insert(scheduledReviewsTable)
            .values({
              id: randomUUID(),
              userId: lockedAttempt.userId,
              textId: "nawawi",
              hadithNumber: source.hadithNumber,
              passageKey,
              sourceVersion: lockedAttempt.sourceVersion,
              windowStartWord: snapshot.sourceSelection.windowStartWord,
              passagePrompt: source.prompt,
              referenceText: source.referenceText,
              sourceAttemptId: lockedAttempt.id,
              sourceQuestionId: source.questionId,
              sourceMistake: mistake,
              intervalDays: 1,
              dueAt,
              lastCorrect: false,
              updatedAt: now,
            })
            .onConflictDoUpdate({
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
      }
    }
    await tx.insert(assessmentAuditEventsTable).values({
      id: randomUUID(),
      attemptId: lockedAttempt.id,
      actorId: reviewerId,
      eventType: "assessment_finalized",
      payload: { score, passed, sourceVersion: lockedAttempt.sourceVersion, canonicalHash: lockedAttempt.canonicalHash },
      createdAt: now,
    });
    return { kind: "final" as const, attempt: updatedAttempt };
  });
}

export function errorSummary(expected: string, actual: string): string {
  const difference = compareWords(expected, actual);
  const counts = new Map<string, number>();
  for (const item of difference) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  return `verified textual mismatch: ${[...counts].map(([kind, amount]) => `${amount} ${kind}`).join(", ")}`.slice(0, 2000);
}

export function normalizeForTesting(text: string) {
  return normalizeAssessmentText(text);
}

export type AssessmentQuestionRecord = QuestionSnapshot;