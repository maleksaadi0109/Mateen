import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { profilesTable } from "./profiles";

export const scholarlySourceStatus = pgEnum("mateen_scholarly_source_status", [
  "draft",
  "reviewed",
  "indexed",
  "withdrawn",
]);
export const scholarlyLegalAuthorization = pgEnum("mateen_scholarly_legal_authorization", [
  "public_domain",
  "licensed",
  "permission_granted",
]);
export const scholarlyRole = pgEnum("mateen_scholarly_message_role", [
  "student",
  "assistant",
  "teacher",
]);
export const scholarlyReferralStatus = pgEnum("mateen_scholarly_referral_status", [
  "open",
  "answered",
  "closed",
  "waiting_for_teacher",
]);
export const scholarlyIssueStatus = pgEnum("mateen_scholarly_issue_status", [
  "open",
  "reviewed",
  "resolved",
]);

export const scholarlySourcesTable = pgTable("mateen_scholarly_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  edition: text("edition").notNull(),
  publisher: text("publisher"),
  legalAuthorization: scholarlyLegalAuthorization("legal_authorization").notNull(),
  authorizationReference: text("authorization_reference").notNull(),
  version: text("version").notNull(),
  status: scholarlySourceStatus("status").notNull().default("draft"),
  createdBy: text("created_by").notNull().references(() => profilesTable.clerkId),
  reviewedBy: text("reviewed_by").references(() => profilesTable.clerkId),
  reviewNote: text("review_note"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  indexedAt: timestamp("indexed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scholarlyPassagesTable = pgTable("mateen_scholarly_passages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id").notNull().references(() => scholarlySourcesTable.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  volume: integer("volume"),
  printedPage: text("printed_page"),
  pdfPage: integer("pdf_page"),
  indexed: boolean("indexed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scholarlyCorpusTable = pgTable("mateen_scholarly_corpus_state", {
  id: integer("id").primaryKey().default(1),
  corpusHash: text("corpus_hash").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scholarlyConversationsTable = pgTable("mateen_scholarly_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: text("student_id").notNull().references(() => profilesTable.clerkId),
  topic: text("topic").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scholarlyQuestionsTable = pgTable("mateen_scholarly_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => scholarlyConversationsTable.id, { onDelete: "cascade" }),
  studentId: text("student_id").notNull().references(() => profilesTable.clerkId),
  question: text("question").notNull(),
  textContext: text("text_context"),
  textId: text("text_id"),
  answer: text("answer"),
  status: text("status").notNull(),
  reason: text("abstention_reason"),
  model: text("model").notNull(),
  corpusHash: text("corpus_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scholarlyMessagesTable = pgTable("mateen_scholarly_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => scholarlyConversationsTable.id, { onDelete: "cascade" }),
  questionId: uuid("question_id").references(() => scholarlyQuestionsTable.id, { onDelete: "cascade" }),
  senderId: text("sender_id").references(() => profilesTable.clerkId),
  role: scholarlyRole("role").notNull(),
  text: text("text").notNull(),
  citations: jsonb("citations").$type<Array<Record<string, unknown>>>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scholarlyReferralsTable = pgTable(
  "mateen_scholarly_referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => scholarlyConversationsTable.id, { onDelete: "cascade" }),
    questionId: uuid("question_id").notNull().references(() => scholarlyQuestionsTable.id, { onDelete: "cascade" }),
    studentId: text("student_id").notNull().references(() => profilesTable.clerkId),
    teacherId: text("teacher_id").references(() => profilesTable.clerkId),
    reason: text("reason").notNull(),
    contextShared: text("context_shared"),
    status: scholarlyReferralStatus("status").notNull().default("open"),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("mateen_scholarly_referral_question_unique").on(table.questionId)],
);

export const scholarlyNotificationsTable = pgTable("mateen_scholarly_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => profilesTable.clerkId, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").notNull().references(() => scholarlyConversationsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  text: text("text").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scholarlyIssuesTable = pgTable("mateen_scholarly_issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id").notNull().references(() => scholarlyQuestionsTable.id, { onDelete: "cascade" }),
  reporterId: text("reporter_id").notNull().references(() => profilesTable.clerkId),
  category: text("category").notNull(),
  description: text("description").notNull(),
  status: scholarlyIssueStatus("status").notNull().default("open"),
  moderationNote: text("moderation_note"),
  moderatedBy: text("moderated_by").references(() => profilesTable.clerkId),
  moderatedAt: timestamp("moderated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scholarlyAuditTable = pgTable("mateen_scholarly_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: text("actor_id").notNull().references(() => profilesTable.clerkId),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  reason: text("reason").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scholarlyEvaluationsTable = pgTable("mateen_scholarly_evaluations", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: text("actor_id").notNull().references(() => profilesTable.clerkId),
  model: text("model").notNull(),
  corpusHash: text("corpus_hash").notNull(),
  arabicQualityPassed: boolean("arabic_quality_passed").notNull(),
  groundingPassed: boolean("grounding_passed").notNull(),
  abstentionPassed: boolean("abstention_passed").notNull(),
  serverRunPassed: boolean("server_run_passed").notNull(),
  evaluationNote: text("evaluation_note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scholarlyRuntimeConfigTable = pgTable("mateen_scholarly_runtime_config", {
  id: integer("id").primaryKey().default(1),
  model: text("model").notNull().default("gpt-5.4-mini"),
  updatedBy: text("updated_by").references(() => profilesTable.clerkId),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertScholarlySourceSchema = createInsertSchema(scholarlySourcesTable);
export type InsertScholarlySource = z.infer<typeof insertScholarlySourceSchema>;
export type ScholarlySource = typeof scholarlySourcesTable.$inferSelect;
export const insertScholarlyPassageSchema = createInsertSchema(scholarlyPassagesTable);
export type InsertScholarlyPassage = z.infer<typeof insertScholarlyPassageSchema>;
export type ScholarlyPassage = typeof scholarlyPassagesTable.$inferSelect;
export type ScholarlyConversation = typeof scholarlyConversationsTable.$inferSelect;
export type ScholarlyQuestion = typeof scholarlyQuestionsTable.$inferSelect;
export type ScholarlyMessage = typeof scholarlyMessagesTable.$inferSelect;
export type ScholarlyReferral = typeof scholarlyReferralsTable.$inferSelect;