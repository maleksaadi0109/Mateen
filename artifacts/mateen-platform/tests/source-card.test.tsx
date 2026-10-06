import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Citation } from '@workspace/api-client-react';
import { ChatMessages } from '../src/components/scholarly/ChatMessages';
import { safeSourceUrl } from '../src/components/scholarly/shared';

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; window.close(); });
HTMLElement.prototype.scrollIntoView = () => {};
const citation: Citation = {
  passageId: '00000000-0000-4000-8000-000000000001', sourceId: '00000000-0000-4000-8000-000000000002',
  sourceTitle: 'كتاب الاختبار', author: 'مؤلف الاختبار', edition: 'طبعة الاختبار',
  volume: null, printedPage: null, pdfPage: null, viewerPage: 7,
  sourceVersion: 'v1', quote: 'نص أصلي مستقل', snapshotAt: '2026-10-01T10:00:00Z',
  sourceStatusAtAnswer: 'indexed', publicSourceUrl: 'https://aljam3.com/ar/3190/7673/7',
};
const message = { id: '00000000-0000-4000-8000-000000000003', role: 'assistant' as const,
  createdAt: '2026-10-01T10:00:00Z', answerMode: 'study' as const, text: 'شرح مولد مستقل', citations: [citation] };

async function mount(citations = [citation]) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  await act(async () => { root.render(<QueryClientProvider client={client}><ChatMessages viewer="student" messages={[{ ...message, citations }]} /></QueryClientProvider>); });
  const toggle = async (open: boolean) => {
    await act(async () => {
      const details = host.querySelector('details')!;
      details.open = open;
      details.dispatchEvent(new window.Event('toggle'));
      await new Promise(resolve => setTimeout(resolve, 25));
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
  };
  const close = async () => { await act(async () => root.unmount()); client.clear(); host.remove(); };
  return { host, toggle, close };
}

test('card separates original quotation from machine prose; refresh on reopen never rewrites historical state', async () => {
  let state = 'eligible';
  let versionChanged = false;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json([{ sourceId: citation.sourceId, state, versionChanged, checkedAt: '2026-10-05T10:00:00Z' }]);
  };
  const { host, toggle, close } = await mount();
  try {
    assert.equal(calls, 0, 'closed card does not fetch');
    assert.match(host.textContent!, /من أين جاءت الإجابة/);
    assert.match(host.textContent!, /شرح آلي غير مراجع/);
    await toggle(true);
    assert.equal(calls, 1);
    assert.equal(host.querySelector('blockquote')!.textContent, citation.quote);
    assert.ok(!host.querySelector('blockquote')!.textContent?.includes(message.text));
    assert.match(host.textContent!, /اقتباس متحقق من مطابقته للمصدر/);
    assert.match(host.textContent!, /صفحة العارض/);
    assert.ok(!host.textContent?.includes('الصفحة المطبوعة'));
    assert.ok(!host.textContent?.includes('صفحة PDF'));
    assert.ok(host.querySelector('a'));
    const snapshot = host.querySelector('[data-testid="snapshot-status-0"]')!.textContent;
    await toggle(false);
    state = 'withdrawn';
    await toggle(true);
    assert.equal(calls, 2);
    assert.match(host.textContent!, /سُحب المصدر/);
    assert.equal(host.querySelector('[data-testid="snapshot-status-0"]')!.textContent, snapshot);
    assert.equal(host.querySelector('a'), null);
    await toggle(false);
    state = 'eligible'; versionChanged = true;
    await toggle(true);
    assert.match(host.textContent!, /تغيّرت نسخة المصدر/);
    assert.equal(host.querySelector('a'), null);
    await toggle(false);
    globalThis.fetch = async () => new Response('', { status: 503 });
    await toggle(true);
    assert.match(host.textContent!, /تعذر التحقق من الحالة الحالية/);
    assert.equal(host.querySelector('a'), null);
    assert.ok(!host.querySelector('[data-testid="current-status-0"]')!.textContent?.includes('مؤهل'));
  } finally { await close(); }
});

test('legacy citations disclose missing snapshot even when source is currently eligible; empty replies have no card', async () => {
  globalThis.fetch = async () => Response.json([{ sourceId: citation.sourceId, state: 'eligible', versionChanged: null, checkedAt: '2026-10-05T10:00:00Z' }]);
  const { snapshotAt: _date, sourceStatusAtAnswer: _state, sourceVersion: _version, ...legacy } = citation;
  const a = await mount([legacy]);
  try {
    await a.toggle(true);
    assert.match(a.host.textContent!, /لا تتوفر بيانات حالة وقت الإجابة/);
    assert.equal(a.host.querySelector('a'), null);
  } finally { await a.close(); }
  const empty = await mount([]);
  try { assert.equal(empty.host.querySelector('details'), null); } finally { await empty.close(); }
});

test('unsafe links never render as published references', () => {
  for (const bad of ['javascript:alert(1)', 'https://storage.googleapis.com/private?signature=x',
    'https://aljam3.com/ar/3190/7673/5?token=x', '/api/admin/private', 'https://evil.test/private',
    'https://user:secret@turath.io/book/1', 'https://turath.io/book/1#private']) assert.equal(safeSourceUrl(bad), null);
  assert.equal(safeSourceUrl(citation.publicSourceUrl), citation.publicSourceUrl);
});
