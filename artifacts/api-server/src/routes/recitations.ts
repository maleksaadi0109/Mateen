import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, or } from "drizzle-orm";
import {
  AnalyzeRecitationPracticeResponse,
  GetRecitationPracticeParams,
  GetRecitationPracticeResponse,
  ListRecitationPracticesResponse,
  RequestRecitationPracticeBody,
  RequestRecitationPracticeResponse,
} from "@workspace/api-zod";
import {
  db,
  practiceRecitationsTable,
  profilesTable,
} from "@workspace/db";
import { Router, type Response } from "express";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  authenticationRequired,
  mutationOriginProtection,
  rateLimit,
  requireProfile,
  type AuthedRequest,
} from "../lib/mateen-auth";
import {
  MAX_AUDIO_BYTES,
  MAX_PER_STUDENT_ACTIVE,
  RETENTION_MS,
  UPLOAD_URL_TTL_MS,
  canonicalizeContentType,
  getOwnedRecitation,
  getStorageFile,
  removeRemoteAudio,
  responseRecord,
} from "../lib/recitation-service";
import {
  cancelRecitationWorker,
  enqueueRecitationAnalysis,
  expireRecitationRecord,
  hasRecitationQueueCapacity,
} from "../lib/recitation-worker";

const router = Router();
const storage = new ObjectStorageService();

function hasExactRequestKeys(value: unknown): boolean {
  const keys = ["textId", "hadithNumber", "contentType", "sizeBytes", "consent"];
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}

router.post(
  "/mateen/recitations",
  mutationOriginProtection,
  rateLimit(5, 60 * 60_000),
  authenticationRequired,
  async (req: AuthedRequest, res: Response) => {
    const profile = await requireProfile(req, res, "student");
    if (!profile) return;
    const parsed = RequestRecitationPracticeBody.safeParse(req.body);
    if (!parsed.success || !hasExactRequestKeys(req.body)) {
      res.status(400).json({ error: "Invalid recitation practice request." });
      return;
    }
    const input = parsed.data;
    const contentType = canonicalizeContentType(input.contentType);
    if (input.textId !== "nawawi" || !contentType) {
      res.status(400).json({ error: "Only available Nawawi hadiths may be practiced." });
      return;
    }

    const id = randomUUID();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + RETENTION_MS);
    try {
      const outcome = await db.transaction(async (tx) => {
        const [lockedProfile] = await tx
          .select()
          .from(profilesTable)
          .where(eq(profilesTable.clerkId, req.mateenUserId!))
          .for("update");
        if (
          !lockedProfile ||
          !lockedProfile.onboarded ||
          lockedProfile.role !== "student"
        ) {
          return { kind: "forbidden" as const };
        }
        const active = await tx
          .select({ id: practiceRecitationsTable.id })
          .from(practiceRecitationsTable)
          .where(
            and(
              eq(practiceRecitationsTable.userId, req.mateenUserId!),
              or(
                and(
                  eq(practiceRecitationsTable.status, "uploading"),
                  gt(practiceRecitationsTable.uploadExpiresAt, new Date()),
                ),
                and(
                  eq(practiceRecitationsTable.status, "processing"),
                  gt(practiceRecitationsTable.expiresAt, new Date()),
                ),
              ),
            ),
          );
        if (active.length >= MAX_PER_STUDENT_ACTIVE) {
          return { kind: "limit" as const };
        }
        const uploadExpiresAt = new Date(Date.now() + UPLOAD_URL_TTL_MS);
        // Persist the provider-neutral object key, never the upload capability.
        // Local PUT URLs are transport endpoints, not resolvable object names.
        const storagePath = storage.createObjectEntityUploadPath();
        const uploadUrl = await storage.getObjectEntityUploadURLForPath(storagePath, uploadExpiresAt);
        await tx.insert(practiceRecitationsTable).values({
          id,
          userId: req.mateenUserId!,
          textId: "nawawi",
          hadithNumber: input.hadithNumber,
          expectedSizeBytes: input.sizeBytes,
          expectedContentType: contentType,
          storagePath,
          status: "uploading",
          createdAt,
          uploadExpiresAt,
          expiresAt,
        });
        return { kind: "created" as const, uploadUrl, uploadExpiresAt };
      });
      if (outcome.kind === "forbidden") {
        res.status(403).json({ error: "An onboarded student profile is required." });
        return;
      }
      if (outcome.kind === "limit") {
        res.status(429).json({ error: "You already have the maximum active practice uploads." });
        return;
      }
      const response = RequestRecitationPracticeResponse.parse({
        id,
        uploadUrl: outcome.uploadUrl,
        expiresAt: outcome.uploadExpiresAt,
        maxDurationSeconds: 60,
        retentionHours: 24,
      });
      res.status(201).json(response);
    } catch {
      res.status(503).json({ error: "Private audio upload is currently unavailable." });
    }
  },
);

