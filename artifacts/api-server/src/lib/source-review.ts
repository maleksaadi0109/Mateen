import { createHash } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  db,
  sourceVersionsTable,
  type SourceVersion,
} from "@workspace/db";
import { addReviewAudit } from "./review-audit";
import {
  canUseForGrading,
  sourceVersionInputSchema,
  validateApprovalEvidence,
  type SourceDecision,
  type SourceVersionInput,
} from "./source-review-policy";
import initialNawawiRecords from "../data/nawawi.json";

export {
  sourceDecisionSchema,
  sourceVersionInputSchema,
  validateApprovalEvidence,
  canUseForGrading,
} from "./source-review-policy";
export { isEligibleContentReviewer } from "./source-review-policy";

export type NawawiGradingRecord = {
  id: number;
  number: number;
  title: string;
  text: string;
  sourcePage: number;
  sourceUrl: string;
  versionId: string;
  version: number;
  payloadHash: string;
};

function payloadForVersion(row: SourceVersion): SourceVersionInput {
  return sourceVersionInputSchema.parse(row.payload);
}

export function toSourceVersionRecord(
  row: SourceVersion,
  history: Array<{
    id: string;
    actorId: string;
    action: string;
    targetId: string;
    reason: string;
    createdAt: Date | string;
  }> = [],
) {
  return {
    ...payloadForVersion(row),
    id: row.id,
    version: row.version,
    status: row.status,
    scientificStatus: row.scientificStatus,
    rightsStatus: row.rightsStatus,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    history: history.map((item) => ({
      ...item,
      createdAt:
        item.createdAt instanceof Date
          ? item.createdAt.toISOString()
          : item.createdAt,
    })),
  };
}

const initialSeedLockKey = 619_042;
let seedPromise: Promise<void> | undefined;

/**
 * Lazily imports the already-retrieved 42 exact records. The resulting rows
 * are pending both scientific and rights review; public availability is not
 * treated as a license. No file access occurs until this function is called.
 */
