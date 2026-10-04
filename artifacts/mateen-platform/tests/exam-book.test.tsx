import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiveExamBook, ExamReview } from '../src/components/mateen/exam-book';

test('live exam book hides unreached source and shows only confirmed or provisional words', () => {
  const html = renderToStaticMarkup(<LiveExamBook title="عنوان" words={['أول', 'ثان', 'سري']}
    revealed={[true, false, false]} interimIndices={[1]} listening />);
  assert.ok(html.includes('أول') && html.includes('ثان'));
  assert.ok(!html.includes('سري'));
  assert.ok(!html.includes('exam-review'));
});
test('review lists expected/heard differences safely and leaves unspoken suffix incomplete', () => {
  const html = renderToStaticMarkup(<ExamReview title="عنوان"
    outcome={{ stageNumber: 1, percent: 25, passed: false, complete: false, matched: 1, total: 4, extras: 0, nextStage: null }}
    snapshot={{ words: ['أول', 'ثان', 'ثالث', 'رابع'], matched: [0], issues: [
      { index: 1, expected: 'ثان', heard: '<script>bad</script>', kind: 'substitution' },
      { index: 2, expected: 'ثالث', heard: '', kind: 'omission' },
    ] }} />);
  assert.ok(html.includes('استبدال') && html.includes('حذف'));
  assert.ok(html.includes('ثان') && html.includes('ثالث'));
  assert.ok(html.includes('exam-review-incomplete'));
  assert.ok(html.includes('&lt;script&gt;') && !html.includes('<script>'));
  assert.ok(!html.includes('line-through') && !html.includes('<del'));
});