router.get(
  "/mateen/recitations",
  authenticationRequired,
  async (req: AuthedRequest, res: Response) => {
    const profile = await requireProfile(req, res, "student");
    if (!profile) return;
    const rows = await db
      .select()
      .from(practiceRecitationsTable)
      .where(
        and(
          eq(practiceRecitationsTable.userId, req.mateenUserId!),
          gt(practiceRecitationsTable.expiresAt, new Date()),
          or(
            inArray(practiceRecitationsTable.status, ["processing", "completed", "error"]),
            gt(practiceRecitationsTable.uploadExpiresAt, new Date()),
          ),
        ),
      )
      .orderBy(desc(practiceRecitationsTable.createdAt))
      .limit(100);
    res.json(ListRecitationPracticesResponse.parse(rows.map(responseRecord)));
  },
);

router.get(
  "/mateen/recitations/:id",
  authenticationRequired,
  async (req: AuthedRequest, res: Response) => {
    const profile = await requireProfile(req, res, "student");
    if (!profile) return;
    const parsed = GetRecitationPracticeParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid practice identifier." });
      return;
    }
    const row = await getOwnedRecitation(parsed.data.id, req.mateenUserId!);
    if (!row) {
      res.status(404).json({ error: "Practice record not found." });
      return;
    }
    if (
      row.expiresAt.getTime() <= Date.now() ||
      (row.status === "uploading" && row.uploadExpiresAt.getTime() <= Date.now())
    ) {
      await expireRecitationRecord(row.id);
      const refreshed = await getOwnedRecitation(row.id, req.mateenUserId!);
      res.json(
        GetRecitationPracticeResponse.parse(
          responseRecord(
            refreshed ?? {
              ...row,
              status: "deleted",
              result: null,
              error: null,
            },
          ),
        ),
      );
      return;
    }
    res.json(GetRecitationPracticeResponse.parse(responseRecord(row)));
  },
);

