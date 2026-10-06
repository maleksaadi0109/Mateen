import assert from 'node:assert/strict';
import { test } from 'node:test';
import { suggestTargets, toggleTarget, validRange, verifiedSpan } from '../src/lib/word-practice-selection.ts';

const words = ['أ', 'ب', 'أ', 'ج'];
test('context must equal server words; mismatch is never remapped', () => {
  assert.deepEqual(verifiedSpan(words, { words: [...words], start: 1, end: 3 }), { start: 1, end: 3 });
  assert.equal(verifiedSpan(words, { words: ['أ', 'ب', 'ج', 'ج'], start: 0, end: 4 }), null);
  assert.equal(verifiedSpan(words, null), null);
});
test('repeated positions are independent, capped and range-bound', () => {
  const r = { start: 0, end: 4 };
  assert.deepEqual(toggleTarget(toggleTarget([], 0, r), 2, r), [0, 2]);
  assert.deepEqual(toggleTarget([0, 2], 0, r), [2]);
  assert.deepEqual(toggleTarget([], 9, r), []);
  const full = Array.from({ length: 20 }, (_, i) => i);
  assert.equal(toggleTarget(full, 25, { start: 0, end: 30 }), full);
  assert.equal(validRange({ start: 0, end: 121 }, { start: 0, end: 200 }), false);
});
test('suggestions skip extras and positions outside the verified span', () => {
  const issues = [{ index: 11, kind: 'omission', expected: 'ب', heard: '' }, { index: 12, kind: 'extra', expected: '', heard: 'س' }, { index: 20, kind: 'substitution', expected: 'ج', heard: 'د' }] as const;
  assert.deepEqual(suggestTargets(issues, 10, { start: 0, end: 3 }), [1]);
  assert.deepEqual(suggestTargets(issues, 10, null), []);
  const paginated = Array.from({ length: 160 }, (_, index) => ({ index, kind: 'omission' as const, expected: 'كلمة', heard: '' }));
  assert.deepEqual(suggestTargets(paginated, 0, { start: 110, end: 115 }), [110,111,112,113,114]);
});
