import { pgEnum, pgTable, text, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const profileRole = pgEnum("mateen_profile_role", ["student", "teacher"]);

export const profilesTable = pgTable("mateen_profiles", {
  clerkId: text("clerk_id").primaryKey(),
  name: text("name").notNull().default(""),
  role: profileRole("role").notNull().default("student"),
  onboarded: boolean("onboarded").notNull().default(false),
  learningPreferences: jsonb("learning_preferences").$type<{
    age: number | null;
    memorized: string;
    goal: "memorize" | "review" | "both";
    dailyMinutes: 10 | 15 | 30 | 45 | 60;
  }>(),
});

export const insertProfileSchema = createInsertSchema(profilesTable);
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;