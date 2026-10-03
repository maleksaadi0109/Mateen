import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import RecitationBook from '../src/components/mateen/recitation-book';
import nawawi from '../../api-server/src/data/nawawi.json';
import { buildRecitationBook } from '../src/lib/recitation-book';

test('full-book entry renders real text, all hadith choices and digital source disclosure without scan images', () => {
  const html = renderToStaticMarkup(<RecitationBook hadiths={nawawi} sourceStatus="retrieved_pending_review" />);
  assert.match(html, /عن/);
  assert.match(html, /أمير/);
  assert.equal((html.match(/<option /g) ?? []).length, 42);
  assert.match(html, /ترقيم الصفحات هنا رقمي/);
  assert.match(html, /النص قيد المراجعة العلمية/);
  assert.match(html, /data-testid="book-page-1"/);
  assert.doesNotMatch(html, /<img|recitation-page-images|scanned-pages/);
  assert.doesNotMatch(html, /data-testid="text-book-complete"/);
});

test('deep linking selects the correct digital page without declaring the preceding pages complete', () => {
  const book = buildRecitationBook(nawawi);
  const expected = book.pages.find(p => book.hadithStarts[42] >= p.start && book.hadithStarts[42] < p.end)!;
  const html = renderToStaticMarkup(<RecitationBook hadiths={nawawi} initialHadith={42} sourceStatus="approved" />);
  assert.match(html, new RegExp(`data-testid="book-page-${expected.number}"`));
  assert.doesNotMatch(html, /data-testid="text-book-complete"/);
  assert.doesNotMatch(html, /data-testid="text-book-pending"/);
});

test('untrusted source links fail explicitly instead of producing executable links', () => {
  const html = renderToStaticMarkup(<RecitationBook hadiths={[{ ...nawawi[0], sourceUrl: 'javascript:alert(1)' }]} />);
  assert.match(html, /role="alert"/);
  assert.doesNotMatch(html, /javascript:|recitation-book"/);
});