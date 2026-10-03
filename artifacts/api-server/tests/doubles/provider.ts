import type { GroundedAnswer, PassageCandidate } from "../../src/lib/scholarly";
export * from "../../src/lib/scholarly";

type Completion = (passages: PassageCandidate[]) => Promise<GroundedAnswer>;
let completion: Completion = async () => ({
  abstain: true, reason: "امتناع اختباري", answer: null, citations: [],
});
export function setCompletion(value: Completion) { completion = value; }
export function isScholarlyProviderConfigured() { return true; }
let studyCalls = 0;
export function getStudyCallCount() { return studyCalls; }
let lastStudyInput: { question: string; context: string | null; book: string | undefined } | null = null;
export function getLastStudyInput() { return lastStudyInput; }
let studyCompletion: (() => Promise<string>) | null = null;
export function setStudyCompletion(value: (() => Promise<string>) | null) { studyCompletion = value; }
export async function answerStudyQuestion(question: string, context: string | null, _model?: string, book?: string) {
  studyCalls++;
  lastStudyInput = { question, context, book };
  return studyCompletion ? studyCompletion() : "تنبيه: إجابة آلية غير مراجعة علمياً، وقد تتضمن أخطاء. ليست فتوى.\n\nإجابة تعليمية اصطناعية للاختبار فقط.";
}
export async function semanticRank(_question: string, passages: PassageCandidate[]) { return passages; }
export async function answerFromPassages(
  _question: string, _context: string | null, passages: PassageCandidate[],
) { return completion(passages); }