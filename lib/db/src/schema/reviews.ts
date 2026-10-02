import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { profilesTable } from "./profiles";

export const teacherReviewsTable = pgTable("mateen_teacher_reviews", {
  userId: text("user_id")
    .primaryKey()
    .references(() => profilesTable.clerkId, { onDelete: "cascade" }),
  status: text("status").notNull().default("draft"),
  revision: integer("revision").notNull().default(0),
  reason: text("reason").notNull().default(""),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  check(
    "mateen_teacher_reviews_status_ck",
    sql`${table.status} in ('draft', 'pending_review', 'approved', 'needs_information', 'rejected')`,
  ),
  check("mateen_teacher_reviews_revision_ck", sql`${table.revision} >= 0`),
]);

export const qualificationDocumentsTable = pgTable(
  "mateen_qualification_documents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => profilesTable.clerkId, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    size: integer("size").notNull(),
    contentType: text("content_type").notNull(),
    status: text("status").notNull().default("uploading"),
    stagingObject: text("staging_object").notNull(),
    cleanObject: text("clean_object"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("mateen_qualification_documents_owner_idx").on(
      table.userId,
      table.uploadedAt,
    ),
    check(
      "mateen_qualification_documents_kind_ck",
      sql`${table.kind} in ('qualification', 'ijaza')`,
    ),
    check(
      "mateen_qualification_documents_status_ck",
      sql`${table.status} in ('uploading', 'clean', 'rejected')`,
    ),
    check(
      "mateen_qualification_documents_size_ck",
      sql`${table.size} between 1 and 10485760`,
    ),
    check(
      "mateen_qualification_documents_type_ck",
      sql`${table.contentType} in ('application/pdf', 'image/jpeg', 'image/png')`,
    ),
  ],
);

export const reviewAuditTable = pgTable(
  "mateen_review_audit",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    scope: text("scope").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("mateen_review_audit_scope_created_idx").on(
      table.scope,
      table.createdAt,
    ),
    index("mateen_review_audit_target_created_idx").on(
      table.targetId,
      table.createdAt,
    ),
    check(
      "mateen_review_audit_scope_ck",
      sql`${table.scope} in ('content', 'qualification')`,
    ),
    check("mateen_review_audit_reason_nonempty_ck", sql`length(trim(${table.reason})) > 0`),
  ],
);