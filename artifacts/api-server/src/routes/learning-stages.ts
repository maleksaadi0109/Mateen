import { randomUUID } from "node:crypto";
import { Router } from "express";
import { and, eq, lt, or } from "drizzle-orm";
import { db, learningStagesTable, stageAttemptsTable, profilesTable } from "@workspace/db";
import {
  GetLearningMapParams, GetLearningMapResponse, StartStageAttemptParams, StartStageAttemptBody,
  FinishStageAttemptParams, FinishStageAttemptResponse, type StageOutcome,
  GetTuhfaTextResponse,
} from "@workspace/api-zod";
import { authenticationRequired, mutationOriginProtection, rateLimit, requireProfile, type AuthedRequest } from "../lib/mateen-auth";
import { learningRecord, learningRecords, scoreStage, STAGE_THRESHOLD } from "../lib/learning-stage-policy";
import { getNawawiStudyRecords } from "../lib/source-review";
import { tuhfaText, tuhfaChapterStages } from "../data/tuhfa";

const router = Router();
const base = "/mateen/learning";
const startInput = StartStageAttemptBody.strict();
const ownStages = (userId: string, textId: string) => and(eq(learningStagesTable.userId, userId), eq(learningStagesTable.textId, textId));
// Separate chapter milestones from historical verse milestones. Identical
// numbers do not mean identical texts; never reinterpret a verse pass as a chapter.
const progressId = (textId: string) => textId === "tuhfa" ? "tuhfa-chapters" : textId;
const isPoem = (textId: string) => textId === "tuhfa" || textId === "tuhfa-chapters";
export const recordsFor = (textId: string) => isPoem(textId) ? tuhfaChapterStages.map(learningRecord) : learningRecords;
const progressWhere = (userId: string, textId: string) => textId === "tuhfa"
  ? and(eq(learningStagesTable.userId, userId), or(eq(learningStagesTable.textId, "tuhfa"), eq(learningStagesTable.textId, "tuhfa-chapters")))
  : ownStages(userId, textId);
export function effectiveProgress(rows: (typeof learningStagesTable.$inferSelect)[], textId: string) {
  if (textId !== "tuhfa") return rows;
  return tuhfaText.chapters.map(c => {
    const current = rows.find(r => r.textId === "tuhfa-chapters" && r.stageNumber === c.number);
    const legacy = c.verses.map(v => rows.find(r => r.textId === "tuhfa" && r.stageNumber === v.number));
    // Preserve fully completed chapters, but partial verse progress is never
    // enough to open the next chapter. Retain all historical rows untouched.
    const legacyComplete = legacy.every(r => r?.passedAt);
    return {
      stageNumber: c.number,
      bestPercent: Math.max(current?.bestPercent ?? 0, legacyComplete ? Math.min(...legacy.map(r => r!.bestPercent)) : 0),
      passedAt: current?.passedAt ?? (legacyComplete ? legacy[0]!.passedAt : null),
    };
  });
}
const sourceFor = async (textId: string, number: number) => {
  if (isPoem(textId)) return tuhfaChapterStages.find(c => c.number === number);
  if (textId === "nawawi") return (await getNawawiStudyRecords()).hadiths.find(h => h.number === number);
  return undefined;
};

router.get("/mateen/tuhfa", authenticationRequired, async (req: AuthedRequest, res) => {
  if (!await requireProfile(req, res, "student")) return;
  res.json(GetTuhfaTextResponse.parse(tuhfaText));
});

router.get(`${base}/:textId`, authenticationRequired, async (req: AuthedRequest, res) => {
  if (!await requireProfile(req, res, "student")) return;
  const params = GetLearningMapParams.safeParse(req.params);
  if (!params.success) { res.status(404).json({ error: "Track not available" }); return; }
  const { textId } = params.data;
  const records = recordsFor(textId);
  const saved = effectiveProgress(await db.select().from(learningStagesTable).where(progressWhere(req.mateenUserId!, textId)), textId);
  const passed = new Set(saved.filter(r => r.passedAt).map(r => r.stageNumber));
  // Only the next contiguous unpassed stage can be started. Existing study
  // completion / bookmarks are deliberately not treated as passed exams.
  const current = records.find(h => !passed.has(h.number))?.number;
  res.set("Cache-Control", "no-store").json(GetLearningMapResponse.parse({
    textId, threshold: STAGE_THRESHOLD,
    stages: records.map(h => ({
      number: h.number, title: h.title,
      status: passed.has(h.number) ? "passed" : h.number === current ? "current" : "locked",
      bestPercent: saved.find(s => s.stageNumber === h.number)?.bestPercent ?? null,
    })),
  }));
});

