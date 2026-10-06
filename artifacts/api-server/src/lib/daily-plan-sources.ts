import { createHash } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { learningStagesTable, scheduledReviewsTable, wordPracticesTable, type db } from "@workspace/db";
import type { WordPracticeReference } from "@workspace/api-zod";
import { getNawawiStudyRecords } from "./source-review";
import { practiceReference } from "./word-practice-policy";
import { effectiveProgress, recordsFor } from "../routes/learning-stages";
import { tuhfaChapterStages } from "../data/tuhfa";
import type { Candidate } from "./daily-plan-policy";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const reviewKey = (r: { id: string; dueAt: Date }) => `review:${r.id}:${r.dueAt.toISOString()}`;
export const reviewHash = (r: { sourceVersion: string; passagePrompt: string | null; referenceText: string | null }) =>
  hash([r.sourceVersion, r.passagePrompt, r.referenceText]);

/** Failure to load any input must fail the plan, not silently substitute empty queues. */
export async function dailySources(tx: Tx, userId: string, now: Date) {
  const source = await getNawawiStudyRecords();
  const stageRows = await tx.select().from(learningStagesTable).where(eq(learningStagesTable.userId, userId));
  const reviews = await tx.select().from(scheduledReviewsTable).where(eq(scheduledReviewsTable.userId, userId))
    .orderBy(asc(scheduledReviewsTable.dueAt), asc(scheduledReviewsTable.id));
  const practices = await tx.select().from(wordPracticesTable).where(eq(wordPracticesTable.userId, userId))
    .orderBy(asc(wordPracticesTable.createdAt), asc(wordPracticesTable.id));
  const candidates: Candidate[] = [], available: Candidate[] = [];
  let staleCount = 0;
  for (const r of reviews) {
    if (r.dueAt > now) continue;
    if (!r.passagePrompt || !r.referenceText) { staleCount++; continue; }
    const c: Candidate = { kind: "confirmed_review", sourceKey: reviewKey(r), sourceHash: reviewHash(r),
      title: `مراجعة مؤكدة · الحديث ${r.hadithNumber}`,
      reason: "مراجعة مستحقة مجدولة من خطأ مؤكد؛ الأقدم أولاً دون تكديس أيام الغياب.",
      href: `/student/reviews?review=${encodeURIComponent(r.id)}#review-${encodeURIComponent(r.id)}` };
    candidates.push(c); available.push(c);
  }
  const refs = source.hadiths.map(practiceReference);
  for (const p of practices) {
    const selection = p.selection as { reference: WordPracticeReference };
    const ref = refs.find(r => r.hadithId === selection.reference.hadithId);
    if (!ref || ref.fingerprint !== selection.reference.fingerprint || ref.tokenizerVersion !== selection.reference.tokenizerVersion) { staleCount++; continue; }
    const c: Candidate = { kind: "word_practice", sourceKey: `practice:${p.id}`, sourceHash: ref.fingerprint,
      title: `تدريب كلمات · ${ref.title}`, reason: "تمرين اخترته أنت؛ ليس خطأ مؤكداً ولا يغيّر جدول المراجعات.",
      href: `/student/reviews?practice=${encodeURIComponent(p.id)}` };
    candidates.push(c); available.push(c);
  }
  for (const textId of ["nawawi", "tuhfa"]) {
    const saved = effectiveProgress(stageRows.filter(r => textId === "nawawi" ? r.textId === textId : ["tuhfa", "tuhfa-chapters"].includes(r.textId)), textId);
    const passed = new Set(saved.filter(r => r.passedAt).map(r => r.stageNumber));
    const records = recordsFor(textId), current = records.find(r => !passed.has(r.number));
    const texts = textId === "nawawi" ? source.hadiths : tuhfaChapterStages;
    for (const stage of records) {
      if (!passed.has(stage.number) && stage.number !== current?.number) continue;
      const text = texts.find(r => r.number === stage.number);
      if (!text?.text) { if (stage.number === current?.number) staleCount++; continue; }
      const c: Candidate = { kind: "new_learning", sourceKey: `learning:${textId}:${stage.number}`, sourceHash: hash(text.text),
        title: `${textId === "nawawi" ? "الأربعون النووية" : "تحفة الأطفال"} · ${stage.title}`,
        reason: "موضعك الحالي في المسار المفتوح، بحسب المراحل المجتازة لا إجاباتك الذاتية.",
        href: `/student/learn/${textId}/${stage.number}` };
      available.push(c);
      if (stage.number === current?.number) candidates.push(c);
    }
  }
  return { candidates, available, reviews, staleCount };
}
