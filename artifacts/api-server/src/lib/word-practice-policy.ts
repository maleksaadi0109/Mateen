import { createHash } from "node:crypto";
import { z } from "zod";
import { SaveWordPracticeBody, SaveWordPracticeAttemptBody, type WordPracticeReference, type WordPracticeAttempt } from "@workspace/api-zod";
import { pageWords } from "./recitation-pages";

export const TOKENIZER_VERSION = "arabic-whitespace-v1";
export const isPracticeWord = (s: string) => /[\p{L}\p{N}]/u.test(s.replace(/[\u064B-\u065F\u0670\u06D6-\u06EDـ]/g, ""));
export const practiceWordCount = (words: string[]) => words.filter(isPracticeWord).length;
export function practiceReference(record: { id: number; title: string; text: string }): WordPracticeReference {
  return { hadithId: record.id, title: record.title, tokenizerVersion: TOKENIZER_VERSION,
    fingerprint: createHash("sha256").update(`${TOKENIZER_VERSION}\0${record.text}`).digest("hex"),
    words: pageWords(record.text) };
}
// Generated schemas implement shape; strict wrappers reject unintended sensitive fields.
const attempt = z.object({
  requestId: z.string().uuid(), status: z.enum(["comparable", "incomplete", "unavailable"]),
  covered: z.number().int().min(0).max(120), matched: z.number().int().min(0).max(120),
}).strict();
export const practiceInput = SaveWordPracticeBody.and(z.object({
  requestId: z.string().uuid(), consent: z.literal(true), hadithId: z.number().int().min(1).max(42),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/), tokenizerVersion: z.literal(TOKENIZER_VERSION),
  start: z.number().int().nonnegative(), end: z.number().int().positive(),
  targets: z.array(z.number().int().nonnegative()).min(1).max(20),
  attempts: z.array(attempt).max(20),
}).strict()).refine(v => v.end > v.start && v.end - v.start <= 120 &&
  new Set(v.targets).size === v.targets.length && v.targets.every(i => i >= v.start && i < v.end) &&
  new Set(v.attempts.map(a => a.requestId)).size === v.attempts.length);
export const practiceAttemptInput = SaveWordPracticeAttemptBody.and(z.object({
  consent: z.literal(true), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), attempt,
}).strict());
export function validAttempt(a: WordPracticeAttempt, count: number) {
  return a.matched <= a.covered && a.covered <= count &&
    (a.status !== "comparable" || a.covered === count) &&
    (a.status !== "incomplete" || a.covered < count) &&
    (a.status !== "unavailable" || (a.covered === 0 && a.matched === 0));
}
