import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnswerText } from '../src/components/scholarly/AnswerText';

test('renders exact source-page links while preserving plain text and escaping untrusted markup', () => {
  const html = renderToStaticMarkup(<AnswerText text={
    'مقتطف غير معتمد\n<script>unsafe()</script>\nرابط المرجع: https://shamela.ws/book/21812/5\nرابط المرجع: https://shamela.ws/book/11325/7'
  } />);
  assert.match(html, /dir="rtl"/);
  assert.match(html, /href="https:\/\/shamela.ws\/book\/21812\/5"/);
  assert.match(html, /href="https:\/\/shamela.ws\/book\/11325\/7"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('does not turn arbitrary student or model URLs into reference links', () => {
  for (const url of [
    'javascript:alert(1)', 'https://shamela.ws.evil.invalid/book/21812/5',
    'https://shamela.ws/book/9999/5', 'https://shamela.ws/book/21812/5?redirect=evil',
    'https://shamela.ws/book/21812/5/../../evil',
  ]) {
    const html = renderToStaticMarkup(<AnswerText text={`رابط المرجع: ${url}`} />);
    assert.doesNotMatch(html, /<a /);
  }
});