router.post(`${base}/:textId/stages/:stageNumber/attempts`, authenticationRequired, mutationOriginProtection,
  rateLimit(90, 60 * 60_000), async (req: AuthedRequest, res) => {
    if (!await requireProfile(req, res, "student")) return;
    const params = StartStageAttemptParams.safeParse(req.params);
    const body = startInput.safeParse(req.body);
    if (!params.success || !body.success || body.data.consent !== true) { res.status(400).json({ error: "Invalid stage request or missing consent" }); return; }
    const userId = req.mateenUserId!;
    const { textId } = params.data;
    const records = recordsFor(textId);
    const source = await sourceFor(textId, params.data.stageNumber);
    if (!source) { res.status(409).json({ error: "Stage text currently unavailable" }); return; }
    const stage = learningRecord(source);
    const outcome = await db.transaction(async tx => {
      await tx.select().from(profilesTable).where(eq(profilesTable.clerkId, userId)).for("update");
      await tx.delete(stageAttemptsTable).where(and(eq(stageAttemptsTable.userId, userId), lt(stageAttemptsTable.expiresAt, new Date())));
      const [previous] = await tx.select().from(stageAttemptsTable)
        .where(and(eq(stageAttemptsTable.userId, userId), eq(stageAttemptsTable.requestId, body.data.requestId)));
       if (previous) return previous.stageNumber === stage.number && previous.textId === progressId(textId) ? { attempt: previous } : { conflict: true };
       const saved = effectiveProgress(await tx.select().from(learningStagesTable).where(progressWhere(userId, textId)), textId);
      const passed = new Set(saved.filter(r => r.passedAt).map(r => r.stageNumber));
      if (records.some(h => h.number < stage.number && !passed.has(h.number))) return { locked: true };
      const [attempt] = await tx.insert(stageAttemptsTable).values({
         id: randomUUID(), userId, textId: progressId(textId), requestId: body.data.requestId, stageNumber: stage.number, sourceHash: stage.hash,
        expiresAt: new Date(Date.now() + 60 * 60_000),
      }).returning();
      return { attempt };
    });
    if (!outcome.attempt) { res.status(outcome.locked ? 403 : 409).json({ error: outcome.locked ? "Previous stage must be passed first" : "Request already used for a different stage" }); return; }
    res.status(201).json({ id: outcome.attempt.id, stageNumber: stage.number, expiresAt: outcome.attempt.expiresAt.toISOString(), sourceHash: outcome.attempt.sourceHash });
  });

router.post(`${base}/attempts/:attemptId/finish`, authenticationRequired, mutationOriginProtection,
  rateLimit(150, 60 * 60_000), async (req: AuthedRequest, res) => {
    if (!await requireProfile(req, res, "student")) return;
    const params = FinishStageAttemptParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Invalid attempt" }); return; }
    const userId = req.mateenUserId!;
    const outcome = await db.transaction(async tx => {
      // Same lock order as start, so simultaneous sessions cannot downgrade passes.
      await tx.select().from(profilesTable).where(eq(profilesTable.clerkId, userId)).for("update");
      const [attempt] = await tx.select().from(stageAttemptsTable)
        .where(and(eq(stageAttemptsTable.id, params.data.attemptId), eq(stageAttemptsTable.userId, userId))).for("update");
      if (!attempt) return { status: 404, error: "Attempt not found" };
       if (attempt.textId === "tuhfa") return { status: 409, error: "Verse training was replaced by chapter training; start a new attempt" };
      if (attempt.result) return { result: FinishStageAttemptResponse.parse(attempt.result) };
      const source = await sourceFor(attempt.textId, attempt.stageNumber);
      if (!source) return { status: 409, error: "Stage text currently unavailable" };
      const stage = learningRecord(source);
      if (attempt.expiresAt.getTime() <= Date.now() || stage.hash !== attempt.sourceHash) {
        return { status: 409, error: "Attempt expired or text changed; start again" };
      }
      const scored = scoreStage(stage.words, req.body);
      if (!scored) return { status: 400, error: "Invalid or inconsistent recognition positions" };
      const result: StageOutcome = {
        ...scored, stageNumber: stage.number,
        nextStage: scored.passed && stage.number < recordsFor(attempt.textId).length ? stage.number + 1 : null,
      };
      const stageWhere = and(ownStages(userId, attempt.textId), eq(learningStagesTable.stageNumber, stage.number));
      const [old] = await tx.select().from(learningStagesTable).where(stageWhere);
      await tx.insert(learningStagesTable).values({
        userId, textId: attempt.textId, stageNumber: stage.number,
        bestPercent: Math.max(old?.bestPercent ?? 0, result.percent),
        passedAt: old?.passedAt ?? (result.passed ? new Date() : null),
      }).onConflictDoUpdate({
        target: [learningStagesTable.userId, learningStagesTable.textId, learningStagesTable.stageNumber],
        set: { bestPercent: Math.max(old?.bestPercent ?? 0, result.percent), passedAt: old?.passedAt ?? (result.passed ? new Date() : null) },
      });
      await tx.update(stageAttemptsTable).set({ result }).where(eq(stageAttemptsTable.id, attempt.id));
      return { result };
    });
    if (!outcome.result) { res.status(outcome.status ?? 400).json({ error: outcome.error }); return; }
    res.json(FinishStageAttemptResponse.parse(outcome.result));
  });
export default router;