export async function seedInitialNawawiSourceVersions(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const records = initialNawawiRecords as Array<{
        id: number;
        number: number;
        title: string;
        text: string;
        sourcePage: number;
        sourceUrl: string;
      }>;
      if (
        records.length !== 42 ||
        new Set(records.map((record) => record.number)).size !== 42 ||
        records.some(
          (record, index) => record.number !== index + 1 || record.id !== record.number,
        )
      ) {
        throw new Error("Initial Nawawi import must contain exactly numbered entries 1–42.");
      }
      await db.transaction(
        async (tx) => {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(${initialSeedLockKey})`,
          );
          const existing = await tx
            .select({ id: sourceVersionsTable.id })
            .from(sourceVersionsTable);
          const initialIds = new Set(
            records.map((record) => `nawawi-${record.number}-v1`),
          );
          const existingIds = new Set(existing.map((row) => row.id));
          if ([...initialIds].every((id) => existingIds.has(id))) return;
          if (existing.length) {
            throw new Error(
              "Initial source versions are only partially seeded; refusing to replace or infer records.",
            );
          }

          for (const record of records) {
            const viewerUrl = new URL(record.sourceUrl);
            const viewerPage = Number(viewerUrl.searchParams.get("page"));
            if (!Number.isInteger(viewerPage) || viewerPage < 1) {
              throw new Error(`Initial source ${record.number} has no valid viewer page.`);
            }
            const payload: SourceVersionInput = {
              hadithNumber: record.number,
              text: record.text,
              printedPage: record.sourcePage,
              viewerPage,
              viewerUrl: record.sourceUrl,
              edition: "بيانات الطبعة غير متوفرة في بيانات المصدر الأولية",
              changeReason:
                "استيراد أولي من سجل المصدر المسترجع؛ النص محفوظ كما ورد وينتظر المقابلة العلمية واستبعاد المواد التحريرية.",
              rightsEvidence: "",
              rightsUrl: "",
            };
            const [inserted] = await tx.insert(sourceVersionsTable).values({
              id: `nawawi-${record.number}-v1`,
              hadithNumber: record.number,
              version: 1,
              payload,
              payloadHash: hashSourcePayload(payload),
              createdBy: "system:initial-import",
            }).returning();
            await addReviewAudit(
              tx,
              "system:initial-import",
              "source_version_seeded",
              inserted.id,
              payload.changeReason,
            );
          }
        },
        { isolationLevel: "serializable" },
      );
    })().catch((error) => {
      seedPromise = undefined;
      throw error;
    });
  }
  return seedPromise;
}

export function hashSourcePayload(payload: SourceVersionInput): string {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

export async function getApprovedNawawiRecords(): Promise<NawawiGradingRecord[]> {
  await seedInitialNawawiSourceVersions();
  const approved = await db
    .select()
    .from(sourceVersionsTable)
    .where(
      and(
        eq(sourceVersionsTable.status, "approved"),
        eq(sourceVersionsTable.scientificStatus, "approved"),
        eq(sourceVersionsTable.rightsStatus, "cleared"),
      ),
    )
    .orderBy(asc(sourceVersionsTable.hadithNumber), asc(sourceVersionsTable.version));

  const latestApprovedByNumber = new Map<number, SourceVersion>();
  for (const row of approved) {
    if (canUseForGrading(row)) latestApprovedByNumber.set(row.hadithNumber, row);
  }
  return [...latestApprovedByNumber.values()]
    .sort((a, b) => a.hadithNumber - b.hadithNumber)
    .map((row) => {
      const payload = payloadForVersion(row);
      return {
        id: payload.hadithNumber,
        number: payload.hadithNumber,
        title: `الحديث ${payload.hadithNumber}`,
        text: payload.text,
        sourcePage: payload.printedPage,
        sourceUrl: payload.viewerUrl,
        versionId: row.id,
        version: row.version,
        payloadHash: row.payloadHash,
      };
    });
}

/** Snapshot-based study accessor: retrieved records remain visible but clearly pending. */
export async function getNawawiStudyRecords() {
  await seedInitialNawawiSourceVersions();
  const rows = await db
    .select()
    .from(sourceVersionsTable)
    .orderBy(asc(sourceVersionsTable.hadithNumber), asc(sourceVersionsTable.version));
  const latestByNumber = new Map<number, SourceVersion>();
  const latestApprovedByNumber = new Map<number, SourceVersion>();
  for (const row of rows) {
    latestByNumber.set(row.hadithNumber, row);
    if (canUseForGrading(row)) latestApprovedByNumber.set(row.hadithNumber, row);
  }
  const records = [...latestByNumber.entries()]
    .map(([hadithNumber, latest]) => latestApprovedByNumber.get(hadithNumber) ?? latest)
    .sort(
    (left, right) => left.hadithNumber - right.hadithNumber,
  );
  return {
    sourceStatus: records.length === 0
      ? "unavailable"
      : records.length === 42 && records.every(canUseForGrading)
        ? "approved"
        : "retrieved_pending_review",
    hadiths: records.map((row) => {
      const payload = payloadForVersion(row);
      return {
        id: payload.hadithNumber,
        number: payload.hadithNumber,
        title: `الحديث ${payload.hadithNumber}`,
        text: payload.text,
        sourceUrl: payload.viewerUrl,
        sourcePage: payload.printedPage,
        sourceVersionId: row.id,
        reviewStatus: row.status,
        viewerPage: payload.viewerPage,
      };
    }),
  } as const;
}

export async function createSourceVersion(
  input: SourceVersionInput,
  actorId: string,
) {
  await seedInitialNawawiSourceVersions();
  const row = await db.transaction(
    async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${619_000 + input.hadithNumber})`,
      );
      const [latest] = await tx
        .select()
        .from(sourceVersionsTable)
        .where(eq(sourceVersionsTable.hadithNumber, input.hadithNumber))
        .orderBy(sql`${sourceVersionsTable.version} DESC`)
        .limit(1);
      const payloadHash = hashSourcePayload(input);
      // Repeated delivery of the same creation request must not create a second
      // version or a second audit event.
      if (latest?.createdBy === actorId && latest.payloadHash === payloadHash) return latest;
      const nextVersion = (latest?.version ?? 0) + 1;
      const [inserted] = await tx
        .insert(sourceVersionsTable)
        .values({
          id: crypto.randomUUID(),
          hadithNumber: input.hadithNumber,
          version: nextVersion,
          payload: input,
          payloadHash,
          createdBy: actorId,
        })
        .returning();
      await addReviewAudit(
        tx,
        actorId,
        "source_version_created",
        inserted.id,
        input.changeReason,
      );
      return inserted;
    },
    { isolationLevel: "read committed" },
  );
  return row;
}