router.post(
  "/mateen/recitations/:id/analyze",
  mutationOriginProtection,
  rateLimit(10, 60_000),
  authenticationRequired,
  async (req: AuthedRequest, res: Response) => {
    const profile = await requireProfile(req, res, "student");
    if (!profile) return;
    const parsed = GetRecitationPracticeParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid practice identifier." });
      return;
    }
    const row = await getOwnedRecitation(parsed.data.id, req.mateenUserId!);
    if (!row) {
      res.status(404).json({ error: "Practice record not found." });
      return;
    }
    if (
      row.expiresAt.getTime() <= Date.now() ||
      (row.status === "uploading" && row.uploadExpiresAt.getTime() <= Date.now())
    ) {
      await expireRecitationRecord(row.id);
      const refreshed = await getOwnedRecitation(row.id, req.mateenUserId!);
      res.json(
        AnalyzeRecitationPracticeResponse.parse(
          responseRecord(
            refreshed ?? {
              ...row,
              status: "deleted",
              result: null,
              error: null,
            },
          ),
        ),
      );
      return;
    }
    if (
      row.status === "completed" ||
      row.status === "processing" ||
      row.status === "error" ||
      row.status === "deleted"
    ) {
      res.json(AnalyzeRecitationPracticeResponse.parse(responseRecord(row)));
      return;
    }
    if (row.uploadExpiresAt.getTime() <= Date.now()) {
      res.status(409).json({ error: "This upload has expired." });
      return;
    }
    if (!row.storagePath) {
      res.status(409).json({ error: "The private upload is unavailable." });
      return;
    }

    let metadata;
    try {
      const file = await getStorageFile(row.storagePath);
      [metadata] = await file.getMetadata();
    } catch {
      res.status(409).json({ error: "The private audio upload has not completed." });
      return;
    }
    const actualSize = Number(metadata.size);
    const actualType =
      typeof metadata.contentType === "string"
        ? canonicalizeContentType(metadata.contentType)
        : null;
    if (
      !Number.isSafeInteger(actualSize) ||
      actualSize !== row.expectedSizeBytes ||
      actualSize > MAX_AUDIO_BYTES ||
      actualType !== row.expectedContentType
    ) {
      res.status(409).json({ error: "Uploaded audio size or media type did not match." });
      return;
    }
    if (!hasRecitationQueueCapacity()) {
      res.status(429).json({ error: "Local analysis is busy; retry shortly." });
      return;
    }
    const [updated] = await db
      .update(practiceRecitationsTable)
      .set({ status: "processing", error: null, result: null })
      .where(
        and(
          eq(practiceRecitationsTable.id, row.id),
          eq(practiceRecitationsTable.userId, req.mateenUserId!),
          eq(practiceRecitationsTable.status, "uploading"),
          gt(practiceRecitationsTable.uploadExpiresAt, new Date()),
        ),
      )
      .returning();
    if (!updated) {
      const fresh = await getOwnedRecitation(row.id, req.mateenUserId!);
      if (!fresh) {
        res.status(404).json({ error: "Practice record not found." });
        return;
      }
      res.json(AnalyzeRecitationPracticeResponse.parse(responseRecord(fresh)));
      return;
    }
    if (!enqueueRecitationAnalysis(row.id)) {
      await db
        .update(practiceRecitationsTable)
        .set({ status: "uploading" })
        .where(
          and(
            eq(practiceRecitationsTable.id, row.id),
            eq(practiceRecitationsTable.status, "processing"),
          ),
        );
      res.status(429).json({ error: "Local analysis is busy; retry shortly." });
      return;
    }
    res.json(AnalyzeRecitationPracticeResponse.parse(responseRecord(updated)));
  },
);

router.delete(
  "/mateen/recitations/:id",
  mutationOriginProtection,
  rateLimit(10, 60_000),
  authenticationRequired,
  async (req: AuthedRequest, res: Response) => {
    const profile = await requireProfile(req, res, "student");
    if (!profile) return;
    const parsed = GetRecitationPracticeParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid practice identifier." });
      return;
    }
    const row = await getOwnedRecitation(parsed.data.id, req.mateenUserId!);
    if (!row) {
      res.status(404).json({ error: "Practice record not found." });
      return;
    }
    await db
      .update(practiceRecitationsTable)
      .set({ status: "deleted", result: null, error: null })
      .where(
        and(
          eq(practiceRecitationsTable.id, row.id),
          eq(practiceRecitationsTable.userId, req.mateenUserId!),
        ),
      );
    cancelRecitationWorker(row.id);
    try {
      await removeRemoteAudio(row.storagePath);
      await db
        .update(practiceRecitationsTable)
        .set({ audioDeleted: true })
        .where(eq(practiceRecitationsTable.id, row.id));
    } catch {
      res.status(503).json({ error: "Practice was canceled; private audio cleanup will retry." });
      return;
    }
    res.status(204).end();
  },
);

export default router;