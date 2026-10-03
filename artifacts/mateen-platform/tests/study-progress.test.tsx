import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { state, getGetDashboardQueryKey } from './doubles/study-progress-api';

const dom = new JSDOM('<html><body></body></html>', {url:'https://test.invalid/student/study/nawawi'});
Object.assign(globalThis, {window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
Object.assign(globalThis, {
  location:dom.window.location, history:dom.window.history,
  addEventListener:dom.window.addEventListener.bind(dom.window),
  removeEventListener:dom.window.removeEventListener.bind(dom.window),
});
window.scrollTo = () => {};
const {createRoot} = await import('react-dom/client');
const {default: StudyPage} = await import('../src/pages/student/study');
after(() => dom.window.close());
const settle = () => new Promise(resolve => setTimeout(resolve, 30));

test('explicit study navigation saves position without changing completion or bookmarks, updates dashboard, and survives reopening', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const qc = new QueryClient({defaultOptions:{queries:{retry:false}}});
  qc.setQueryData(getGetDashboardQueryKey(), { lastHadith: 1 });
  let root = createRoot(container);
  try {
    await act(async () => { root.render(<QueryClientProvider client={qc}><StudyPage /></QueryClientProvider>); });
    await act(settle);
    const select = container.querySelector<HTMLSelectElement>('[data-testid="select-book-hadith"]')!;
    assert.ok(select);
    await act(async () => { select.value = '42'; select.dispatchEvent(new dom.window.Event('change', {bubbles:true})); });
    await act(settle);
    assert.deepEqual(state.writes, [{textId:'nawawi',data:{currentHadith:42,completedIds:[2],bookmarkedIds:[3]}}]);
    assert.equal(qc.getQueryState(getGetDashboardQueryKey())?.isInvalidated, true);
    const continuation = await qc.fetchQuery({queryKey:getGetDashboardQueryKey(),queryFn:async () => ({lastHadith:state.saved.currentHadith})});
    assert.equal(continuation.lastHadith,42);
    await act(async () => root.unmount());
    qc.clear();
    root = createRoot(container);
    await act(async () => root.render(<QueryClientProvider client={qc}><StudyPage /></QueryClientProvider>));
    await act(settle);
    assert.equal(container.querySelector<HTMLSelectElement>('[data-testid="select-book-hadith"]')?.value, '42');
    assert.equal(state.writes.length,1, 'reopening must not create completion or practice writes');
  } finally {
    await act(async () => root.unmount());
    qc.clear(); container.remove();
  }
});