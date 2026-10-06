import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Router, json } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, profilesTable, wordPracticesTable, type WordPracticeRecord } from "@workspace/db";
import { GetWordPracticeResponse, type WordPracticeReference, type WordPracticeAttempt } from "@workspace/api-zod";
import { z } from "zod/v4";
import { authenticationRequired, mutationOriginProtection, rateLimit, requireProfile, type AuthedRequest } from "../lib/mateen-auth";
import { getNawawiStudyRecords } from "../lib/source-review";
import { practiceReference, practiceInput, practiceAttemptInput, validAttempt, practiceWordCount, isPracticeWord } from "../lib/word-practice-policy";

const router = Router(), path = "/mateen/word-practice";
type Selection = { reference: WordPracticeReference; start: number; end: number; targets: number[]; initialAttempts: WordPracticeAttempt[] };
const owned = (id: string, user: string) => and(eq(wordPracticesTable.id, id), eq(wordPracticesTable.userId, user));
async function references() { return (await getNawawiStudyRecords()).hadiths.map(practiceReference); }
function output(r: WordPracticeRecord, refs: WordPracticeReference[]) {
  const s = r.selection as Selection;
  const current = refs.find(x => x.hadithId === s.reference.hadithId);
  // Keep inaccessible exercises deletable without exposing withdrawn source words.
  if (!current) return GetWordPracticeResponse.parse({ id: r.id, createdAt: r.createdAt, start: s.start, end: s.end,
    targets: s.targets, reference: { ...s.reference, words: [] }, attempts: r.attempts, stale: true });
  const stale = current.fingerprint !== s.reference.fingerprint || current.tokenizerVersion !== s.reference.tokenizerVersion;
  return GetWordPracticeResponse.parse({ id: r.id, createdAt: r.createdAt, start: s.start, end: s.end, targets: s.targets,
    reference: stale ? current : s.reference, attempts: r.attempts, stale });
}
router.use(path, authenticationRequired, async (req: AuthedRequest, res, next) => {
  res.set("Cache-Control", "no-store");
  if (await requireProfile(req, res, "student")) next();
});
router.get(`${path}/reference/:hadithId`, async (req, res) => {
  const parsed = z.coerce.number().int().min(1).max(42).safeParse(req.params.hadithId);
  if (!parsed.success) { res.status(400).json({ error: "Invalid passage" }); return; }
  const ref = (await references()).find(x => x.hadithId === parsed.data);
  if (!ref) { res.status(404).json({ error: "Text unavailable" }); return; }
  res.json(ref);
});
router.get(path, async (req: AuthedRequest, res) => {
  const refs = await references();
  const records = await db.select().from(wordPracticesTable).where(eq(wordPracticesTable.userId, req.mateenUserId!))
    .orderBy(desc(wordPracticesTable.createdAt), desc(wordPracticesTable.id)).limit(100);
  res.json(records.flatMap(r => { const value = output(r, refs); return value ? [value] : []; }));
});
router.post(path, mutationOriginProtection, rateLimit(60, 3600_000), json({ limit: "32kb" }), async (req: AuthedRequest, res) => {
  const parsed = practiceInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid selection" }); return; }
  const v = parsed.data, refs = await references(), ref = refs.find(x => x.hadithId === v.hadithId);
  if (!ref || ref.fingerprint !== v.fingerprint || ref.tokenizerVersion !== v.tokenizerVersion) {
    res.status(409).json({ error: "Text changed; reselect from current text" }); return;
  }
  if (v.end > ref.words.length || v.targets.some(i => !isPracticeWord(ref.words[i]!)) ||
      !v.attempts.every(a => validAttempt(a, practiceWordCount(ref.words.slice(v.start, v.end))))) {
    res.status(400).json({ error: "Invalid word positions or attempt" }); return;
  }
  const selection: Selection = { reference: ref, start: v.start, end: v.end, targets: v.targets, initialAttempts: v.attempts };
  const result = await db.transaction(async tx => {
    await tx.select().from(profilesTable).where(eq(profilesTable.clerkId, req.mateenUserId!)).for("update");
    const [previous] = await tx.select().from(wordPracticesTable).where(and(eq(wordPracticesTable.userId, req.mateenUserId!),
      eq(wordPracticesTable.requestId, v.requestId)));
    // Attempts can be appended independently after create. Retries don't rewrite them.
    if (previous) return isDeepStrictEqual(previous.selection, selection) ? previous : "conflict";
    const quota = await tx.select({ id: wordPracticesTable.id }).from(wordPracticesTable)
      .where(eq(wordPracticesTable.userId, req.mateenUserId!)).limit(100);
    if (quota.length >= 100) return "quota";
    const [r] = await tx.insert(wordPracticesTable).values({ id: randomUUID(), userId: req.mateenUserId!,
      requestId: v.requestId, selection, attempts: v.attempts }).returning();
    return r!;
  });
  if (typeof result === "string") { res.status(409).json({ error: result }); return; }
  res.status(201).json(output(result, refs));
});
router.get(`${path}/:id`, async (req: AuthedRequest, res) => {
  if (!z.uuid().safeParse(req.params.id).success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [r] = await db.select().from(wordPracticesTable).where(owned(String(req.params.id), req.mateenUserId!));
  const value = r && output(r, await references());
  if (!value) { res.status(404).json({ error: "Exercise or reference unavailable" }); return; }
  res.json(value);
});
router.post(`${path}/:id/attempts`, mutationOriginProtection, rateLimit(120, 3600_000), json({ limit: "4kb" }), async (req: AuthedRequest, res) => {
  const parsed = practiceAttemptInput.safeParse(req.body);
  if (!z.uuid().safeParse(req.params.id).success || !parsed.success) { res.status(400).json({ error: "Invalid attempt" }); return; }
  const refs = await references();
  const result = await db.transaction(async tx => {
    const [r] = await tx.select().from(wordPracticesTable).where(owned(String(req.params.id), req.mateenUserId!)).for("update");
    if (!r) return "missing";
    const value = output(r, refs), s = r.selection as Selection, v = parsed.data;
    if (!value || value.stale || v.fingerprint !== s.reference.fingerprint) return "stale";
    if (!validAttempt(v.attempt, practiceWordCount(s.reference.words.slice(s.start, s.end)))) return "invalid";
    const attempts = r.attempts as WordPracticeAttempt[], previous = attempts.find(a => a.requestId === v.attempt.requestId);
    if (previous) return isDeepStrictEqual(previous, v.attempt) ? r : "conflict";
    // Finite log; never silently reinterpret older attempts as mastery.
    if (attempts.length >= 20) return "quota";
    const [updated] = await tx.update(wordPracticesTable).set({ attempts: [...attempts, v.attempt] })
      .where(owned(r.id, req.mateenUserId!)).returning();
    return updated!;
  });
  if (typeof result === "string") { res.status(result === "missing" ? 404 : result === "invalid" ? 400 : 409).json({ error: result }); return; }
  res.json(output(result, refs));
});
router.delete(`${path}/:id`, mutationOriginProtection, async (req: AuthedRequest, res) => {
  if (!z.uuid().safeParse(req.params.id).success) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(wordPracticesTable).where(owned(String(req.params.id), req.mateenUserId!));
  res.sendStatus(204); // Retried deletion is safe, including a different owner's opaque id.
});
export default router;
