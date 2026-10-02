import { sql } from "drizzle-orm";
import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";

export const studyProgressTable = pgTable(
  "mateen_study_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => profilesTable.clerkId, { onDelete: "cascade" }),
    textId: text("text_id").notNull(),
    currentHadith: integer("current_hadith").notNull(),
    completedIds: integer("completed_ids")
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    bookmarkedIds: integer("bookmarked_ids")
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.userId, table.textId] })],
);

export const insertStudyProgressSchema = createInsertSchema(studyProgressTable);
export type InsertStudyProgress = z.infer<typeof insertStudyProgressSchema>;
export type StudyProgress = typeof studyProgressTable.$inferSelect;