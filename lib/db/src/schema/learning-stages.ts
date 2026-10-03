import { pgTable, text, integer, timestamp, jsonb, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Motivational browser-ASR milestones, NEVER evidence for formal assessment.
export const learningStagesTable = pgTable("mateen_learning_stages", {
  userId: text("user_id").notNull(),
  textId: text("text_id").notNull(),
  stageNumber: integer("stage_number").notNull(),
  bestPercent: integer("best_percent").notNull(),
  passedAt: timestamp("passed_at", { withTimezone: true }),
}, t => [primaryKey({ columns: [t.userId, t.textId, t.stageNumber] })]);

export const stageAttemptsTable = pgTable("mateen_stage_attempts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  requestId: text("request_id").notNull(),
  stageNumber: integer("stage_number").notNull(),
  sourceHash: text("source_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  result: jsonb("result"),
}, t => [
  uniqueIndex("mateen_stage_attempt_owner_request").on(t.userId, t.requestId),
  index("mateen_stage_attempt_expiry").on(t.expiresAt),
]);

export const insertLearningStageSchema = createInsertSchema(learningStagesTable);
export type InsertLearningStage = z.infer<typeof insertLearningStageSchema>;
export const insertStageAttemptSchema = createInsertSchema(stageAttemptsTable);
export type InsertStageAttempt = z.infer<typeof insertStageAttemptSchema>;