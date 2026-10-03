import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { useLiveRecitation } from '../src/hooks/use-live-recitation';
import { matchRecitation, recitationWords } from '../src/lib/live-recitation';
import { buildRecitationBook } from '../src/lib/recitation-book';
import nawawi from '../../api-server/src/data/nawawi.json';

const dom = new JSDOM('<html><body></body></html>', { url: 'https://test.invalid' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
const { createRoot } = await import('react-dom/client');
type Event = { results: Array<{ isFinal: boolean; 0: { transcript: string } }> };
class FakeRecognition {
  static latest: FakeRecognition;
  onresult: ((event: Event) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  aborted = false;
  constructor() { FakeRecognition.latest = this; }
  start() {}
  abort() { this.aborted = true; }
  emit(text: string, final: boolean) {
    this.onresult?.({ results: [{ isFinal: final, 0: { transcript: text } }] });
  }
}
let state: ReturnType<typeof useLiveRecitation>;
const reference = 'إنما الأعمال بالنيات وإنما لكل امرئ ما نوى';
test('Arabic whitespace variations do not become substitutions, without forgiving missing words', () => {
  assert.equal(matchRecitation(recitationWords('وإنما لكل امرئ'), 'و إنما لكل امرئ').mismatchIndex, null);
  assert.equal(matchRecitation(recitationWords('عبد الله'), 'عبدالله').mismatchIndex, null);
  assert.equal(matchRecitation(recitationWords('إنما الأعمال بالنيات'), 'إنما بالنيات').mismatchIndex, 1);
  assert.deepEqual(matchRecitation(recitationWords(reference), 'الأعمال بالنيات وإنما لكل امرئ', 3).indices, [3, 4, 5]);
  assert.equal(matchRecitation(recitationWords(reference), 'الأعمال بالنيات لكل امرئ', 3).mismatchIndex, 3);
});
function Harness() { state = useLiveRecitation(reference); return null; }
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const originalFetch = globalThis.fetch;
beforeEach(async () => {
  Object.assign(window, { SpeechRecognition: FakeRecognition });
  globalThis.fetch = async () => { throw new Error('Live practice must not submit audio, scores or progress'); };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
});
after(() => dom.window.close());

test('normalizes Arabic but never reveals skipped or invented source words', () => {
  const words = recitationWords('إِنَّمَا الأعمالُ بالنيات وإنما لكل امرئ');
  assert.deepEqual(matchRecitation(words, 'انما الاعمال بالنيات').indices, [0, 1, 2]);
  assert.deepEqual(matchRecitation(words, 'إنما بالنيات وإنما'), {indices:[0],cursor:1,mismatchIndex:1});
  assert.deepEqual(matchRecitation(words, 'شيء لا يوجد في النص').indices, []);
  assert.deepEqual(matchRecitation(recitationWords('إلى الله ورسوله فهجرته إلى الله ورسوله'), 'الله').indices, []);
  assert.equal(recitationWords('﵌').join(' '), 'صلى الله عليه وآله وسلم');
  assert.deepEqual(matchRecitation(recitationWords('إنما الأعمال .'), 'إنما الأعمال'),
    { indices: [0, 1, 2], cursor: 3, mismatchIndex: null });
});

test('complete textual collection paginates every sanad, report and attribution without gaps or additions', () => {
  const book = buildRecitationBook(nawawi);
  assert.equal(nawawi.length, 42);
  assert.equal(Object.keys(book.hadithStarts).length, 42);
  assert.deepEqual(book.words, nawawi.flatMap(h => recitationWords(h.text)));
  const covered = book.pages.flatMap(page => book.words.slice(page.start, page.end));
  assert.deepEqual(covered, book.words);
  assert.equal(book.pages[0].start, 0);
  assert.equal(book.pages.at(-1)!.end, book.words.length);
  assert.ok(book.pages.some(page => page.segments.some(segment => segment.continued)));
  for (const page of book.pages) {
    assert.equal(page.segments[0].start, page.start);
    assert.equal(page.segments.at(-1)!.end, page.end);
    for (let i = 1; i < page.segments.length; i++) {
      assert.equal(page.segments[i].start, page.segments[i - 1].end);
    }
  }
  // Do not silently use the primary report excerpt (hadith 27 has two reports).
  const report27 = book.words.slice(book.hadithStarts[27], book.hadithStarts[28]).join(' ');
  assert.equal(report27, recitationWords(nawawi[26].text).join(' '));
  const first = book.words.slice(0, book.hadithStarts[2]).join(' ');
  assert.match(first, /عن أمير المؤمنين/);
  assert.match(first, /رواه إماما المحدثين/);
  // A single continuous recognition result can cross all digital boundaries.
  const aligned = matchRecitation(book.words, book.text);
  assert.equal(aligned.cursor, book.words.length);
  assert.equal(aligned.mismatchIndex, null);
});

test('book refuses invalid page sizes, empty passages and duplicate identifiers', () => {
  assert.throws(() => buildRecitationBook(nawawi, 0));
  assert.throws(() => buildRecitationBook(nawawi, NaN));
  assert.throws(() => buildRecitationBook([]));
  assert.throws(() => buildRecitationBook([{ ...nawawi[0], text: ' ' }]));
  assert.throws(() => buildRecitationBook([{ ...nawawi[0], sourceUrl: 'javascript:alert(1)' }]));
  assert.throws(() => buildRecitationBook([nawawi[0], nawawi[0]]));
});

test('manual page jump stops capture without crediting skipped words and ignores stale callbacks', async () => {
  await act(async () => state.start());
  const first = FakeRecognition.latest;
  const stale = first.onresult!;
  await act(async () => first.emit('إنما', true));
  await act(async () => state.seek(3));
  assert.equal(first.aborted, true);
  assert.equal(state.cursor, 3);
  assert.equal(state.listening, false);
  assert.equal(state.revealed.some(Boolean), false);
  assert.equal(state.heardText, '');
  await act(async () => stale({ results: [{ isFinal: true, 0: { transcript: reference } }] }));
  assert.equal(state.cursor, 3);
  await act(async () => state.start());
  await act(async () => FakeRecognition.latest.emit('وإنما لكل', true));
  assert.equal(state.cursor, 5);
  assert.deepEqual(state.revealed, [false, false, false, true, true, false, false, false]);
  await act(async () => state.seek(-1));
  assert.equal(state.cursor, 5);
  assert.equal(state.listening, true);
});

test('final ASR mismatch stops at the expected word and correction resumes without skipping', async () => {
  await act(async () => state.start());
  const first=FakeRecognition.latest;
  await act(async () => first.emit('إنما الأقوال بالنيات وإنما',true));
  assert.equal(state.mismatchIndex,1);
  assert.equal(state.listening,false);
  assert.equal(first.aborted,true);
  assert.deepEqual(state.revealed,[true,false,false,false,false,false,false,false]);
  await act(async () => state.start());
  await act(async () => FakeRecognition.latest.emit('الأعمال بالنيات',true));
  assert.equal(state.mismatchIndex,null);
  assert.deepEqual(state.revealed,[true,true,true,false,false,false,false,false]);
});

// These are deterministic event tests, not recordings or browser ASR accuracy evidence.
test('interior omission stops at the missing word; repeated correction and stale results cannot skip it', async () => {
  await act(async () => state.start());
  const first = FakeRecognition.latest;
  const stale = first.onresult!;
  await act(async () => first.emit('إنما بالنيات وإنما', true));
  assert.equal(state.mismatchIndex, 1);
  assert.equal(first.aborted, true);
  assert.equal(state.revealed.filter(Boolean).length, 1);
  await act(async () => state.start());
  await act(async () => FakeRecognition.latest.emit('بالنيات', true));
  assert.equal(state.mismatchIndex, 1);
  assert.equal(state.revealed.filter(Boolean).length, 1);
  await act(async () => state.start());
  await act(async () => stale({ results: [{ isFinal: true, 0: { transcript: reference } }] }));
  assert.equal(state.revealed.filter(Boolean).length, 1);
  await act(async () => FakeRecognition.latest.emit('الأعمال بالنيات وإنما لكل امرئ ما نوى', true));
  assert.equal(state.mismatchIndex, null);
  assert.equal(state.revealed.every(Boolean), true);
  assert.equal(state.listening, false);
});

test('unfinished speech and natural silence do not assert a missing suffix', async () => {
  await act(async () => state.start());
  await act(async () => FakeRecognition.latest.emit('إنما الأعمال', true));
  await act(async () => FakeRecognition.latest.onend?.());
  assert.equal(state.mismatchIndex, null);
  assert.equal(state.revealed.filter(Boolean).length, 2);
  await act(async () => state.start());
  await act(async () => FakeRecognition.latest.emit('بالنيات وإنما لكل امرئ ما نوى', true));
  assert.equal(state.mismatchIndex, null);
  assert.equal(state.revealed.every(Boolean), true);
});

test('revised interim substitution never becomes a red alert or a committed learner mistake', async () => {
  await act(async () => state.start());
  await act(async () => FakeRecognition.latest.emit('إنما الأقوال', false));
  assert.equal(state.mismatchIndex, null);
  assert.equal(state.listening, true);
  assert.equal(state.revealed.some(Boolean), false);
  await act(async () => FakeRecognition.latest.emit(reference, true));
  assert.equal(state.mismatchIndex, null);
  assert.equal(state.revealed.every(Boolean), true);
});

test('cumulative final results and an interim correction preserve the committed prefix', async () => {
  await act(async () => state.start());
  await act(async () => FakeRecognition.latest.emit('إنما الأعمال', true));
  const prefix = { isFinal: true, 0: { transcript: 'إنما الأعمال' } };
  await act(async () => FakeRecognition.latest.onresult?.({ results: [
    prefix, { isFinal: false, 0: { transcript: 'بالأقوال' } },
  ] }));
  assert.equal(state.mismatchIndex, null);
  assert.equal(state.revealed.filter(Boolean).length, 2);
  await act(async () => FakeRecognition.latest.onresult?.({ results: [
    prefix, { isFinal: true, 0: { transcript: 'بالنيات وإنما لكل امرئ ما نوى' } },
  ] }));
  assert.equal(state.revealed.every(Boolean), true);
  assert.equal(state.mismatchIndex, null);
});

test('starts blank, retracts revised interim matches, commits final words and resumes without exposing the suffix', async () => {
  assert.equal(state.supported, true);
  assert.equal(state.revealed.some(Boolean), false);
  await act(async () => state.start());
  assert.equal(FakeRecognition.latest.lang, 'ar-SA');
  assert.equal(state.listening, true);
  await act(async () => FakeRecognition.latest.emit('إنما الأعمال', false));
  assert.deepEqual(state.interimIndices, [0, 1]);
  assert.equal(state.revealed.some(Boolean), false);
  await act(async () => FakeRecognition.latest.emit('إنما الأقوال', false));
  assert.deepEqual(state.interimIndices, [0]);
  await act(async () => FakeRecognition.latest.emit('إنما الأعمال بالنيات', true));
  assert.deepEqual(state.revealed, [true, true, true, false, false, false, false, false]);
  const stale = FakeRecognition.latest.onresult!;
  await act(async () => state.stop());
  assert.equal(state.listening, false);
  await act(async () => stale({ results: [{ isFinal: true, 0: { transcript: reference } }] }));
  assert.equal(state.revealed.filter(Boolean).length, 3);
  await act(async () => state.start());
  await act(async () => FakeRecognition.latest.emit('وإنما لكل امرئ', true));
  assert.equal(state.revealed.filter(Boolean).length, 6);
  assert.equal(state.revealed[6], false);
});

test('reset and manual reveal stop the microphone and cannot be overwritten by late events', async () => {
  await act(async () => state.start());
  const recognizer = FakeRecognition.latest;
  const stale = recognizer.onresult!;
  await act(async () => state.revealAll());
  assert.equal(recognizer.aborted, true);
  assert.equal(state.revealed.every(Boolean), true);
  await act(async () => state.reset());
  await act(async () => stale({ results: [{ isFinal: true, 0: { transcript: reference } }] }));
  assert.equal(state.revealed.some(Boolean), false);
  assert.equal(state.heardText, '');
});

test('permission denial stops listening with a clear error and no automatic retry', async () => {
  await act(async () => state.start());
  const recognizer = FakeRecognition.latest;
  await act(async () => recognizer.onerror?.({ error: 'not-allowed' }));
  assert.equal(state.listening, false);
  assert.match(state.error, /الميكروفون/);
  assert.equal(FakeRecognition.latest, recognizer);
  assert.equal(recognizer.aborted, true);
});

test('alternative selection follows recognizer confidence, not expected text', async () => {
  await act(async () => state.start());
  await act(async () => FakeRecognition.latest.onresult?.({ results: [{
    isFinal: true, length: 2,
    0: { transcript: 'إنما الأقوال', confidence: 0.9 },
    1: { transcript: 'إنما الأعمال', confidence: 0.5 },
  } as any] }));
  assert.equal(state.mismatchIndex, 1);
  assert.equal(state.revealed[1], false);
  await act(async () => state.reset());
  await act(async () => state.start());
  await act(async () => FakeRecognition.latest.onresult?.({ results: [{
    isFinal: true, length: 2,
    0: { transcript: 'إنما الأقوال', confidence: 0.5 },
    1: { transcript: 'إنما الأعمال', confidence: 0.9 },
  } as any] }));
  assert.equal(state.mismatchIndex, null);
  assert.equal(state.revealed[1], true);
  assert.equal(state.revealed[2], false);
});

test('unsupported browser is explicit; unmount releases the microphone', async () => {
  await act(async () => state.start());
  const recognizer = FakeRecognition.latest;
  await act(async () => root.unmount());
  assert.equal(recognizer.aborted, true);
  assert.equal(recognizer.onresult, null);
  Object.assign(window, { SpeechRecognition: undefined });
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
  assert.equal(state.supported, false);
  await act(async () => state.start());
  assert.equal(state.listening, false);
  assert.match(state.error, /غير متاح/);
});