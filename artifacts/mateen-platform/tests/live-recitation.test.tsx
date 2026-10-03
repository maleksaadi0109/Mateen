import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { useLiveRecitation } from '../src/hooks/use-live-recitation';
import { matchRecitation, recitationWords } from '../src/lib/live-recitation';

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
  assert.deepEqual(matchRecitation(words, 'إنما بالنيات وإنما').indices, [0, 2, 3]);
  assert.deepEqual(matchRecitation(words, 'شيء لا يوجد في النص').indices, []);
  assert.deepEqual(matchRecitation(recitationWords('إلى الله ورسوله فهجرته إلى الله ورسوله'), 'الله').indices, []);
  assert.equal(recitationWords('﵌').join(' '), 'صلى الله عليه وآله وسلم');
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