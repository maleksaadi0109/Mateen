import assert from 'node:assert/strict';
import { before, after, beforeEach, afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PrivatePreview from '../src/components/scholarly/PrivatePreview';
import { identity } from './doubles/preview-auth';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://preview-test.invalid' });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document,
  HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
});
// React DOM must detect the DOM only after it is installed.
const { createRoot } = await import('react-dom/client');
const nativeFetch = globalThis.fetch;
const prompt = 'سؤال اصطناعي خاص';
const answer = 'مسودة اصطناعية خاصة';
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let client: QueryClient;
let transport: () => Promise<Response>;
let requests: Array<{ url: string; method: string | undefined; body: unknown }>;
const response = () => Response.json({
  answer, model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
  reviewStatus: 'unreviewed', sourceGrounded: false, generatedAt: new Date().toISOString(),
});
const el = (testId: string) => container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
const input = () => el('input-private-preview-question') as HTMLTextAreaElement;
async function render() {
  await act(async () => {
    root.render(<QueryClientProvider client={client}><PrivatePreview /></QueryClientProvider>);
  });
}
async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(input(), value);
    input().dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
async function submit() {
  await act(async () => {
    input().closest('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  });
}
async function settle(check: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!check() && Date.now() < deadline) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  }
  assert.ok(check(), 'UI did not reach the expected state');
}
function barrier() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

before(() => {
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), '/api/mateen/admin/scholarly/preview');
    requests.push({ url: String(url), method: init?.method, body: JSON.parse(String(init?.body)) });
    return transport();
  };
});
beforeEach(async () => {
  Object.assign(identity, { isLoaded: true, isSignedIn: true, userId: 'synthetic-reviewer-a', sessionId: 'synthetic-session-a' });
  requests = [];
  transport = async () => response();
  client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await render();
});
afterEach(async () => {
  assert.equal(dom.window.localStorage.length, 0);
  assert.equal(dom.window.sessionStorage.length, 0);
  await act(async () => root.unmount());
  client.clear();
  container.remove();
});
after(() => { globalThis.fetch = nativeFetch; dom.window.close(); });

test('real mutation sends trimmed question and displays draft with privacy and scientific warnings; clear erases it', async () => {
  assert.match(container.textContent!, /ليست إجابة معتمدة/);
  assert.match(container.textContent!, /لا تظهر للطلاب/);
  assert.match(container.textContent!, /لا تُحفظ الأسئلة أو المسودات/);
  await type(`  ${prompt}  `);
  await submit();
  await settle(() => !!el('result-private-preview'));
  assert.deepEqual(requests, [{ url: '/api/mateen/admin/scholarly/preview', method: 'POST', body: { question: prompt } }]);
  assert.ok(el('result-private-preview')!.textContent!.includes(prompt));
  assert.ok(el('result-private-preview')!.textContent!.includes(answer));
  assert.match(el('result-private-preview')!.textContent!, /لا تُحسب هذه النتيجة اجتيازاً للتقييم/);
  await act(async () => el('button-clear-private-preview')!.click());
  assert.equal(input().value, '');
  assert.equal(el('result-private-preview'), null);
});

test('invalid input is blocked and pending requests cannot be submitted twice', async () => {
  await type('ab'); await submit();
  assert.equal(requests.length, 0);
  await type('x'.repeat(2001)); await submit();
  assert.equal(requests.length, 0);
  const finish = barrier();
  transport = async () => { await finish.promise; return response(); };
  try {
    await type(prompt); await submit();
    await settle(() => requests.length === 1);
    assert.equal(input().disabled, true);
    assert.equal((el('button-generate-private-preview') as HTMLButtonElement).disabled, true);
    await submit();
    assert.equal(requests.length, 1);
  } finally { finish.release(); }
  await settle(() => !!el('result-private-preview'));
});

test('account switch, session replacement and sign-out remove displayed drafts and typed questions', async () => {
  for (const change of [
    { userId: 'synthetic-reviewer-b', sessionId: 'synthetic-session-b' },
    { sessionId: 'synthetic-session-c' },
    { isSignedIn: false },
  ]) {
    await type(prompt); await submit();
    await settle(() => !!el('result-private-preview'));
    Object.assign(identity, change);
    await render();
    assert.equal(el('result-private-preview'), null);
    assert.ok(!container.textContent!.includes(answer));
    assert.ok(!container.textContent!.includes(prompt));
    if (identity.isSignedIn) assert.equal(input().value, '');
    else assert.equal(el('private-preview'), null);
  }
});

test('late response from the previous account cannot repopulate the new account or survive remount', async () => {
  const finish = barrier(), returned = barrier();
  transport = async () => { await finish.promise; returned.release(); return response(); };
  try {
    await type(prompt); await submit();
    await settle(() => requests.length === 1);
    Object.assign(identity, { userId: 'synthetic-reviewer-b', sessionId: 'synthetic-session-b' });
    await render();
    assert.equal(input().value, '');
  } finally { finish.release(); }
  await returned.promise;
  await settle(() => client.getMutationCache().getAll().every(m => m.state.status !== 'pending'));
  assert.equal(el('result-private-preview'), null);
  assert.ok(!container.textContent!.includes(answer));
  await act(async () => root.render(<QueryClientProvider client={client}><div /></QueryClientProvider>));
  await render();
  assert.equal(input().value, '');
  assert.equal(el('result-private-preview'), null);
});

test('server denial, bad input, rate limiting and provider failures show explicit errors without old drafts', async () => {
  for (const [status, message] of [
    [401, 'انتهت الجلسة'], [403, 'انتهت الجلسة'], [400, 'اكتب سؤالاً'],
    [429, 'وصلت إلى الحد'], [503, 'تعذّر توليد المسودة'],
  ] as const) {
    transport = async () => response();
    await type(prompt); await submit();
    await settle(() => !!el('result-private-preview'));
    transport = async () => Response.json({ error: 'synthetic error' }, { status });
    await submit();
    await settle(() => !!el('error-private-preview'));
    assert.ok(el('error-private-preview')!.textContent!.includes(message));
    assert.equal(el('result-private-preview'), null);
  }
});