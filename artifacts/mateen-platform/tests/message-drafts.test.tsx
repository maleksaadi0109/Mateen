import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import type { JSDOM } from 'jsdom';
import { createMessageDraftStore, draftOwner, messageDrafts } from '../src/lib/message-drafts';
import { StudentView, TeacherView, Thread } from '../src/pages/student/messages';

const dom = (globalThis as typeof globalThis & { preferencesTestDOM: JSDOM }).preferencesTestDOM;
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; dom.window.close(); });
const ownerA = draftOwner('test-student-a', 'test-session-a');
const ownerB = draftOwner('test-student-b', 'test-session-b');

test('reload restores text and requestId, isolated by account, session, role, and conversation', () => {
  const storage = window.sessionStorage;
  storage.clear();
  const store = createMessageDraftStore(() => storage);
  store.claim(ownerA);
  store.write(ownerA, 'student/conversation-a', 'مسودة خاصة');
  store.write(ownerA, 'student/conversation-b', 'مسودة أخرى');
  const sent = store.read(ownerA, 'student/conversation-a');
  assert.equal(store.read(ownerA, 'teacher/conversation-a').text, '');
  assert.equal(store.read(ownerB, 'student/conversation-a').text, '');
  const reload = createMessageDraftStore(() => storage);
  reload.claim(ownerA);
  assert.deepEqual(reload.read(ownerA, 'student/conversation-a'), sent);
  assert.equal(reload.read(ownerA, 'student/conversation-b').text, 'مسودة أخرى');
  const epoch = reload.generation();
  reload.write(ownerA, 'student/conversation-a', 'تعديل أحدث');
  reload.acknowledge(ownerA, 'student/conversation-a', sent.requestId, epoch);
  assert.equal(reload.read(ownerA, 'student/conversation-a').text, 'تعديل أحدث');
  reload.claim(ownerB);
  assert.equal(storage.length, 0, 'account switch removes prior account drafts');
  reload.write(ownerA, 'student/conversation-a', 'late write');
  assert.equal(storage.length, 0);
  reload.write(ownerB, 'student/conversation-a', 'الحساب الثاني');
  reload.acknowledge(ownerA, 'student/conversation-a', sent.requestId, epoch);
  assert.equal(reload.read(ownerB, 'student/conversation-a').text, 'الحساب الثاني');
  reload.claim(null);
  assert.equal(storage.length, 0, 'logout removes all message drafts');
  reload.claim(ownerA);
  assert.equal(reload.read(ownerA, 'student/conversation-a').text, '');
  reload.write(ownerA, 'student/conversation-a', 'old session');
  const newSession = draftOwner('test-student-a', 'new-session');
  reload.claim(newSession);
  assert.equal(reload.read(newSession, 'student/conversation-a').text, '');
  assert.equal(storage.length, 0);
});

test('disabled/quota storage and malformed entries are safe and explicitly reported', () => {
  const unavailable = createMessageDraftStore(() => { throw new Error('SecurityError'); });
  unavailable.claim(ownerA);
  assert.equal(unavailable.read(ownerA, 'a').saved, false);
  unavailable.write(ownerA, 'a', 'لا تفقد النص في الذاكرة');
  assert.equal(unavailable.read(ownerA, 'a').text, 'لا تفقد النص في الذاكرة');
  assert.equal(unavailable.read(ownerA, 'a').saved, false);
  unavailable.claim(null);
  unavailable.claim(ownerA);
  assert.equal(unavailable.read(ownerA, 'a').text, '');
  window.sessionStorage.clear();
  const valid = createMessageDraftStore(() => window.sessionStorage);
  valid.claim(ownerA);
  valid.write(ownerA, 'a', 'text');
  const key = window.sessionStorage.key(0)!;
  window.sessionStorage.setItem(key, '{invalid');
  const corrupt = createMessageDraftStore(() => window.sessionStorage);
  corrupt.claim(ownerA);
  assert.equal(corrupt.read(ownerA, 'a').text, '');
  assert.equal(corrupt.read(ownerA, 'a').saved, false);
  assert.equal(window.sessionStorage.length, 0);
});

