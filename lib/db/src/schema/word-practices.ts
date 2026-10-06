import { pgTable, text, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Student-selected rehearsal, never assessment evidence or confirmed mistakes.
export const wordPracticesTable = pgTable("mateen_word_practices", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  requestId: text("request_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  selection: jsonb("selection").notNull(),
  attempts: jsonb("attempts").notNull(),
}, t => [
  uniqueIndex("mateen_word_practices_owner_request").on(t.userId, t.requestId),
  index("mateen_word_practices_owner_created").on(t.userId, t.createdAt),
]);
export const insertWordPracticeSchema = createInsertSchema(wordPracticesTable).omit({ id: true, createdAt: true });
export type InsertWordPractice = z.infer<typeof insertWordPracticeSchema>;
export type WordPracticeRecord = typeof wordPracticesTable.$inferSelect;
