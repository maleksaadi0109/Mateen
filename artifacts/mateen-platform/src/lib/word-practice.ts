import { normalizeRecitationWord, type RecitationIssue } from './live-recitation';

/** Only anchored, whole-passage recognition is comparable. Never grade silence. */
export function summarizeWordPractice(summary: { matchedIndices: number[]; issues: RecitationIssue[]; spokenWords: number }, words: string[]) {
  const meaningful = words.flatMap((w, i) => normalizeRecitationWord(w) ? [i] : []);
  const good = new Set(summary.matchedIndices.filter(i => meaningful.includes(i)));
  if (!summary.spokenWords || !good.size) return { status: 'unavailable' as const, covered: 0, matched: 0 };
  const observed = new Set([...good, ...summary.issues.filter(i => i.kind !== 'extra' && meaningful.includes(i.index)).map(i => i.index)]);
  // Boundary substitutions don't prove coverage: remote ASR can append unrelated speech.
  const anchored = good.has(meaningful[0]!) && good.has(meaningful.at(-1)!);
  const comparable = anchored && meaningful.every(i => observed.has(i));
  return { status: comparable ? 'comparable' as const : 'incomplete' as const,
    covered: comparable ? meaningful.length : Math.min(meaningful.length - 1, observed.size), matched: Math.min(good.size, comparable ? meaningful.length : Math.min(meaningful.length - 1, observed.size)) };
}
