import type { PracticeReport, PracticeReportHadith } from '@workspace/api-client-react';

// Ordinals use local calendar dates, not elapsed 24-hour periods (DST-safe).
const dayOf = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
const nonnegative = (n: number) => Number.isFinite(n) && n >= 0;
const validAnalysis = (a: PracticeReportHadith) =>
  Number.isInteger(a.number) && a.number >= 1 && a.number <= 42 &&
  [a.totalWords, a.covered, a.matched, a.attempted, a.substitutions, a.omissions, a.extras].every(nonnegative) &&
  a.totalWords > 0 && a.attempted > 0 && a.covered <= a.totalWords && a.matched <= a.covered && a.matched <= a.attempted;

// Report-save history only. Real study continuity comes exclusively from the activity API.
export function buildStudyInsights(reports: PracticeReport[], now = new Date()) {
  const seen = new Set<string>();
  const valid = reports.filter(r => {
    const stamp = Date.parse(r.createdAt);
    if (!r.complete || !Number.isFinite(stamp) || stamp > now.getTime() ||
      !nonnegative(r.matched) || !nonnegative(r.attempted) || !r.attempted || r.matched > r.attempted ||
      !r.analyses.length || !r.analyses.every(validAnalysis) || seen.has(r.attemptId)) return false;
    seen.add(r.attemptId);
    return true;
  }).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
  const days = new Set(valid.map(r => dayOf(new Date(r.createdAt))));
  const today = dayOf(now);
  let currentStreak = 0, longestStreak = 0, run = 0;
  let cursor = days.has(today) ? today : today - 1;
  while (days.has(cursor)) { currentStreak++; cursor--; }
  let previous: number | undefined;
  for (const day of [...days].sort((a, b) => a - b)) {
    run = previous !== undefined && day === previous + 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run); previous = day;
  }
  const latest = new Map<number, PracticeReportHadith>();
  for (const r of valid) for (const h of r.analyses) if (!latest.has(h.number)) latest.set(h.number, h);
  return {
    currentStreak, longestStreak, activeDays: days.size, reportCount: valid.length,
    matched: valid.reduce((n, r) => n + r.matched, 0),
    attempted: valid.reduce((n, r) => n + r.attempted, 0),
    hadiths: [...latest.values()].sort((a, b) => a.number - b.number).map(h => ({
      id: h.id, number: h.number, title: h.title, matched: h.matched, attempted: h.attempted, totalWords: h.totalWords,
      covered: h.covered, substitutions: h.substitutions, omissions: h.omissions, extras: h.extras,
      status: (h.covered < h.totalWords ? 'partial' : h.matched / h.attempted >= .9 ? 'strong' : 'review') as 'partial' | 'strong' | 'review',
    })),
  };
}