test('real message UI: switching, polling, failure/retry, unmount success, teacher guards, account changes', async () => {
  window.sessionStorage.clear();
  messageDrafts.claim(ownerA);
  const writes: { url: string; text: string; requestId: string }[] = [];
  let failure = false;
  let hold: (() => void) | undefined;
  let delay = false;
  let conversationStatus = 'open';
  let referralStatus = 'awaiting_reply';
  let statusFailure = false;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (init?.method === 'POST') {
      const data = JSON.parse(String(init.body));
      writes.push({ url, ...data });
      if (delay) await new Promise<void>((resolve) => { hold = resolve; });
      if (failure) return Response.json({ error: 'Network failure' }, { status: 503 });
      return Response.json({ conversationId: 'a', id: 'test-message', role: 'teacher', content: data.text, createdAt: new Date().toISOString(), citations: [] });
    }
    if (url.endsWith('/status')) {
      if (statusFailure) return Response.json({ error: 'Status failed' }, { status: 500 });
      return Response.json({ conversationId: 'a', status: conversationStatus, referral: { status: referralStatus, teacherName: 'معلم تجريبي' } });
    }
    if (url.endsWith('/conversations')) return Response.json(['a', 'b'].map(id => ({
      id, topic: `محادثة ${id}`, status: 'open', updatedAt: new Date().toISOString(),
    })));
    if (url.includes('/teacher/referrals')) return Response.json([{
      id: 'ref-a', conversationId: 'a', question: 'سؤال تجريبي', status: 'open', reason: 'اختبار', createdAt: new Date().toISOString(),
    }]);
    if (url.endsWith('/messages')) return Response.json([]);
    throw new Error(`Unexpected request: ${url}`);
  };
  const client = new QueryClient({ defaultOptions: {
    queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity },
  } });
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root = createRoot(container);
  const el = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  const input = () => el('input-message') as HTMLTextAreaElement;
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); }); };
  const locationHook = (): [string, (to: string) => void] => ['/student/messages', () => {}];
  const render = async (child: React.ReactNode) => {
    await act(async () => root.render(<Router hook={locationHook}><QueryClientProvider client={client}>{child}</QueryClientProvider></Router>));
    await settle();
  };
  const click = async (id: string) => {
    assert.ok(el(id), `missing ${id}`);
    await act(async () => el(id).click());
    await settle();
  };
  const change = async (value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(input(), value);
      input().dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  };
  const poll = async () => { await act(async () => { await client.invalidateQueries(); }); await settle(); };
  try {
    await render(<StudentView owner={ownerA} />);
    await click('button-open-a');
    await change('مسودة أولى');
    await poll();
    assert.equal(input().value, 'مسودة أولى');
    await click('button-open-b');
    assert.equal(input().value, '');
    await change('مسودة ثانية');
    await click('button-open-a');
    assert.equal(input().value, 'مسودة أولى');
    await render(null); // leave the page
    await render(<StudentView owner={ownerA} />);
    await click('button-open-b');
    assert.equal(input().value, 'مسودة ثانية');
    await act(async () => root.unmount());
    client.clear();
    root = createRoot(container);
    await render(<StudentView owner={ownerA} />);
    await click('button-open-a');
    assert.equal(input().value, 'مسودة أولى');
    assert.equal(writes.length, 0, 'no automatic send on restore');
    failure = true;
    await click('button-send-message');
    assert.equal(input().value, 'مسودة أولى');
    const requestId = writes.at(-1)!.requestId;
    await click('button-open-a');
    await click('button-open-a');
    failure = false;
    await click('button-send-message');
    assert.equal(writes.at(-1)!.requestId, requestId, 'failed send retains idempotency ID');
    assert.equal(input().value, '');
    await click('button-open-b');
    assert.equal(input().value, 'مسودة ثانية', 'success clears only sent conversation');

    // The server may acknowledge after Thread unmounts.
    delay = true;
    await click('button-send-message');
    await click('button-open-b');
    await act(async () => hold!());
    await settle();
    delay = false;
    await click('button-open-b');
    assert.equal(input().value, '');

    await change('يبقى عند الإغلاق');
    conversationStatus = 'closed';
    await poll();
    assert.equal(input().disabled, true);
    assert.equal(input().value, 'يبقى عند الإغلاق');
    conversationStatus = 'open';
    for (const blocked of ['not_referred', 'waiting_for_teacher']) {
      referralStatus = blocked;
      await poll();
      assert.equal(input().disabled, true);
    }
    referralStatus = 'awaiting_reply';
    statusFailure = true;
    await poll();
    assert.equal(input().disabled, true);
    statusFailure = false;
    await poll();
    assert.equal(input().disabled, false);

    await render(<TeacherView owner={ownerA} />);
    await click('button-open-ref-a');
    assert.equal(input().value, '', 'student and teacher scopes differ');
    await change('مسودة المعلم');
    failure = true;
    await click('button-send-message');
    const teacherRequest = writes.at(-1)!;
    assert.equal(teacherRequest.url, '/api/mateen/teacher/referrals/ref-a/messages');
    assert.equal(input().value, 'مسودة المعلم');
    failure = false;
    await click('button-open-ref-a');
    await click('button-open-ref-a');
    await click('button-send-message');
    assert.equal(writes.at(-1)!.requestId, teacherRequest.requestId);
    assert.equal(input().value, '');
    await render(<Thread owner={ownerA} conversationId="a" teacher />);
    assert.equal(input().disabled, true, 'teacher cannot fall through to student endpoint without referral');
    await render(<Thread owner={ownerA} conversationId="a" referralId="ref-a" referralClosed teacher />);
    assert.equal(input().disabled, true);

    await render(<Thread key="student-a" owner={ownerA} conversationId="a" teacher={false} />);
    await change('مسودة الحساب الأول');
    delay = true;
    await click('button-send-message');
    await act(async () => messageDrafts.claim(ownerB));
    await render(<Thread key="student-b" owner={ownerB} conversationId="a" teacher={false} />);
    assert.equal(input().value, '');
    await change('مسودة الحساب الثاني');
    await act(async () => hold!());
    await settle();
    assert.equal(input().value, 'مسودة الحساب الثاني', 'old acknowledgement cannot clear new account');
    await act(async () => messageDrafts.claim(null));
    assert.equal(input().value, '', 'logout clears mounted draft immediately');
    await act(async () => messageDrafts.claim(ownerA));
    await render(<Thread key="return-a" owner={ownerA} conversationId="a" teacher={false} />);
    assert.equal(input().value, '');
  } finally {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
    messageDrafts.claim(null);
  }
});