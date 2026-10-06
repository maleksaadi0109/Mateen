import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { state, emit } from './doubles/review-auth';
import { reviewReturn, reviewSignIn } from '../src/lib/review-return';

const dom = new JSDOM('<html dir="rtl"><body></body></html>', { url: 'https://test.invalid/admin/teachers' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, location: dom.window.location,
  history: dom.window.history, IS_REACT_ACT_ENVIRONMENT: true,
  addEventListener: dom.window.addEventListener.bind(dom.window),
  removeEventListener: dom.window.removeEventListener.bind(dom.window) });
const { createRoot } = await import('react-dom/client');
const { default: Teachers } = await import('../src/pages/admin/teachers');
const { AdminGate } = await import('../src/components/admin/AdminGate');
after(() => dom.window.close());
globalThis.fetch = async (input) => {
  const url = String(input); state.requests.push(url);
  if (url.includes('/review-access')) return Response.json(state.access);
  if (url.includes('/profile')) return Response.json({ id: 'fixture-reviewer', role: 'student', name: 'Fixture' });
  if (url.includes('/admin/teachers')) {
    if (state.queue === 'error') return Response.json({ error: 'fixture queue failed' }, { status: 503 });
    return Response.json(state.queue === 'empty' ? [] : [{
      userId: 'fixture-applicant', name: 'معلم تجريبي', status: 'pending_review', revision: 1,
      documents: [{ id: 'fixture-pdf', name: 'fixture.pdf', status: 'clean', contentType: 'application/pdf', kind: 'qualification', size: 100 }],
      history: [],
    }]);
  }
  throw new Error(`Unexpected fixture request: ${url}`);
};
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); }); };
async function mount(content = <Teachers />) {
  const element = document.createElement('div'); document.body.appendChild(element);
  const root = createRoot(element);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await act(async () => root.render(<QueryClientProvider client={qc}>{content}</QueryClientProvider>));
  await settle();
  return { element, qc, async close() { await act(async () => root.unmount()); qc.clear(); element.remove(); } };
}
async function click(element: HTMLElement, id: string) {
  const button = element.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
  assert.ok(button, id); await act(async () => button.click()); await settle();
}
function reset(overrides = {}) {
  Object.assign(state, { signedIn: true, loaded: true, sessionId: 'fixture-session', verify: 'complete', queue: 'data', requests: [], fresh: [], signOutUrl: '', hint: null, ...overrides });
  state.access = { contentReviewer: false, qualificationReviewer: true, verifiedEmail: true, mfaEnabled: false, secureSession: false };
}
test('ordinary reviewer sessions directly mount queue, PDF and decisions with or without MFA', async () => {
  for (const mfaEnabled of [false, true]) {
    reset(); state.access.mfaEnabled = mfaEnabled;
    const view = await mount();
    try {
      assert.equal(view.element.querySelector('[data-testid="state-insecure"]'), null);
      assert.equal(view.element.querySelector('[data-testid="button-review-enroll"]'), null);
      assert.equal(view.element.querySelector('[data-testid="button-review-verify"]'), null);
      assert.ok(view.element.querySelector('[data-testid="list-teacher-reviews"]'));
      assert.ok(view.element.querySelector('[data-testid="fixture-pdf-preview"]'));
      assert.ok(view.element.querySelector('[data-testid="radio-decision-approved"]'));
      assert.ok(view.element.querySelector('[data-testid="radio-decision-rejected"]'));
      assert.equal(state.hint, null);
      assert.deepEqual(state.fresh, []);
    } finally { await view.close(); }
  }
});
test('unverified email blocks private queries and can be refreshed without MFA', async () => {
  reset(); state.access.verifiedEmail = false;
  const view = await mount();
  try {
    assert.ok(view.element.querySelector('[data-testid="state-insecure"]'));
    assert.match(view.element.textContent!, /وثّق بريدك الإلكتروني/);
    assert.ok(view.element.querySelector('[data-testid="button-review-email"]'));
    assert.equal(view.element.querySelector('[data-testid="button-review-verify"]'), null);
    assert.equal(state.requests.some(url => url.includes('/admin/teachers')), false);
    state.access.verifiedEmail = true;
    await click(view.element, 'button-recheck-access');
    assert.ok(state.fresh.includes('token'));
    assert.ok(view.element.querySelector('[data-testid="list-teacher-reviews"]'));
  } finally { await view.close(); }
});
test('unauthorized, signed-out and unready states cannot mount private queries; auth events refresh immediately', async () => {
  reset(); state.access.qualificationReviewer = false;
  let view = await mount();
  try {
    assert.ok(view.element.querySelector('[data-testid="state-not-authorized"]'));
    assert.equal(state.requests.some(url => url.includes('/admin/teachers')), false);
  } finally { await view.close(); }
  for (const overrides of [{ signedIn: false }, { loaded: false }]) {
    reset(overrides); view = await mount();
    try { assert.equal(state.requests.length, 0); } finally { await view.close(); }
  }
  history.replaceState(null, '', '/admin/teachers');
  reset(); view = await mount();
  try {
    state.access.qualificationReviewer = false;
    await act(async () => emit()); await settle();
    assert.ok(view.element.querySelector('[data-testid="state-not-authorized"]'));
  } finally { await view.close(); }
});
test('empty queue and failed queue remain distinct from security denial', async () => {
  for (const queue of ['empty', 'error'] as const) {
    reset({ queue });
    const view = await mount();
    try {
      assert.equal(view.element.querySelector('[data-testid="state-insecure"]'), null);
      assert.ok(view.element.querySelector(`[data-testid="${queue === 'empty' ? 'fixture-empty' : 'fixture-error'}"]`));
    } finally { await view.close(); }
  }
});
test('shared and content admin pages use the same email policy while keeping scope separation', async () => {
  for (const need of ['any', 'content', 'qualification'] as const) {
    reset();
    state.access.contentReviewer = true;
    const view = await mount(<AdminGate need={need}>{() => <div data-testid="protected-admin">محتوى إداري</div>}</AdminGate>);
    try {
      assert.ok(view.element.querySelector('[data-testid="protected-admin"]'));
      assert.equal(view.element.querySelector('[data-testid="button-review-verify"]'), null);
    } finally { await view.close(); }
  }
  reset(); state.access.qualificationReviewer = false; state.access.contentReviewer = true;
  const view = await mount();
  try {
    assert.ok(view.element.querySelector('[data-testid="state-wrong-permission"]'));
    assert.equal(state.requests.some(url => url.includes('/admin/teachers')), false);
  } finally { await view.close(); }
});
test('replacement session cannot reuse granted access cached for the same account', async () => {
  reset(); state.access.mfaEnabled = true; state.access.secureSession = true;
  const view = await mount();
  try {
    assert.ok(view.element.querySelector('[data-testid="list-teacher-reviews"]'));
    state.requests = [];
    state.sessionId = 'replacement-session'; state.access.qualificationReviewer = false;
    await act(async () => emit()); await settle();
    assert.ok(view.element.querySelector('[data-testid="state-not-authorized"]'));
    assert.equal(view.element.querySelector('[data-testid="list-teacher-reviews"]'), null);
    assert.equal(state.requests.some(url => url.includes('/admin/teachers')), false);
  } finally { await view.close(); }
});
test('review return routes cannot redirect outside the app or nest the base path', () => {
  assert.equal(reviewReturn('//evil.invalid'), '/admin/teachers');
  assert.equal(reviewReturn('https://evil.invalid'), '/admin/teachers');
  assert.equal(reviewReturn('/student'), '/admin/teachers');
  assert.equal(reviewReturn('/admin/teachers', '/platform'), '/platform/admin/teachers');
  assert.equal(reviewSignIn('/admin/teachers', '/platform'), '/platform/sign-in?reviewReturn=%2Fadmin%2Fteachers');
});
