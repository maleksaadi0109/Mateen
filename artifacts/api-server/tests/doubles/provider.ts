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
export async function answerStudyQuestion() {
  studyCalls++;
  return "تنبيه: هذه إجابة آلية غير موثّقة بالمصادر المعتمدة، وقد تتضمن أخطاء. ليست فتوى ولا تغني عن مراجعة عالم مؤهل.\n\nإجابة تعليمية اصطناعية للاختبار فقط.";
}
export async function semanticRank(_question: string, passages: PassageCandidate[]) { return passages; }
export async function answerFromPassages(
  _question: string, _context: string | null, passages: PassageCandidate[],
) { return completion(passages); }