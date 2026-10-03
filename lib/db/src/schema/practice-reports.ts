import { pgTable, text, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Immutable, consented practice snapshots, deliberately separate from assessments.
export const practiceReportsTable = pgTable("mateen_practice_reports", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  attemptId: text("attempt_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  summary: jsonb("summary").notNull(),
  issues: jsonb("issues").notNull(),
}, t => [
  uniqueIndex("mateen_practice_reports_owner_attempt").on(t.userId, t.attemptId),
  index("mateen_practice_reports_owner_created").on(t.userId, t.createdAt),
]);
export const insertPracticeReportSchema = createInsertSchema(practiceReportsTable).omit({ id: true, createdAt: true });
export type InsertPracticeReport = z.infer<typeof insertPracticeReportSchema>;
export type PracticeReportRecord = typeof practiceReportsTable.$inferSelect;