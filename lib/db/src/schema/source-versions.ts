import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sourceReviewStatus = pgEnum("mateen_source_review_status", [
  "pending_review",
  "approved",
  "rejected",
  "withdrawn",
]);
export const sourceScientificStatus = pgEnum(
  "mateen_source_scientific_status",
  ["pending", "approved", "rejected"],
);
export const sourceRightsStatus = pgEnum("mateen_source_rights_status", [
  "pending",
  "cleared",
  "rejected",
]);

/**
 * Each row is an immutable version of one numbered source entry. Review
 * columns record decisions about that snapshot; the JSON payload and its hash
 * are never updated when a new version is submitted.
 */
export const sourceVersionsTable = pgTable(
  "mateen_source_versions",
  {
    id: text("id").primaryKey(),
    hadithNumber: integer("hadith_number").notNull(),
    version: integer("version").notNull(),
    payload: jsonb("payload").$type<{
      hadithNumber: number;
      text: string;
      printedPage: number;
      viewerPage: number;
      viewerUrl: string;
      edition: string;
      changeReason: string;
      rightsEvidence: string;
      rightsUrl: string;
    }>().notNull(),
    payloadHash: text("payload_hash").notNull(),
    status: sourceReviewStatus("status").notNull().default("pending_review"),
    scientificStatus: sourceScientificStatus("scientific_status")
      .notNull()
      .default("pending"),
    rightsStatus: sourceRightsStatus("rights_status").notNull().default("pending"),
    scientificReviewerId: text("scientific_reviewer_id"),
    scientificReason: text("scientific_reason"),
    scientificReviewedAt: timestamp("scientific_reviewed_at", {
      withTimezone: true,
    }),
    rightsReviewerId: text("rights_reviewer_id"),
    rightsReason: text("rights_reason"),
    rightsReviewedAt: timestamp("rights_reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").notNull(),
  },
  (table) => [
    uniqueIndex("mateen_source_versions_number_version_uq").on(
      table.hadithNumber,
      table.version,
    ),
    index("mateen_source_versions_status_idx").on(
      table.status,
      table.hadithNumber,
    ),
    index("mateen_source_versions_hash_idx").on(table.payloadHash),
  ],
);

export const insertSourceVersionSchema = createInsertSchema(sourceVersionsTable);
export type InsertSourceVersion = z.infer<typeof insertSourceVersionSchema>;
export type SourceVersion = typeof sourceVersionsTable.$inferSelect;