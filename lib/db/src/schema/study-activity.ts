import { date, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { profilesTable } from "./profiles";

export const studyActivitySettingsTable = pgTable("mateen_study_activity_settings", {
  userId: text("user_id").primaryKey().references(() => profilesTable.clerkId, { onDelete: "cascade" }),
  timezone: text("timezone").notNull(),
});
export const studyActivityDaysTable = pgTable("mateen_study_activity_days", {
  userId: text("user_id").notNull().references(() => profilesTable.clerkId, { onDelete: "cascade" }),
  day: date("day", { mode: "string" }).notNull(),
}, t => [primaryKey({ columns: [t.userId, t.day] })]);
// Short-lived anti-replay evidence only; no speech, report, or question content.
export const studyActivitySessionsTable = pgTable("mateen_study_activity_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => profilesTable.clerkId, { onDelete: "cascade" }),
  requestId: text("request_id").notNull(),
  kind: text("kind").notNull(),
  page: integer("page").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedDay: date("completed_day", { mode: "string" }),
}, t => [
  uniqueIndex("mateen_activity_session_request").on(t.userId, t.requestId),
  index("mateen_activity_session_started").on(t.startedAt),
]);
export const insertStudyActivityDaySchema = createInsertSchema(studyActivityDaysTable);
export type StudyActivityDay = typeof studyActivityDaysTable.$inferSelect;
export type StudyActivitySession = typeof studyActivitySessionsTable.$inferSelect;