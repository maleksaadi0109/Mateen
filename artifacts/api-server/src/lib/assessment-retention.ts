import { and, eq, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import {
  assessmentAnswersTable,
  assessmentAttemptsTable,
  assessmentAuditEventsTable,
  assessmentAudioCleanupOutboxTable,
  assessmentAudioUploadCleanupOutboxTable,
  db,
} from "@workspace/db";
import { randomUUID } from "node:crypto";
import { removeRemoteAudio } from "./recitation-service";
import { logger } from "./logger";
import { AUDIO_UPLOAD_EXPIRY_SKEW_MS } from "./assessment-policy";
import {
  assessmentAudioValidationJobId,
  isAssessmentAudioValidationActive,
} from "./assessment-validation-queue";

const CLEANUP_BATCH = 100;

export async function cleanupExpiredAssessmentAudio(now = new Date()): Promise<number> {
  const uploadCleanupCutoff = new Date(now.getTime() - AUDIO_UPLOAD_EXPIRY_SKEW_MS);
  const due = await db.select().from(assessmentAnswersTable)
    .where(or(
      eq(assessmentAnswersTable.audioDeletePending, true),
      lte(assessmentAnswersTable.audioExpiresAt, now),
      and(
        isNotNull(assessmentAnswersTable.uploadStoragePath),
        lte(assessmentAnswersTable.uploadExpiresAt, uploadCleanupCutoff),
        or(
          isNotNull(assessmentAnswersTable.storagePath),
          isNull(assessmentAnswersTable.audioExpiresAt),
          lte(assessmentAnswersTable.audioExpiresAt, now),
          eq(assessmentAnswersTable.audioDeletePending, true),
        ),
      ),
      and(
        isNotNull(assessmentAnswersTable.pendingAudioSequence),
        lte(assessmentAnswersTable.uploadExpiresAt, uploadCleanupCutoff),
      ),
    ))
    .orderBy(assessmentAnswersTable.updatedAt)
    .limit(CLEANUP_BATCH);
  let removed = 0;
  for (const answer of due) {
    const frozenExpired = Boolean(answer.audioExpiresAt && answer.audioExpiresAt <= now);
    const deleteFrozen = Boolean(answer.storagePath && (answer.audioDeletePending || frozenExpired));
    const uploadExpired = Boolean(answer.uploadExpiresAt && answer.uploadExpiresAt <= uploadCleanupCutoff);
    const legacyAudioRetentionActive = !answer.storagePath &&
      Boolean(answer.audioExpiresAt && answer.audioExpiresAt > now) &&
      !answer.audioDeletePending;
    const deleteUpload = Boolean(
      answer.uploadStoragePath &&
      (answer.audioDeletePending || (uploadExpired && !legacyAudioRetentionActive)),
    );
    const clearAbandonedUpload = Boolean(
      answer.pendingAudioSequence !== null &&
      answer.pendingAudioSequence !== undefined &&
      answer.uploadExpiresAt &&
      answer.uploadExpiresAt <= uploadCleanupCutoff,
    );
    if (!deleteFrozen && !deleteUpload && !clearAbandonedUpload) {
      continue;
    }
    let frozenRemoved = false;
    let uploadRemoved = false;
    if (deleteFrozen) {
      const tombstone = await db.update(assessmentAnswersTable)
        .set({
          audioAvailable: false,
          audioDeletePending: true,
          audioDeletedAt: answer.audioDeletedAt ?? now,
          updatedAt: now,
        })
        .where(and(
          eq(assessmentAnswersTable.id, answer.id),
          eq(assessmentAnswersTable.storagePath, answer.storagePath!),
        ))
        .returning({ id: assessmentAnswersTable.id });
      if (!tombstone.length) continue;
      try {
        await removeRemoteAudio(answer.storagePath);
        frozenRemoved = true;
        removed += 1;
      } catch (error) {
        logger.warn({ assessmentAnswerId: answer.id, errorType: error instanceof Error ? error.name : "UnknownError" }, "Frozen assessment audio deletion will retry");
      }
    }
    if (deleteUpload) {
      try {
        await removeRemoteAudio(answer.uploadStoragePath);
        uploadRemoved = true;
        removed += 1;
      } catch (error) {
        logger.warn({ assessmentAnswerId: answer.id, errorType: error instanceof Error ? error.name : "UnknownError" }, "Signed assessment upload deletion will retry");
      }
    }
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(assessmentAnswersTable)
        .where(eq(assessmentAnswersTable.id, answer.id))
        .for("update").limit(1);
      if (!current) return;
      const unreviewed = current.status !== "scored";
      const clearUpload = uploadRemoved && uploadExpired &&
        current.uploadStoragePath === answer.uploadStoragePath;
      const clearFrozen = frozenRemoved && current.storagePath === answer.storagePath;
      const currentUploadExpired = Boolean(
        current.uploadExpiresAt && current.uploadExpiresAt <= uploadCleanupCutoff,
      );
      const clearPending = (
        current.pendingAudioSequence !== null &&
        current.pendingAudioSequence !== undefined &&
        currentUploadExpired &&
        (!current.uploadStoragePath || clearUpload)
      );
      await tx.update(assessmentAnswersTable)
        .set({
          ...(clearFrozen ? { storagePath: null } : {}),
          ...(clearUpload ? { uploadStoragePath: null, uploadExpiresAt: null } : {}),
          ...(clearPending ? {
            pendingAudioSequence: null,
            expectedSizeBytes: null,
            expectedContentType: null,
            actualDurationSeconds: clearFrozen ? null : current.actualDurationSeconds,
          } : {}),
          audioAvailable: clearFrozen ? false : current.audioAvailable,
          audioDeletePending: current.audioDeletePending || clearFrozen,
          ...(clearFrozen && unreviewed ? {
            status: "technical_review",
            technicalIssue: current.technicalIssue ??
              "Audio was deleted at the end of its private retention window before human adjudication.",
          } : {}),
          updatedAt: now,
        })
        .where(eq(assessmentAnswersTable.id, current.id));
      if (clearFrozen && unreviewed) {
        await tx.update(assessmentAttemptsTable)
          .set({ status: "technical_review", updatedAt: now })
          .where(and(
            eq(assessmentAttemptsTable.id, current.attemptId),
            inArray(assessmentAttemptsTable.status, ["submitted", "in_progress", "paused_connection"]),
          ));
      }
      if (clearFrozen || clearUpload || clearPending) {
        await tx.insert(assessmentAuditEventsTable).values({
          id: randomUUID(),
          attemptId: current.attemptId,
          actorId: "system:assessment-retention",
          eventType: "assessment_audio_retention_deleted",
          payload: {
            questionId: current.questionId,
            frozenAudioDeleted: clearFrozen,
            uploadObjectDeleted: clearUpload,
            audioExpired: Boolean(current.audioExpiresAt && current.audioExpiresAt <= now),
            unreviewed: clearFrozen && unreviewed,
          },
          createdAt: now,
        });
      }
    });
    const [remaining] = await db.select({
      storagePath: assessmentAnswersTable.storagePath,
      uploadStoragePath: assessmentAnswersTable.uploadStoragePath,
      frozenReservationPath: assessmentAnswersTable.frozenReservationPath,
    }).from(assessmentAnswersTable).where(eq(assessmentAnswersTable.id, answer.id)).limit(1);
    if (
      !remaining?.storagePath &&
      !remaining?.uploadStoragePath &&
      !remaining?.frozenReservationPath
    ) {
      await db.update(assessmentAnswersTable)
        .set({ audioDeletePending: false, updatedAt: now })
        .where(and(
          eq(assessmentAnswersTable.id, answer.id),
          eq(assessmentAnswersTable.audioDeletePending, true),
          isNotNull(assessmentAnswersTable.audioDeletedAt),
        ));
    }
  }

  const outboxDue = await db.select().from(assessmentAudioCleanupOutboxTable)
    .where(or(
      eq(assessmentAudioCleanupOutboxTable.state, "cleanup_pending"),
      and(
        inArray(assessmentAudioCleanupOutboxTable.state, ["reserved", "writing"]),
        lte(assessmentAudioCleanupOutboxTable.leaseExpiresAt, now),
      ),
    ))
    .orderBy(assessmentAudioCleanupOutboxTable.leaseExpiresAt)
    .limit(CLEANUP_BATCH);
  for (const obligation of outboxDue) {
    const jobId = assessmentAudioValidationJobId(
      obligation.attemptId,
      obligation.questionId,
      obligation.sequence,
    );
    if (isAssessmentAudioValidationActive(jobId)) continue;
    const claimed = await db.transaction(async (tx) => {
      const [answer] = await tx.select().from(assessmentAnswersTable)
        .where(and(
          eq(assessmentAnswersTable.attemptId, obligation.attemptId),
          eq(assessmentAnswersTable.questionId, obligation.questionId),
        ))
        .for("update").limit(1);
      if (answer?.storagePath === obligation.objectPath) {
        await tx.delete(assessmentAudioCleanupOutboxTable)
          .where(eq(assessmentAudioCleanupOutboxTable.id, obligation.id));
        return false;
      }
      const [current] = await tx.select().from(assessmentAudioCleanupOutboxTable)
        .where(and(
          eq(assessmentAudioCleanupOutboxTable.id, obligation.id),
          eq(assessmentAudioCleanupOutboxTable.objectPath, obligation.objectPath),
        ))
        .for("update").limit(1);
      if (!current) return false;
      if (
        current.state !== "cleanup_pending" &&
        current.leaseExpiresAt > now
      ) return false;
      if (isAssessmentAudioValidationActive(jobId)) return false;
      const [claim] = await tx.update(assessmentAudioCleanupOutboxTable)
        .set({ state: "cleanup_pending", updatedAt: now })
        .where(and(
          eq(assessmentAudioCleanupOutboxTable.id, current.id),
          eq(assessmentAudioCleanupOutboxTable.objectPath, current.objectPath),
        ))
        .returning({ id: assessmentAudioCleanupOutboxTable.id });
      if (!claim) return false;
      await tx.update(assessmentAnswersTable)
        .set({ frozenReservationCleanupPending: true, updatedAt: now })
        .where(and(
          eq(assessmentAnswersTable.frozenReservationPath, current.objectPath),
          lte(assessmentAnswersTable.frozenReservationExpiresAt, now),
        ));
      return true;
    });
    if (!claimed) continue;
    try {
      await removeRemoteAudio(obligation.objectPath);
    } catch (error) {
      logger.warn({ assessmentAudioOutboxId: obligation.id, errorType: error instanceof Error ? error.name : "UnknownError" }, "Frozen assessment cleanup obligation will retry");
      continue;
    }
    const cleared = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(assessmentAudioCleanupOutboxTable)
        .where(and(
          eq(assessmentAudioCleanupOutboxTable.id, obligation.id),
          eq(assessmentAudioCleanupOutboxTable.objectPath, obligation.objectPath),
          eq(assessmentAudioCleanupOutboxTable.state, "cleanup_pending"),
        ))
        .for("update").limit(1);
      if (!current || isAssessmentAudioValidationActive(jobId)) return false;
      const [answer] = await tx.select().from(assessmentAnswersTable)
        .where(eq(assessmentAnswersTable.frozenReservationPath, current.objectPath))
        .for("update").limit(1);
      if (answer) {
        await tx.update(assessmentAnswersTable)
          .set({
            frozenReservationPath: null,
            frozenReservationExpiresAt: null,
            frozenReservationSequence: null,
            frozenReservationCleanupPending: false,
            updatedAt: now,
          })
          .where(eq(assessmentAnswersTable.id, answer.id));
        if (
          answer.audioDeletedAt &&
          !answer.storagePath &&
          !answer.uploadStoragePath
        ) {
          await tx.update(assessmentAnswersTable)
            .set({ audioDeletePending: false, updatedAt: now })
            .where(eq(assessmentAnswersTable.id, answer.id));
        }
      }
      await tx.delete(assessmentAudioCleanupOutboxTable)
        .where(eq(assessmentAudioCleanupOutboxTable.id, current.id));
      await tx.insert(assessmentAuditEventsTable).values({
        id: randomUUID(),
        attemptId: current.attemptId,
        actorId: "system:assessment-retention",
        eventType: "assessment_audio_cleanup_obligation_completed",
        payload: {
          questionId: current.questionId,
          sequence: current.sequence,
          answerStillExists: Boolean(answer),
        },
        createdAt: now,
      });
      return true;
    });
    if (cleared) removed += 1;
  }

  const uploadOutboxDue = await db.select().from(assessmentAudioUploadCleanupOutboxTable)
    .where(or(
      eq(assessmentAudioUploadCleanupOutboxTable.state, "cleanup_pending"),
      lte(assessmentAudioUploadCleanupOutboxTable.leaseExpiresAt, now),
    ))
    .orderBy(assessmentAudioUploadCleanupOutboxTable.leaseExpiresAt)
    .limit(CLEANUP_BATCH);
  for (const obligation of uploadOutboxDue) {
    const [claim] = await db.update(assessmentAudioUploadCleanupOutboxTable)
      .set({ state: "cleanup_pending", updatedAt: now })
      .where(and(
        eq(assessmentAudioUploadCleanupOutboxTable.id, obligation.id),
        eq(assessmentAudioUploadCleanupOutboxTable.objectPath, obligation.objectPath),
        or(
          eq(assessmentAudioUploadCleanupOutboxTable.state, "cleanup_pending"),
          lte(assessmentAudioUploadCleanupOutboxTable.leaseExpiresAt, now),
        ),
      ))
      .returning({ id: assessmentAudioUploadCleanupOutboxTable.id });
    if (!claim) continue;
    try {
      await removeRemoteAudio(obligation.objectPath);
    } catch (error) {
      logger.warn({ assessmentAudioUploadOutboxId: obligation.id, errorType: error instanceof Error ? error.name : "UnknownError" }, "Cancelled signed assessment upload cleanup will retry");
      continue;
    }
    await db.delete(assessmentAudioUploadCleanupOutboxTable)
      .where(and(
        eq(assessmentAudioUploadCleanupOutboxTable.id, obligation.id),
        eq(assessmentAudioUploadCleanupOutboxTable.state, "cleanup_pending"),
      ));
    removed += 1;
  }
  return removed;
}

let cleanupTimer: NodeJS.Timeout | undefined;
export function startAssessmentRetentionCleanup() {
  if (cleanupTimer) return;
  const run = () => {
    void cleanupExpiredAssessmentAudio().catch((error: unknown) => {
      logger.warn({ errorType: error instanceof Error ? error.name : "UnknownError" }, "Assessment audio retention cleanup failed; it will retry");
    });
  };
  run();
  cleanupTimer = setInterval(run, 15 * 60 * 1000);
  cleanupTimer.unref();
}