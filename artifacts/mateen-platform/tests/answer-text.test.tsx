import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnswerText } from '../src/components/scholarly/AnswerText';
import { ChatMessages } from '../src/components/scholarly/ChatMessages';
import { AnswerModeControl } from '../src/components/scholarly/AnswerModeControl';
import { CitationList } from '../src/components/scholarly/shared';

test('persisted source references render collapsed, distinguish printed/PDF pages and never certify legacy answers', () => {
  const html = renderToStaticMarkup(<ChatMessages viewer="student" messages={[
    { id: 'source', role: 'assistant', text: '«نص اصطناعي»', createdAt: '2026-10-05T12:00:00Z',
      answerMode: 'sources', citations: [{ passageId: 'p', sourceId: 's', sourceTitle: 'مرجع <script>',
        author: 'مؤلف', edition: 'طبعة', sourceVersion: 'نسخة', volume: null, printedPage: '٣', pdfPage: 8, quote: 'نص اصطناعي' }] },
    { id: 'legacy', role: 'assistant', text: 'سابق', createdAt: '2026-10-05T12:00:00Z', citations: [] },
    { id: 'study', role: 'assistant', text: 'شرح', createdAt: '2026-10-05T12:00:00Z', answerMode: 'study', citations: [] },
  ]} />);
  assert.match(html, /الإجابة من المصادر/);
  assert.match(html, /لم تُصنّف ضمن وضع المصادر/);
  assert.match(html, /غير مراجع علمياً/);
  assert.match(html, /<details[^>]*><summary/);
  assert.doesNotMatch(html, /<details[^>]*open/);
  assert.match(html, /من أين جاءت الإجابة/);
  // Closed cards intentionally do not mount the current-state query. Verify
  // stored metadata separately; open/reopen/error behavior has DOM tests.
  const references = renderToStaticMarkup(<CitationList citations={[{
    passageId: 'p', sourceId: 's', sourceTitle: 'مرجع <script>', author: 'مؤلف', edition: 'طبعة',
    sourceVersion: 'نسخة', volume: null, printedPage: '٣', pdfPage: 8, quote: 'نص اصطناعي',
  }]} />);
  assert.match(references, /الصفحة المطبوعة: ٣/);
  assert.match(references, /صفحة PDF: ٨/);
  assert.match(references, /إصدار المصدر: نسخة/);
  assert.match(references, /لا تتوفر بيانات حالة وقت الإجابة/);
  assert.doesNotMatch(references, /<script>/);
  assert.doesNotMatch(html, /<script>/);
});

test('source mode selector keeps explicit modes and discloses unavailable evidence without invented page numbers', () => {
  const html = renderToStaticMarkup(<AnswerModeControl value="sources" onChange={() => {}} disabled={false}
    sourceBlockers={['no_sources', 'evaluation_required']} covered={false} />);
  assert.match(html, /شرح تعليمي/);
  assert.match(html, /الإجابة من المصادر/);
  assert.match(html, /لن يتحول هذا الوضع تلقائياً/);
  assert.match(html, /لا توجد مقاطع مؤهلة للكتاب المحدد/);
  const message = renderToStaticMarkup(<ChatMessages viewer="student" messages={[{
    id: 'no-pages', role: 'assistant', text: '«نص»', answerMode: 'sources', createdAt: '2026-10-05T12:00:00Z',
    citations: [{ passageId: 'p', sourceId: 's', sourceTitle: 'مرجع', author: 'مؤلف', edition: 'طبعة',
      quote: 'نص', volume: null, pdfPage: null, printedPage: null }],
  }]} />);
  assert.doesNotMatch(message, /صفحة PDF|الصفحة المطبوعة/);
});

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