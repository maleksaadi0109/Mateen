import type { GroundedAnswer, PassageCandidate } from "../../src/lib/scholarly";
export * from "../../src/lib/scholarly";

export async function classifyHadithQuestion(question: string) {
  return /الطقس|كرة القدم|اكتب برنامج/.test(question) ? "out_of_scope" as const : "hadith" as const;
}

type Completion = (passages: PassageCandidate[]) => Promise<GroundedAnswer>;
let completion: Completion = async () => ({
  abstain: true, reason: "امتناع اختباري", answer: null, citations: [],
});
export function setCompletion(value: Completion) { completion = value; }
let configured = true;
export function setProviderConfigured(value: boolean) { configured = value; }
export function isScholarlyProviderConfigured() { return configured; }
let studyCalls = 0;
export function getStudyCallCount() { return studyCalls; }
let lastStudyInput: { question: string; context: string | null; book: string | undefined } | null = null;
export function getLastStudyInput() { return lastStudyInput; }
let lastHistory: Array<{ role: string; text: string }> = [];
export function getLastStudyHistory() { return lastHistory; }
let studyCompletion: (() => Promise<string | null>) | null = null;
export function setStudyCompletion(value: (() => Promise<string | null>) | null) { studyCompletion = value; }
export async function answerStudyQuestion(question: string, context: string | null, _model?: string, book?: string) {
  studyCalls++;
  lastStudyInput = { question, context, book };
  return studyCompletion ? studyCompletion() : "تنبيه: إجابة آلية غير مراجعة علمياً، وقد تتضمن أخطاء. ليست فتوى.\n\nإجابة تعليمية اصطناعية للاختبار فقط.";
}
export async function generateStudyAnswer(question: string, context: string | null, model?: string, book?: string, history: Array<{ role: string; text: string }> = []) {
  lastHistory = history;
  return answerStudyQuestion(question, context, model, book);
}
let lastSourceInput = "";
let sourceCalls = 0;
export function getLastSourceInput() { return lastSourceInput; }
export function getSourceCallCount() { return sourceCalls; }
export async function semanticRank(question: string, passages: PassageCandidate[]) {
  lastSourceInput = question;
  return passages;
}
export async function answerFromPassages(
  _question: string, _context: string | null, passages: PassageCandidate[],
) {
  sourceCalls++;
  if (!passages.length) return { abstain: true, reason: "", answer: null, citations: [] };
  return completion(passages);
}