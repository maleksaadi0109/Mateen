import { date, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { profilesTable } from "./profiles";

export const dailyPlansTable = pgTable("mateen_daily_plans", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => profilesTable.clerkId, { onDelete: "cascade" }),
  day: date("day", { mode: "string" }).notNull(),
  timezone: text("timezone").notNull(),
  revision: integer("revision").notNull().default(1),
  dailyMinutes: integer("daily_minutes").notNull(),
  goal: text("goal").notNull(),
  tasks: jsonb("tasks").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("mateen_daily_plans_owner_day").on(t.userId, t.day)]);
export const insertDailyPlanSchema = createInsertSchema(dailyPlansTable);
export type DailyPlanRecord = typeof dailyPlansTable.$inferSelect;
