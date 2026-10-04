import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReaderActivity } from '../src/hooks/use-study-activity';

const dom = new JSDOM('<html><body></body></html>', { url: 'https://test.invalid', pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import('react-dom/client');
let clock = 0, focused = true, hidden = false;
Object.defineProperty(globalThis.performance, 'now', { configurable: true, value: () => clock });
Object.defineProperty(document, 'hasFocus', { value: () => focused });
Object.defineProperty(document, 'visibilityState', { get: () => hidden ? 'hidden' : 'visible' });
let props = { userId: 'a', kind: 'reading' as 'reading' | 'recitation', page: 1, attemptId: 'attempt', enabled: true, spokenWords: 0 };
let state: ReturnType<typeof useReaderActivity>;
function Harness() { state = useReaderActivity(props); return null; }
const realFetch = globalThis.fetch;
const starts: Record<string, unknown>[] = [], finishes: Record<string, unknown>[] = [];
let fail = false;
let root: ReturnType<typeof createRoot>, container: HTMLDivElement, qc: QueryClient;
const flush = () => new Promise(resolve => setTimeout(resolve, 5));
const render = async () => act(async () => { root.render(<QueryClientProvider client={qc}><Harness key={props.userId} /></QueryClientProvider>); await flush(); });
beforeEach(async () => {
  clock = 0; focused = true; hidden = false; fail = false; starts.length = 0; finishes.length = 0;
  props = { userId: 'a', kind: 'reading', page: 1, attemptId: 'attempt', enabled: true, spokenWords: 0 };
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  globalThis.fetch = async (url, init) => {
    const data = JSON.parse(init?.body as string);
    if (String(url).endsWith('/finish')) {
      finishes.push(data);
      if (fail) throw new Error('offline');
      return new Response(JSON.stringify({ timezone: 'UTC', today: '2026-10-04', currentStreak: 1, longestStreak: 1, activeDays: 1, studiedToday: true, lastStudyDay: '2026-10-04' }), { headers: { 'Content-Type': 'application/json' } });
    }
    starts.push(data);
    return new Response(JSON.stringify({ id: `session-${starts.length}`, timezone: 'UTC' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  };
  await render();
  await act(flush);
});
afterEach(async () => {
  await act(async () => root.unmount()); qc.clear(); container.remove(); globalThis.fetch = realFetch;
});
after(() => dom.window.close());

test('open, same page, short clicks and restored positions never count; genuine dwell + navigation counts once', async () => {
  assert.equal(starts.length, 1); assert.equal(finishes.length, 0);
  clock = 29000;
  await act(async () => state.navigate(2));
  assert.equal(finishes.length, 0);
  clock = 31000;
  await act(async () => state.navigate(1));
  assert.equal(finishes.length, 0);
  props.page = 2; await render(); // Programmatic restore is not a navigation event.
  assert.equal(finishes.length, 0);
  clock = 63000;
  await act(async () => { state.navigate(3); await flush(); state.navigate(3); });
  assert.equal(finishes.length, 1);
  assert.deepEqual(finishes[0], { page: 3, activeSeconds: 32, spokenWords: 0 });
  assert.equal(qc.getQueryData<{ activeDays: number }>(['study-activity', 'a'])?.activeDays, 1);
});
test('hidden/background time does not qualify and focus restarts dwell', async () => {
  clock = 20000; focused = false; hidden = true;
  await act(async () => { window.dispatchEvent(new dom.window.Event('blur')); document.dispatchEvent(new dom.window.Event('visibilitychange')); });
  clock = 90000;
  await act(async () => state.navigate(2));
  assert.equal(finishes.length, 0);
  focused = true; hidden = false;
  await act(async () => { window.dispatchEvent(new dom.window.Event('focus')); await flush(); });
  clock = 100000;
  await act(async () => state.navigate(2));
  assert.equal(finishes.length, 0);
  clock = 122000;
  await act(async () => { state.navigate(2); await flush(); });
  assert.equal(finishes.length, 1);
});
test('recitation counts new final words only, not opening mic, old words or manual reveal', async () => {
  props = { ...props, kind: 'recitation', spokenWords: 20 };
  await render();
  clock = 6000;
  props.spokenWords = 24; await render();
  assert.equal(finishes.length, 0);
  props.spokenWords = 25; await render();
  assert.equal(finishes.length, 1);
  props.enabled = false; await render();
  props.spokenWords = 99; await render();
  assert.equal(finishes.length, 1);
});
test('failed write is visible and retries identical evidence; account remount cannot reuse it', async () => {
  clock = 31000; fail = true;
  await act(async () => { state.navigate(2); await flush(); });
  assert.equal(state.error, true);
  fail = false;
  await act(async () => { state.retry(); await flush(); });
  assert.equal(state.error, false);
  assert.deepEqual(finishes[0], finishes[1]);
  props.userId = 'b'; await render();
  assert.equal(qc.getQueryData(['study-activity', 'b']), undefined);
  await act(async () => state.navigate(2));
  assert.equal(finishes.length, 2);
});