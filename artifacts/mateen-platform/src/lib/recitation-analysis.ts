import { normalizeRecitationWord, type RecitationIssue } from './live-recitation';
import type { buildRecitationBook } from './recitation-book';

export type HadithSummary = {
  id: number; number: number; title: string; start: number; end: number;
  totalWords: number; matched: number; substitutions: number; omissions: number; extras: number;
  attempted: number; heard: number; covered: number;
  successPercent: number; differencePercent: number;
};
export type HadithAnalysis = HadithSummary & { issues: RecitationIssue[] };

/** Counts only the attempted passage; an unreached suffix is not an omission. */
export function analyzeRecitation(
  book: ReturnType<typeof buildRecitationBook>,
  matchedIndices: number[],
  issues: RecitationIssue[],
): HadithAnalysis[] {
  const matched = new Set(matchedIndices.filter(i => Number.isSafeInteger(i) && i >= 0 &&
    i < book.words.length && normalizeRecitationWord(book.words[i])));
  const validIssues = issues.filter(i => Number.isSafeInteger(i.index) && i.index >= 0 && i.index < book.words.length);
  const spans = new Map<number, { id: number; number: number; title: string; start: number; end: number }>();
  for (const page of book.pages) for (const s of page.segments) {
    const previous = spans.get(s.hadithId);
    if (previous) previous.end = Math.max(previous.end, s.end);
    else spans.set(s.hadithId, { id: s.hadithId, number: s.hadithNumber, title: s.title, start: s.start, end: s.end });
  }
  return [...spans.values()].flatMap(s => {
    const good = [...matched].filter(i => i >= s.start && i < s.end);
    const differences = validIssues.filter(i => i.index >= s.start && i.index < s.end);
    if (!good.length && !differences.length) return [];
    const substitutions = differences.filter(i => i.kind === 'substitution').length;
    const omissions = differences.filter(i => i.kind === 'omission').length;
    const extras = differences.filter(i => i.kind === 'extra').length;
    const attempted = good.length + differences.length;
    const successPercent = Math.round(100 * good.length / attempted);
    return [{
      ...s, totalWords: book.words.slice(s.start, s.end).filter(normalizeRecitationWord).length,
      matched: good.length, substitutions, omissions, extras, attempted,
      heard: good.length + substitutions + extras,
      covered: new Set([...good, ...differences.filter(i => i.kind !== 'extra').map(i => i.index)]).size,
      successPercent, differencePercent: 100 - successPercent, issues: differences,
    }];
  });
}