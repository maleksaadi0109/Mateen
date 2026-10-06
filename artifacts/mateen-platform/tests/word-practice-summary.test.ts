import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeWordPractice } from '../src/lib/word-practice';
const words = ['الله', 'الله', 'كلمة', 'أخرى', 'نهاية'];
test('short passage only, repeated positions and anchored approximate comparison', () => {
  assert.deepEqual(summarizeWordPractice({ matchedIndices: [0,1,2,3,4], issues: [], spokenWords: 5 }, words),
    { status: 'comparable', covered: 5, matched: 5 });
  assert.equal(summarizeWordPractice({ matchedIndices: [0,1,2], issues: [], spokenWords: 3 }, words).status, 'incomplete');
  assert.equal(summarizeWordPractice({ matchedIndices: [], issues: [], spokenWords: 0 }, words).status, 'unavailable');
  assert.equal(summarizeWordPractice({ matchedIndices: [], issues: words.map((expected,index) => ({ index,expected,heard:'other',kind:'substitution' as const })), spokenWords: 5 }, words).status, 'unavailable');
  assert.equal(summarizeWordPractice({ matchedIndices: [0,1,2,3], issues: [{index:4,expected:'نهاية',heard:'something',kind:'substitution'}], spokenWords: 5 }, words).status, 'incomplete');
  assert.deepEqual(summarizeWordPractice({ matchedIndices: [0,1,3,4], issues: [{index:2,expected:'كلمة',heard:'',kind:'omission'},{index:3,expected:'أخرى',heard:'extra',kind:'extra'}], spokenWords: 5 }, words),
    { status: 'comparable', covered: 5, matched: 4 });
  assert.deepEqual(summarizeWordPractice({ matchedIndices: [0,1,2,3,4,5,6], issues: [], spokenWords: 5 }, ['«', ...words, '»']),
    { status: 'comparable', covered: 5, matched: 5 });
});
