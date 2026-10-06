import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PreparedSourceImport from '../src/components/scholarly/PreparedSourceImport';
import { identity } from './doubles/preview-auth';

const dom = new JSDOM('<html><body></body></html>', { url: 'https://import-test.invalid' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
  HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import('react-dom/client');
const nativeFetch = globalThis.fetch;
let client: QueryClient;
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
let calls: unknown[];
let transport: () => Promise<Response>;
let invalidations: unknown[];
const manifest = {
  title: 'شرح الأربعين النووية', passageCount: 461, version: 'fixture',
  sourceUrl: 'https://aljam3.com/3190/7673/7',
  authorizationStatement: 'إفادة صاحب المشروع كما هي',
  warnings: ['تفريغ الموقع يتضمن أخطاء نصية', 'رقم الموقع ليس رقم الصفحة المطبوعة'],
};
const result = (duplicate = false) => Response.json({
  sourceId: '0907ac81-af03-4d10-a479-48dc22141bf3',
  outcome: duplicate ? 'already_imported' : 'imported',
  totalCount: 461, importedCount: duplicate ? 0 : 461, existingCount: duplicate ? 461 : 0,
});
const el = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const button = () => el('button-import-prepared') as HTMLButtonElement;
async function settle(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
  assert.ok(check(), container.textContent ?? 'UI did not settle');
}
async function render() {
  await act(async () => {
    root.render(<QueryClientProvider client={client}><PreparedSourceImport /></QueryClientProvider>);
  });
}
async function click(id: string) { await act(async () => el(id).click()); }
beforeEach(async () => {
  Object.assign(identity, { isLoaded: true, isSignedIn: true, userId: 'a', sessionId: 'a' });
  calls = []; invalidations = [];
  transport = async () => result();
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), '/api/mateen/admin/scholarly/imports/aljam3');
    if (init?.method === 'POST') {
      calls.push(JSON.parse(String(init.body)));
      return transport();
    }
    return Response.json(manifest);
  };
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  const invalidate = client.invalidateQueries.bind(client);
  client.invalidateQueries = ((options: any) => { invalidations.push(options.queryKey); return invalidate(options); }) as typeof client.invalidateQueries;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await render();
  await settle(() => !!el('button-import-prepared'));
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear(); container.remove();
});
after(() => { globalThis.fetch = nativeFetch; dom.window.close(); });

test('confirmation, pending guard, exact contract, counts and source/audit refresh', async () => {
  assert.equal(button().disabled, true);
  assert.ok(container.textContent?.includes(manifest.authorizationStatement));
  assert.ok(container.textContent?.includes(manifest.warnings[0]));
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  transport = async () => { await waiting; return result(); };
  await click('confirm-prepared-import');
  await click('button-import-prepared');
  await settle(() => button().disabled);
  await click('button-import-prepared');
  assert.deepEqual(calls, [{ confirmUnreviewed: true }]);
  await act(async () => release());
  await settle(() => !!el('prepared-import-result'));
  assert.match(el('prepared-import-result').textContent!, /نجح الاستيراد/);
  assert.match(el('prepared-import-result').textContent!, /٤٦١/);
  assert.equal(invalidations.length, 2);
});

test('connection failure reports uncertain delivery; explicit retry returns duplicate result', async () => {
  transport = async () => { throw new TypeError('Network disconnected'); };
  await click('confirm-prepared-import');
  await click('button-import-prepared');
  await settle(() => !!container.querySelector('[role="alert"]'));
  assert.match(container.textContent!, /قد يكون الحفظ قد اكتمل/);
  assert.equal(calls.length, 1);
  assert.equal(el('prepared-import-result'), null);
  transport = async () => result(true);
  await click('button-import-prepared');
  await settle(() => !!el('prepared-import-result'));
  assert.equal(calls.length, 2);
  assert.match(el('prepared-import-result').textContent!, /مستوردة سابقًا/);
  assert.match(el('prepared-import-result').textContent!, /أُضيف الآن: ٠/);
});

test('authorization failure is actionable; changing sessions erases the confirmation and report', async () => {
  transport = async () => Response.json({ error: 'Forbidden' }, { status: 403 });
  await click('confirm-prepared-import');
  await click('button-import-prepared');
  await settle(() => !!container.querySelector('[role="alert"]'));
  assert.match(container.textContent!, /جلسة إدارة مؤمّنة/);
  Object.assign(identity, { userId: 'b', sessionId: 'b' });
  await render();
  await settle(() => !!el('button-import-prepared'));
  assert.equal(button().disabled, true);
  assert.equal(container.querySelector('[role="alert"]'), null);
  assert.equal(el('prepared-import-result'), null);
});