export async function decideSourceVersion(
  versionId: string,
  decision: SourceDecision,
  actorId: string,
) {
  await seedInitialNawawiSourceVersions();
  return db.transaction(
    async (tx) => {
      const [row] = await tx
        .select()
        .from(sourceVersionsTable)
        .where(eq(sourceVersionsTable.id, versionId))
        .for("update")
        .limit(1);
      if (!row) return { kind: "missing" as const };

      const requestedStatus = decision.decision;
      const isSameDecision =
        row.status === requestedStatus &&
        row.scientificStatus === decision.scientificStatus &&
        row.rightsStatus === decision.rightsStatus;
      if (isSameDecision) return { kind: "ok" as const, row, idempotent: true };

      if (row.status !== "pending_review" && requestedStatus !== "withdrawn") {
        return { kind: "conflict" as const };
      }
      if (
        row.status === "withdrawn" ||
        (row.status === "approved" && requestedStatus !== "withdrawn")
      ) {
        return { kind: "conflict" as const };
      }
      if (
        row.status === "approved" &&
        requestedStatus === "withdrawn" &&
        (decision.scientificStatus !== row.scientificStatus ||
          decision.rightsStatus !== row.rightsStatus)
      ) {
        return { kind: "conflict" as const };
      }

      const payload = payloadForVersion(row);
      const evidenceError = validateApprovalEvidence(
        payload,
        decision,
        row.createdBy,
        actorId,
      );
      if (evidenceError) return { kind: "invalid" as const, message: evidenceError };

      const now = new Date();
      const [updated] = await tx
        .update(sourceVersionsTable)
        .set({
          status: requestedStatus,
          scientificStatus: decision.scientificStatus,
          rightsStatus: decision.rightsStatus,
          scientificReviewerId:
            decision.scientificStatus !== row.scientificStatus
              ? actorId
              : row.scientificReviewerId,
          scientificReason:
            decision.scientificStatus !== row.scientificStatus
              ? decision.reason
              : row.scientificReason,
          scientificReviewedAt:
            decision.scientificStatus !== row.scientificStatus
              ? now
              : row.scientificReviewedAt,
          rightsReviewerId:
            decision.rightsStatus !== row.rightsStatus
              ? actorId
              : row.rightsReviewerId,
          rightsReason:
            decision.rightsStatus !== row.rightsStatus
              ? decision.reason
              : row.rightsReason,
          rightsReviewedAt:
            decision.rightsStatus !== row.rightsStatus
              ? now
              : row.rightsReviewedAt,
        })
        .where(
          and(
            eq(sourceVersionsTable.id, versionId),
            eq(sourceVersionsTable.status, row.status),
            eq(sourceVersionsTable.scientificStatus, row.scientificStatus),
            eq(sourceVersionsTable.rightsStatus, row.rightsStatus),
          ),
        )
        .returning();
      if (!updated) return { kind: "conflict" as const };
      await addReviewAudit(
        tx,
        actorId,
        `source_version_${requestedStatus}`,
        versionId,
        decision.reason,
      );
      return { kind: "ok" as const, row: updated, idempotent: false };
    },
    { isolationLevel: "serializable" },
  );
}