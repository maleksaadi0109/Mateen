import { getAuth } from "@clerk/express";
import {
  GetSourceReviewsResponse,
  CreateSourceVersionResponse,
  DecideSourceVersionParams,
  DecideSourceVersionResponse,
} from "@workspace/api-zod";
import {
  db,
  reviewAuditTable,
  sourceVersionsTable,
} from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { Router, type Request } from "express";
import {
  createSourceVersion,
  decideSourceVersion,
  seedInitialNawawiSourceVersions,
  sourceDecisionSchema,
  sourceVersionInputSchema,
  toSourceVersionRecord,
} from "../lib/source-review";
import {
  mutationProtection,
  requireReviewPermission,
} from "../middlewares/review-security";

const router = Router();
const contentReviewer = requireReviewPermission("content");

router.get(
  "/mateen/admin/sources",
  contentReviewer,
  async (_req, res) => {
    await seedInitialNawawiSourceVersions();
    const rows = await db
      .select()
      .from(sourceVersionsTable)
      .orderBy(asc(sourceVersionsTable.hadithNumber), asc(sourceVersionsTable.version));
    const ids = rows.map((row) => row.id);
    const audit = ids.length
      ? await db
          .select()
          .from(reviewAuditTable)
          .where(
            and(
              eq(reviewAuditTable.scope, "content"),
              inArray(reviewAuditTable.targetId, ids),
            ),
          )
          .orderBy(asc(reviewAuditTable.createdAt))
      : [];
    const historyByTarget = new Map<string, typeof audit>();
    for (const item of audit) {
      const history = historyByTarget.get(item.targetId) ?? [];
      history.push(item);
      historyByTarget.set(item.targetId, history);
    }
    res.json(
      GetSourceReviewsResponse.parse(
        rows.map((row) =>
          toSourceVersionRecord(
            row,
            historyByTarget.get(row.id) ?? [],
          ),
        ),
      ),
    );
  },
);

router.post(
  "/mateen/admin/sources",
  mutationProtection,
  contentReviewer,
  async (req: Request, res) => {
    const parsed = sourceVersionInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid source version payload",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
      return;
    }
    const userId = getAuth(req).userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication is required" });
      return;
    }
    const row = await createSourceVersion(parsed.data, userId);
    res.status(201).json(
      CreateSourceVersionResponse.parse(
        toSourceVersionRecord(row),
      ),
    );
  },
);

router.post(
  "/mateen/admin/sources/:versionId/decision",
  mutationProtection,
  contentReviewer,
  async (req: Request, res) => {
    const params = DecideSourceVersionParams.safeParse({
      versionId: req.params.versionId,
    });
    if (!params.success || params.data.versionId.length === 0) {
      res.status(400).json({ error: "Invalid source version identifier" });
      return;
    }
    const parsed = sourceDecisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid source decision payload",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
      return;
    }
    const userId = getAuth(req).userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication is required" });
      return;
    }
    const result = await decideSourceVersion(
      params.data.versionId,
      parsed.data,
      userId,
    );
    if (result.kind === "missing") {
      res.status(404).json({ error: "Source version not found" });
      return;
    }
    if (result.kind === "conflict") {
      res.status(409).json({
        error: "Source version already has a conflicting final decision",
      });
      return;
    }
    if (result.kind === "invalid") {
      res.status(422).json({ error: result.message });
      return;
    }
    const history = await db
      .select()
      .from(reviewAuditTable)
      .where(
        and(
          eq(reviewAuditTable.scope, "content"),
          eq(reviewAuditTable.targetId, result.row.id),
        ),
      )
      .orderBy(asc(reviewAuditTable.createdAt));
    res.json(
      DecideSourceVersionResponse.parse(
        toSourceVersionRecord(result.row, history),
      ),
    );
  },
);

export default router;
