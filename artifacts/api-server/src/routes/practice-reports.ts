import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Router, json } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, practiceReportsTable, profilesTable, type PracticeReportRecord } from "@workspace/db";
import {
  GetPracticeReportParams, DeletePracticeReportParams, GetPracticeReportWordsParams,
  GetPracticeReportResponse, ListPracticeReportsQueryParams, ListPracticeReportsResponse,
  SavePracticeReportResponse, GetPracticeReportWordsResponse,
  type PracticeReportInput,
} from "@workspace/api-zod";
import { authenticationRequired, mutationOriginProtection, rateLimit, requireProfile, type AuthedRequest } from "../lib/mateen-auth";
import { practiceReportInput } from "../lib/practice-report-policy";

const router = Router();
const path = "/mateen/practice-reports";
const summary = (r: PracticeReportRecord) => GetPracticeReportResponse.parse({
  ...(r.summary as object), id: r.id, attemptId: r.attemptId, createdAt: r.createdAt,
});
const owned = (id: string, userId: string) => and(eq(practiceReportsTable.id, id), eq(practiceReportsTable.userId, userId));

// Authenticate before parsing the larger, tightly bounded word-detail payload.
router.post(path, authenticationRequired, mutationOriginProtection, rateLimit(30, 60 * 60_000),
  json({ limit: "3mb" }), async (req: AuthedRequest, res): Promise<void> => {
    if (!await requireProfile(req, res, "student")) return;
    const parsed = practiceReportInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid practice report; no report was saved." }); return; }
    const { attemptId, issues, consent: _consent, ...input } = parsed.data;
    const result = await db.transaction(async tx => {
      // Serializes concurrent inserts and enforces a finite account quota.
      await tx.select().from(profilesTable).where(eq(profilesTable.clerkId, req.mateenUserId!)).for("update");
      const previous = await tx.select().from(practiceReportsTable).where(and(
        eq(practiceReportsTable.userId, req.mateenUserId!), eq(practiceReportsTable.attemptId, attemptId))).limit(1);
      if (previous[0]) return isDeepStrictEqual(previous[0].summary, { ...input, issueCount: issues.length }) &&
        isDeepStrictEqual(previous[0].issues, issues) ? previous[0] : "conflict";
      const reports = await tx.select({ id: practiceReportsTable.id }).from(practiceReportsTable)
        .where(eq(practiceReportsTable.userId, req.mateenUserId!)).limit(500);
      if (reports.length >= 500) return null;
      const [record] = await tx.insert(practiceReportsTable).values({
        id: randomUUID(), userId: req.mateenUserId!, attemptId,
        summary: { ...input, issueCount: issues.length }, issues,
      }).returning();
      return record;
    });
    if (!result) { res.status(409).json({ error: "Report limit reached; delete an old report first." }); return; }
    if (result === "conflict") { res.status(409).json({ error: "This attempt is already saved. Start a new attempt to save a different report." }); return; }
    res.status(201).json(SavePracticeReportResponse.parse(summary(result)));
  });

router.get(path, authenticationRequired, async (req: AuthedRequest, res): Promise<void> => {
  if (!await requireProfile(req, res, "student")) return;
  const query = ListPracticeReportsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid pagination" }); return; }
  const records = await db.select({
    id: practiceReportsTable.id, attemptId: practiceReportsTable.attemptId,
    createdAt: practiceReportsTable.createdAt, summary: practiceReportsTable.summary,
  }).from(practiceReportsTable).where(eq(practiceReportsTable.userId, req.mateenUserId!))
    .orderBy(desc(practiceReportsTable.createdAt), desc(practiceReportsTable.id)).offset(query.data.offset).limit(21);
  res.set("Cache-Control", "no-store").json(ListPracticeReportsResponse.parse({
    reports: records.slice(0, 20).map(r => summary({ ...r, userId: req.mateenUserId!, issues: [] })),
    hasMore: records.length > 20,
  }));
});

router.get(`${path}/:id`, authenticationRequired, async (req: AuthedRequest, res): Promise<void> => {
  if (!await requireProfile(req, res, "student")) return;
  const params = GetPracticeReportParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid report id" }); return; }
  const [record] = await db.select().from(practiceReportsTable).where(owned(params.data.id, req.mateenUserId!));
  if (!record) { res.status(404).json({ error: "Report not found" }); return; }
  res.set("Cache-Control", "no-store").json(summary(record));
});

router.get(`${path}/:id/words/:hadithId/:offset`, authenticationRequired, async (req: AuthedRequest, res): Promise<void> => {
  if (!await requireProfile(req, res, "student")) return;
  const params = GetPracticeReportWordsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid word pagination" }); return; }
  const [record] = await db.select().from(practiceReportsTable).where(owned(params.data.id, req.mateenUserId!));
  if (!record) { res.status(404).json({ error: "Report not found" }); return; }
  const hadith = summary(record).analyses.find(a => a.id === params.data.hadithId);
  if (!hadith) { res.status(404).json({ error: "Hadith not found" }); return; }
  const issues = (record.issues as PracticeReportInput["issues"]).filter(i => i.index >= hadith.start && i.index < hadith.end);
  res.set("Cache-Control", "no-store").json(GetPracticeReportWordsResponse.parse({
    issues: issues.slice(params.data.offset, params.data.offset + 50), total: issues.length,
    hasMore: params.data.offset + 50 < issues.length,
  }));
});

router.delete(`${path}/:id`, authenticationRequired, mutationOriginProtection, async (req: AuthedRequest, res): Promise<void> => {
  if (!await requireProfile(req, res, "student")) return;
  const params = DeletePracticeReportParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid report id" }); return; }
  const records = await db.delete(practiceReportsTable).where(owned(params.data.id, req.mateenUserId!)).returning({ id: practiceReportsTable.id });
  if (!records.length) { res.status(404).json({ error: "Report not found" }); return; }
  res.sendStatus(204);
});
// Saved snapshots are immutable. No update action can rewrite practice evidence.
router.all(`${path}/:id`, authenticationRequired, (_req, res) => {
  res.set("Allow", "GET, DELETE").status(405).json({ error: "Saved practice reports cannot be updated" });
});
export default router;