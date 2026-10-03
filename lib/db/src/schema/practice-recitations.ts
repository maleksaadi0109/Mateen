import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  check,
} from "drizzle-orm/pg-core";

export const practiceRecitationStatus = pgEnum("mateen_practice_recitation_status", [
  "uploading",
  "processing",
  "completed",
  "error",
  "deleted",
]);

export const practiceRecitationsTable = pgTable(
  "mateen_practice_recitations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    textId: text("text_id").notNull(),
    hadithNumber: integer("hadith_number").notNull(),
    expectedSizeBytes: integer("expected_size_bytes").notNull(),
    expectedContentType: text("expected_content_type").notNull(),
    storagePath: text("storage_path"),
    status: practiceRecitationStatus("status").notNull().default("uploading"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    uploadExpiresAt: timestamp("upload_expires_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    error: text("error"),
    result: jsonb("result"),
    audioDeleted: boolean("audio_deleted").notNull().default(false),
  },
  (table) => [
    check(
      "mateen_practice_recitations_uuid_id",
      sql`${table.id} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`,
    ),
    check("mateen_practice_recitations_nawawi_only", sql`${table.textId} = 'nawawi'`),
    check(
      "mateen_practice_recitations_hadith_range",
      sql`${table.hadithNumber} BETWEEN 1 AND 42`,
    ),
    check(
      "mateen_practice_recitations_size_range",
      sql`${table.expectedSizeBytes} BETWEEN 1 AND 10485760`,
    ),
    check(
      "mateen_practice_recitations_content_type",
      sql`${table.expectedContentType} IN ('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg')`,
    ),
  ],
);

export type PracticeRecitationRecord = typeof practiceRecitationsTable.$inferSelect;