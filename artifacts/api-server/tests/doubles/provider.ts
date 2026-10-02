import type { GroundedAnswer, PassageCandidate } from "../../src/lib/scholarly";
export * from "../../src/lib/scholarly";

type Completion = (passages: PassageCandidate[]) => Promise<GroundedAnswer>;
let completion: Completion = async () => ({
  abstain: true, reason: "امتناع اختباري", answer: null, citations: [],
});
export function setCompletion(value: Completion) { completion = value; }
export function isScholarlyProviderConfigured() { return true; }
export async function semanticRank(_question: string, passages: PassageCandidate[]) { return passages; }
export async function answerFromPassages(
  _question: string, _context: string | null, passages: PassageCandidate[],
) { return completion(passages); }