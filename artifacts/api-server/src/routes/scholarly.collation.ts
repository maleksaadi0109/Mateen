import { GetScholarlyCollationResponse, GetScholarlyGeometryHistoryParams, GetScholarlyGeometryHistoryResponse, RecordScholarlyGeometryResponse } from "@workspace/api-zod";
import { db, scholarlyAuditTable, scholarlyPassagesTable, scholarlySourcesTable } from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Router } from "express";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { digest, findCollationPassage, isCollationSource } from "../lib/scholarly-collation";
import { currentGeometry, excerptFingerprint, geometryHistory, geometryInput, geometryStates } from "../lib/scholarly-geometry";
import { authenticationRequired, rateLimit, requireAdmin, sameOrigin, type AuthedRequest } from "./scholarly.shared";

const router = Router();
const base = "/mateen/admin/scholarly/sources/:sourceId/collation";
const params = z.object({ sourceId: z.string().uuid(), passageId: z.string().uuid().optional() });
router.use(base, (_req, res, next) => {
  res.set({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" });
  next();
});

// Build copies only allowlisted images beside the server bundle. Nothing is static/public.
async function imageBytes(file: string, hash: string) {
  if (!/^pdf-00[567]\.png$/.test(file)) throw new Error("Unknown evidence");
  const directory = import.meta.url.endsWith("/index.mjs")
    ? new URL("./collation-evidence/", import.meta.url)
    : new URL("../../../../deliverables/aljam3-commentary/evidence/", import.meta.url);
  const bytes = await readFile(fileURLToPath(new URL(file, directory)));
  if (digest(bytes) !== hash) throw new Error("Changed evidence image");
  return bytes;
}

for (const image of [false, true]) {
  router.get(image ? `${base}/:passageId/image` : base,
    authenticationRequired, rateLimit(60, 60_000),
    async (req: AuthedRequest, res): Promise<void> => {
      res.set({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" });
      if (!await requireAdmin(req, res)) return;
      const parsed = params.safeParse(req.params);
      if (!parsed.success) { res.status(400).json({ error: "Invalid evidence identifier" }); return; }
      const [source] = await db.select().from(scholarlySourcesTable)
        .where(eq(scholarlySourcesTable.id, parsed.data.sourceId)).limit(1);
      if (!source) { res.status(404).json({ error: "Source not found" }); return; }
      if (!isCollationSource(source)) {
        if (image) res.status(404).json({ error: "No matching evidence" });
        else res.json([]);
        return;
      }
      const rows = await db.select().from(scholarlyPassagesTable).where(and(
        eq(scholarlyPassagesTable.sourceId, source.id),
        image ? eq(scholarlyPassagesTable.id, parsed.data.passageId!) : undefined,
      )).limit(1001);
      try {
        if (rows.length > 1000) throw new Error("Inspection limit exceeded");
        const records = image || !rows.length ? [] : await db.select({
          id: scholarlyAuditTable.id, targetId: scholarlyAuditTable.targetId, details: scholarlyAuditTable.details,
        }).from(scholarlyAuditTable).where(and(
          eq(scholarlyAuditTable.action, "collation_geometry_recorded"),
          eq(scholarlyAuditTable.targetType, "collation_passage"),
          inArray(scholarlyAuditTable.targetId, rows.map(row => row.id)),
        )).orderBy(desc(scholarlyAuditTable.createdAt), desc(scholarlyAuditTable.id));
        const result = [];
        let bytes: Buffer | null = null;
        const checked = new Set<string>();
        for (const row of rows) {
          const match = findCollationPassage(row.text, row.sourceUrl, row.viewerPage);
          if (!match) continue;
          const { imageFile, ...comparison } = match;
          if (imageFile && comparison.imageSha256 && !checked.has(imageFile)) {
            bytes = await imageBytes(imageFile, comparison.imageSha256);
            checked.add(imageFile);
          }
          result.push({ passageId: row.id, ...comparison,
            originalTextSha256: digest(comparison.originalText),
            geometry: currentGeometry(match, records.filter(record => record.targetId === row.id)),
            geometryStates: geometryStates(match, records.filter(record => record.targetId === row.id)) });
        }
        // Recheck designation/assurance after reading the private evidence.
        if (!await requireAdmin(req, res)) return;
        if (image) {
          if (!bytes) { res.status(404).json({ error: "No matched page image" }); return; }
          res.type("png").send(bytes);
        } else res.json(GetScholarlyCollationResponse.parse(result));
      } catch {
        res.status(503).json({ error: "دليل المقابلة غير متاح أو تغيرت بصمته؛ لا يجوز تعميم حكم المقابلة أو استخدام تصحيح غير مطابق." });
      }
    });
}
router.get(`${base}/:passageId/geometry/history/:excerptId`, authenticationRequired, rateLimit(60, 60_000),
  async (req: AuthedRequest, res): Promise<void> => {
    if (!await requireAdmin(req, res)) return;
    const ids = GetScholarlyGeometryHistoryParams.safeParse(req.params);
    if (!ids.success) {
      res.status(400).json({ error: "Invalid evidence identifier" }); return;
    }
    const [source] = await db.select().from(scholarlySourcesTable)
      .where(eq(scholarlySourcesTable.id, ids.data.sourceId)).limit(1);
    const [passage] = await db.select().from(scholarlyPassagesTable).where(and(
      eq(scholarlyPassagesTable.sourceId, ids.data.sourceId),
      eq(scholarlyPassagesTable.id, ids.data.passageId),
    )).limit(1);
    if (!source || !passage || !isCollationSource(source)) {
      res.status(404).json({ error: "No matched evidence" }); return;
    }
    try {
      const match = findCollationPassage(passage.text, passage.sourceUrl, passage.viewerPage);
      if (!match?.excerpts.some(x => x.id === ids.data.excerptId)) {
        res.status(404).json({ error: "No matched excerpt" }); return;
      }
      const records = await db.select().from(scholarlyAuditTable).where(and(
        eq(scholarlyAuditTable.action, "collation_geometry_recorded"),
        eq(scholarlyAuditTable.targetType, "collation_passage"),
        eq(scholarlyAuditTable.targetId, passage.id),
      )).orderBy(desc(scholarlyAuditTable.createdAt), desc(scholarlyAuditTable.id));
      if (!await requireAdmin(req, res)) return;
      res.json(GetScholarlyGeometryHistoryResponse.parse(geometryHistory(match, ids.data.excerptId, records)));
    } catch {
      res.status(503).json({ error: "تعذر تحميل سجل الحدود؛ لا يجوز اعتباره توثيقًا نافذًا." });
    }
  });
router.post(`${base}/:passageId/geometry`, authenticationRequired, sameOrigin, rateLimit(30, 60_000),
  async (req: AuthedRequest, res): Promise<void> => {
    res.set({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" });
    if (!await requireAdmin(req, res)) return;
    const ids = params.safeParse(req.params);
    const input = geometryInput.safeParse(req.body);
    if (!ids.success || !ids.data.passageId || !input.success) {
      res.status(400).json({ error: "حدود غير صالحة أو تأكيد المراجعة البصرية مفقود." }); return;
    }
    const [source] = await db.select().from(scholarlySourcesTable)
      .where(eq(scholarlySourcesTable.id, ids.data.sourceId)).limit(1);
    const [passage] = await db.select().from(scholarlyPassagesTable).where(and(
      eq(scholarlyPassagesTable.sourceId, ids.data.sourceId),
      eq(scholarlyPassagesTable.id, ids.data.passageId),
    )).limit(1);
    if (!source || !passage || !isCollationSource(source)) {
      res.status(404).json({ error: "No matched evidence" }); return;
    }
    try {
      const match = findCollationPassage(passage.text, passage.sourceUrl, passage.viewerPage);
      const excerpt = match?.excerpts.find(x => x.id === input.data.excerptId);
      if (!match?.imageFile || !match.imageSha256 || !excerpt) {
        res.status(404).json({ error: "No matched excerpt image" }); return;
      }
      if (input.data.imageSha256 !== match.imageSha256 ||
          input.data.originalTextSha256 !== digest(match.originalText)) {
        res.status(409).json({ code: "evidence_changed", error: "تغير دليل المقتطف؛ أعد تحميله قبل التوثيق." }); return;
      }
      await imageBytes(match.imageFile, match.imageSha256);
      if (!await requireAdmin(req, res)) return;
      const outcome = await db.transaction(async tx => {
        // Serialize compare-and-append, including the first save and revocations.
        // A passage row lock also avoids races with passage removal.
        const [locked] = await tx.select().from(scholarlyPassagesTable)
          .where(eq(scholarlyPassagesTable.id, passage.id)).for("update");
        if (!locked) throw new Error("Passage removed");
        if (locked.text !== passage.text || locked.sourceUrl !== passage.sourceUrl ||
            locked.viewerPage !== passage.viewerPage) return { evidenceChanged: true };
        const latest = await tx.select({ id: scholarlyAuditTable.id, details: scholarlyAuditTable.details,
          createdAt: scholarlyAuditTable.createdAt })
          .from(scholarlyAuditTable).where(and(
            eq(scholarlyAuditTable.action, "collation_geometry_recorded"),
            eq(scholarlyAuditTable.targetType, "collation_passage"),
            eq(scholarlyAuditTable.targetId, passage.id),
          )).orderBy(desc(scholarlyAuditTable.createdAt), desc(scholarlyAuditTable.id));
        const state = geometryStates(match, latest).find(s => s.excerptId === excerpt.id)!;
        if (state.revision !== input.data.expectedRevision) return { conflict: state };
        const { manuallyVerified: _confirmation, expectedRevision: _revision, ...data } = input.data;
        const record = { ...data, method: "manual_visual" as const,
          recordedAt: new Date().toISOString(), excerptSha256: excerptFingerprint(excerpt) };
        // Append-only evidence; no passage/source status, rights or index changes.
        await tx.insert(scholarlyAuditTable).values({
          actorId: req.scholarlyUserId!, action: "collation_geometry_recorded",
          targetType: "collation_passage", targetId: passage.id,
          reason: record.note, details: record,
          // now() is transaction-start time, which can precede the lock holder.
          // Keep append ordering strictly increasing even within one millisecond.
          createdAt: new Date(Math.max(Date.now(), (latest[0]?.createdAt.getTime() ?? 0) + 1)),
        });
        return { record };
      });
      if (outcome.evidenceChanged) {
        res.status(409).json({ code: "evidence_changed", error: "تغير دليل المقتطف؛ أعد تحميله قبل التوثيق." });
        return;
      }
      if (outcome.conflict) {
        res.status(409).json({ code: "geometry_conflict",
          error: "عدّل مراجع آخر حدود هذا المقتطف أو سحبها. راجع التوثيق الأحدث قبل إعادة الحفظ.",
          state: outcome.conflict });
        return;
      }
      res.json(RecordScholarlyGeometryResponse.parse(outcome.record));
    } catch {
      res.status(503).json({ error: "تعذر توثيق الحدود؛ الدليل غير متاح أو تغيرت بصمته." });
    }
  });
export default router;
