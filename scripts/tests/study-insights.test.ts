import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStudyInsights } from '../../artifacts/mateen-platform/src/lib/study-insights';
import type { PracticeReport } from '@workspace/api-client-react';

const now = new Date(2026, 9, 4, 18);
function report(day: number, id = String(day), overrides: Partial<PracticeReport> = {}): PracticeReport {
  return { id, attemptId: id, createdAt: new Date(2026, 9, day, 12).toISOString(), complete: true,
    matched: 95, attempted: 100, issueCount: 5,
    analyses: [{ id: 1, number: 1, title: 'حديث', start: 0, end: 100, totalWords: 100, matched: 95,
      substitutions: 5, omissions: 0, extras: 0, attempted: 100, heard: 100, covered: 100, successPercent: 95, differencePercent: 5 }],
    ...overrides };
}
test('empty account does not invent activity or mastery', () => {
  const r = buildStudyInsights([], now);
  assert.equal(r.currentStreak, 0); assert.equal(r.reportCount, 0); assert.deepEqual(r.hadiths, []);
});
test('same day counts once; yesterday allows an ongoing streak; gaps break it', () => {
  assert.equal(buildStudyInsights([report(2), report(3), report(3, 'other')], now).currentStreak, 2);
  const r = buildStudyInsights([report(1), report(2), report(4)], now);
  assert.equal(r.currentStreak, 1); assert.equal(r.longestStreak, 2); assert.equal(r.activeDays, 3);
  assert.equal(buildStudyInsights([report(1), report(2)], now).currentStreak, 0);
});
test('future, partial legacy, malformed and duplicate attempts cannot inflate activity', () => {
  const r = buildStudyInsights([report(4), report(4), report(5), report(3, 'old', {complete:false}), report(2, 'bad', {createdAt:'invalid'})], now);
  assert.equal(r.reportCount, 1); assert.equal(r.matched, 95);
});
test('latest hadith attempt wins and incomplete coverage is never mastery', () => {
  const old = report(2), latest = report(4);
  latest.analyses[0] = {...latest.analyses[0], covered: 20, matched: 20, attempted: 20};
  assert.equal(buildStudyInsights([old, latest], now).hadiths[0].status, 'partial');
  latest.analyses[0] = {...old.analyses[0], matched:80};
  assert.equal(buildStudyInsights([latest, old], now).hadiths[0].status, 'review');
  assert.equal(buildStudyInsights([old], now).hadiths[0].status, 'strong');
});
test('statistics include records beyond first pagination page; deletion recalculates', () => {
  const records = Array.from({length:25}, (_, i) => report(4, `attempt-${i}`));
  assert.equal(buildStudyInsights(records, now).reportCount, 25);
  assert.equal(buildStudyInsights(records.slice(1), now).reportCount, 24);
});