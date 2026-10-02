import { boolean, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";

export const teacherApplicationStatus = pgEnum(
  "mateen_teacher_application_status",
  ["draft", "pending_review", "approved"],
);

export const teacherApplicationsTable = pgTable("mateen_teacher_applications", {
  userId: text("user_id")
    .primaryKey()
    .references(() => profilesTable.clerkId, { onDelete: "cascade" }),
  biography: text("biography").notNull().default(""),
  specialties: text("specialties").notNull().default(""),
  available: boolean("available").notNull().default(false),
  status: teacherApplicationStatus("status").notNull().default("draft"),
});

export const insertTeacherApplicationSchema = createInsertSchema(
  teacherApplicationsTable,
);
export type InsertTeacherApplication = z.infer<
  typeof insertTeacherApplicationSchema
>;
export type TeacherApplication = typeof teacherApplicationsTable.$inferSelect;