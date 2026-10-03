import { createHash } from "node:crypto";
import { FinishStageAttemptBody } from "@workspace/api-zod";
import nawawi from "../data/nawawi.json";

export const STAGE_THRESHOLD = 90;
export const stageInput = FinishStageAttemptBody.extend({
  issues: FinishStageAttemptBody.shape.issues.element.strict().array().max(3000),
}).strict();

// Must stay aligned with browser recitationWords / normalizeRecitationWord.
export function stageWords(text: string) {
  return text.replace(/﵌/g, "صلى الله عليه وآله وسلم")
    .replace(/﵁/g, "رضي الله عنه").replace(/﵂/g, "رضي الله عنها")
    .normalize("NFKC").trim().split(/\s+/u).filter(Boolean);
}
export const isStageWord = (s: string) => /[\p{L}\p{N}]/u.test(s.replace(/[\u064B-\u065F\u0670\u06D6-\u06EDـ]/g, ""));
export const learningRecord = (h: { number: number; title: string; text: string }) => ({
  ...h, words: stageWords(h.text),
  hash: createHash("sha256").update(h.text).digest("hex"),
});
export const learningRecords = nawawi.map(learningRecord);

/** Browser alignment is untrusted, approximate practice telemetry, not audio verification.
 * Server controls the denominator, threshold, ownership, source and stage gates.
 * No client percentage, transcript, word strings or official grade is accepted.
 */
export function scoreStage(words: string[], input: unknown) {
  const parsed = stageInput.safeParse(input);
  if (!parsed.success) return null;
  const { matchedIndices, issues } = parsed.data;
  const valid = new Set(words.flatMap((w, i) => isStageWord(w) ? [i] : []));
  const matches = new Set(matchedIndices);
  if (!valid.size || matches.size !== matchedIndices.length || [...matches].some(i => !valid.has(i))) return null;
  const covered = new Set(matches);
  let extras = 0;
  for (const issue of issues) {
    if (!valid.has(issue.index)) return null;
    if (issue.kind === "extra") { extras++; continue; }
    if (covered.has(issue.index)) return null;
    covered.add(issue.index);
  }
  const total = valid.size;
  const denominator = total + extras;
  const complete = covered.size === total;
  return {
    // Floor avoids showing 90% for a failing 89.8% attempt.
    percent: Math.floor(100 * matches.size / denominator),
    matched: matches.size, total, extras, complete,
    passed: complete && matches.size * 100 >= STAGE_THRESHOLD * denominator,
  };
}