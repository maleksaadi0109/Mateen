import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assessmentStatus = pgEnum("mateen_assessment_status", [
  "in_progress",
  "paused_connection",
  "submitted",
  "technical_review",
  "passed",
  "failed",
]);

export const assessmentAttemptsTable = pgTable(
  "mateen_assessment_attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    status: assessmentStatus("status").notNull().default("in_progress"),
    textId: text("text_id").notNull().default("nawawi"),
    sourceVersion: text("source_version").notNull(),
    canonicalHash: text("canonical_hash").notNull(),
    policySnapshot: jsonb("policy_snapshot").notNull(),
    questionsSnapshot: jsonb("questions_snapshot").notNull(),
    sessionId: text("session_id").notNull(),
    activeSeconds: integer("active_seconds").notNull().default(0),
    activeMilliseconds: integer("active_milliseconds").notNull().default(0),
    currentQuestionPosition: integer("current_question_position").notNull().default(0),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    lastTrustedAt: timestamp("last_trusted_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    retryAvailableAt: timestamp("retry_available_at", { withTimezone: true }),
    result: jsonb("result"),
    submitMutationId: text("submit_mutation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("mateen_assessment_attempts_owner_created").on(table.userId, table.createdAt),
    index("mateen_assessment_attempts_status_created").on(table.status, table.createdAt),
    uniqueIndex("mateen_assessment_attempts_one_active_owner")
      .on(table.userId)
      .where(sql`${table.status} IN ('in_progress', 'paused_connection')`),
    uniqueIndex("mateen_assessment_attempts_submit_mutation")
      .on(table.userId, table.submitMutationId)
      .where(sql`${table.submitMutationId} IS NOT NULL`),
    check("mateen_assessment_attempts_nawawi_only", sql`${table.textId} = 'nawawi'`),
    check("mateen_assessment_attempts_active_range", sql`${table.activeSeconds} BETWEEN 0 AND 1800`),
    check("mateen_assessment_attempts_active_milliseconds", sql`${table.activeMilliseconds} BETWEEN 0 AND 999`),
    check("mateen_assessment_attempts_position_range", sql`${table.currentQuestionPosition} BETWEEN 0 AND 29`),
  ],
);

export const assessmentAnswersTable = pgTable(
  "mateen_assessment_answers",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id").notNull(),
    userId: text("user_id").notNull(),
    questionId: text("question_id").notNull(),
    position: integer("position").notNull(),
    kind: text("kind").notNull(),
    hadithNumber: integer("hadith_number").notNull(),
    prompt: text("prompt").notNull(),
    referenceText: text("reference_text").notNull(),
    writtenAnswer: text("written_answer"),
    answerSequence: integer("answer_sequence").notNull().default(0),
    lastMutationId: text("last_mutation_id"),
    audioSequence: integer("audio_sequence").notNull().default(0),
    pendingAudioSequence: integer("pending_audio_sequence"),
    expectedSizeBytes: integer("expected_size_bytes"),
    expectedContentType: text("expected_content_type"),
    actualDurationSeconds: real("actual_duration_seconds"),
    storagePath: text("storage_path"),
    uploadStoragePath: text("upload_storage_path"),
    uploadExpiresAt: timestamp("upload_expires_at", { withTimezone: true }),
    frozenReservationPath: text("frozen_reservation_path"),
    frozenReservationExpiresAt: timestamp("frozen_reservation_expires_at", { withTimezone: true }),
    frozenReservationSequence: integer("frozen_reservation_sequence"),
    frozenReservationCleanupPending: boolean("frozen_reservation_cleanup_pending").notNull().default(false),
    audioAvailable: boolean("audio_available").notNull().default(false),
    audioDeletedAt: timestamp("audio_deleted_at", { withTimezone: true }),
    audioDeletePending: boolean("audio_delete_pending").notNull().default(false),
    audioExpiresAt: timestamp("audio_expires_at", { withTimezone: true }),
    verifiedTranscript: text("verified_transcript"),
    technicalIssue: text("technical_issue"),
    score: integer("score"),
    differences: jsonb("differences"),
    provenance: text("provenance"),
    status: text("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("mateen_assessment_answers_attempt_question").on(table.attemptId, table.questionId),
    uniqueIndex("mateen_assessment_answers_attempt_position").on(table.attemptId, table.position),
    index("mateen_assessment_answers_review_queue").on(table.status, table.createdAt),
    index("mateen_assessment_answers_retention").on(table.audioExpiresAt),
    index("mateen_assessment_answers_frozen_reservation_expiry")
      .on(table.frozenReservationExpiresAt)
      .where(sql`${table.frozenReservationPath} IS NOT NULL`),
    check("mateen_assessment_answers_position", sql`${table.position} BETWEEN 1 AND 30`),
    check("mateen_assessment_answers_kind", sql`${table.kind} IN ('written', 'oral')`),
    check("mateen_assessment_answers_score", sql`${table.score} IS NULL OR ${table.score} IN (0, 1)`),
    check("mateen_assessment_answers_audio_size", sql`${table.expectedSizeBytes} IS NULL OR ${table.expectedSizeBytes} BETWEEN 1 AND 10485760`),
    check("mateen_assessment_answers_audio_duration", sql`${table.actualDurationSeconds} IS NULL OR ${table.actualDurationSeconds} BETWEEN 0 AND 60`),
    check("mateen_assessment_answers_frozen_reservation_pair", sql`(${table.frozenReservationPath} IS NULL) = (${table.frozenReservationExpiresAt} IS NULL) AND (${table.frozenReservationPath} IS NULL) = (${table.frozenReservationSequence} IS NULL)`),
    check(
      "mateen_assessment_answers_frozen_reservation_path",
      sql`${table.frozenReservationPath} IS NULL OR ${table.frozenReservationPath} ~ '^/objects/([A-Za-z0-9_-][A-Za-z0-9._-]*/)*assessment-audio/frozen/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'`,
    ),
    check("mateen_assessment_answers_storage_reservation_exclusive", sql`${table.storagePath} IS NULL OR ${table.frozenReservationPath} IS NULL`),
    check("mateen_assessment_answers_frozen_reservation_cleanup_state", sql`${table.frozenReservationPath} IS NOT NULL OR ${table.frozenReservationCleanupPending} = false`),
  ],
);

export const assessmentAuditEventsTable = pgTable(
  "mateen_assessment_audit_events",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id").notNull(),
    actorId: text("actor_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("mateen_assessment_audit_attempt_time").on(table.attemptId, table.createdAt)],
);

export const assessmentAudioCleanupOutboxTable = pgTable(
  "mateen_assessment_audio_cleanup_outbox",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id").notNull(),
    questionId: text("question_id").notNull(),
    sequence: integer("sequence").notNull(),
    objectPath: text("object_path").notNull(),
    state: text("state").notNull(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("mateen_assessment_audio_cleanup_object_path").on(table.objectPath),
    uniqueIndex("mateen_assessment_audio_cleanup_job")
      .on(table.attemptId, table.questionId, table.sequence),
    index("mateen_assessment_audio_cleanup_due").on(table.state, table.leaseExpiresAt),
    check("mateen_assessment_audio_cleanup_state", sql`${table.state} IN ('reserved', 'writing', 'cleanup_pending')`),
    check(
      "mateen_assessment_audio_cleanup_path",
      sql`${table.objectPath} ~ '^/objects/([A-Za-z0-9_-][A-Za-z0-9._-]*/)*assessment-audio/frozen/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'`,
    ),
    check("mateen_assessment_audio_cleanup_sequence", sql`${table.sequence} > 0`),
  ],
);

export const assessmentAudioUploadCleanupOutboxTable = pgTable(
  "mateen_assessment_audio_upload_cleanup_outbox",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id").notNull(),
    questionId: text("question_id").notNull(),
    sequence: integer("sequence").notNull(),
    objectPath: text("object_path").notNull(),
    state: text("state").notNull(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("mateen_assessment_audio_upload_cleanup_object_path").on(table.objectPath),
    index("mateen_assessment_audio_upload_cleanup_due").on(table.state, table.leaseExpiresAt),
    check("mateen_assessment_audio_upload_cleanup_state", sql`${table.state} IN ('pending', 'cleanup_pending')`),
    check("mateen_assessment_audio_upload_cleanup_path", sql`${table.objectPath} LIKE '/objects/uploads/%'`),
    check("mateen_assessment_audio_upload_cleanup_sequence", sql`${table.sequence} > 0`),
  ],
);

export const assessmentReviewerGrantsTable = pgTable("mateen_assessment_reviewer_grants", {
  clerkId: text("clerk_id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  operatorLabel: text("operator_label").notNull(),
});

export const scheduledReviewsTable = pgTable(
  "mateen_scheduled_reviews",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    textId: text("text_id").notNull().default("nawawi"),
    hadithNumber: integer("hadith_number").notNull(),
    passageKey: text("passage_key").notNull(),
    sourceVersion: text("source_version").notNull(),
    windowStartWord: integer("window_start_word").notNull(),
    passagePrompt: text("passage_prompt"),
    referenceText: text("reference_text"),
    sourceAttemptId: text("source_attempt_id"),
    sourceQuestionId: text("source_question_id"),
    sourceMistake: text("source_mistake"),
    intervalDays: integer("interval_days").notNull().default(1),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastMutationId: text("last_mutation_id"),
    lastResponse: jsonb("last_response"),
    lastCorrect: boolean("last_correct"),
    lastAnswer: text("last_answer"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("mateen_scheduled_reviews_owner_passage").on(table.userId, table.passageKey),
    index("mateen_scheduled_reviews_due").on(table.userId, table.dueAt),
    check("mateen_scheduled_reviews_hadith_range", sql`${table.hadithNumber} BETWEEN 1 AND 42`),
    check("mateen_scheduled_reviews_interval", sql`${table.intervalDays} IN (1, 3, 7, 14, 30)`),
    check("mateen_scheduled_reviews_passage_key_nonempty", sql`length(${table.passageKey}) > 0`),
    check("mateen_scheduled_reviews_window_start_nonnegative", sql`${table.windowStartWord} >= 0`),
  ],
);

export const insertAssessmentAttemptSchema = createInsertSchema(assessmentAttemptsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertAssessmentAnswerSchema = createInsertSchema(assessmentAnswersTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertScheduledReviewSchema = createInsertSchema(scheduledReviewsTable).omit({
  updatedAt: true,
});
export type InsertAssessmentAttempt = z.infer<typeof insertAssessmentAttemptSchema>;
export type AssessmentAttemptRecord = typeof assessmentAttemptsTable.$inferSelect;
export type AssessmentAnswerRecord = typeof assessmentAnswersTable.$inferSelect;
export type ScheduledReviewRecord = typeof scheduledReviewsTable.$inferSelect;