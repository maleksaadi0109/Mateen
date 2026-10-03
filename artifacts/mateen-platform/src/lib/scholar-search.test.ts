import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterScholars, normalizeArabic } from './scholar-search';

const scholars = [
  { id: 'one', name: 'أَحْمَد موسى', specialties: 'الحديث والقراءات', available: true },
  { id: 'two', name: 'إبراهيم', specialties: 'العقيدة', available: false },
];

test('matches names despite Arabic diacritics, tatweel and alef/yaa variants', () => {
  assert.equal(normalizeArabic(' أَحْـمَد   موسى '), 'احمد موسي');
  assert.deepEqual(filterScholars(scholars, 'احمد موسي', 'all'), [scholars[0]]);
});

test('combines name and specialty terms and matches every term', () => {
  assert.deepEqual(filterScholars(scholars, 'أحمد حديث', 'all'), [scholars[0]]);
  assert.deepEqual(filterScholars(scholars, 'أحمد العقيدة', 'all'), []);
  assert.deepEqual(filterScholars(scholars, 'عقيده', 'all'), [scholars[1]]);
});

test('availability filters and a cleared search restore the expected real list', () => {
  assert.deepEqual(filterScholars(scholars, '', 'available'), [scholars[0]]);
  assert.deepEqual(filterScholars(scholars, '', 'unavailable'), [scholars[1]]);
  assert.deepEqual(filterScholars(scholars, '   ', 'all'), scholars);
  assert.deepEqual(filterScholars([], 'حديث', 'all'), []);
});

test('does not mutate the source data or interpret search strings as executable input', () => {
  const before = structuredClone(scholars);
  assert.deepEqual(filterScholars(scholars, '<script>alert(1)</script>', 'all'), []);
  assert.deepEqual(scholars, before);
});