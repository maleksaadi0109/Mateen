import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { JSDOM } from 'jsdom';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getGetProfileQueryKey, useGetProfile, useSaveProfile, type Profile } from '@workspace/api-client-react';

const dom = (globalThis as typeof globalThis & { preferencesTestDOM: JSDOM }).preferencesTestDOM;
const { createRoot } = await import('react-dom/client');
const { default: Preferences } = await import('../src/components/mateen/learning-preferences-settings');
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; dom.window.close(); });

test('real profile hooks save, reload, retain failed drafts, retry, and confirm deletion', async () => {
  let stored: Profile = { id: 'student-test', name: 'الاسم المحفوظ', role: 'student', onboarded: true, learningPreferences: null };
  const writes: unknown[] = [];
  let fail = false;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/mateen/profile', 'no progress or grading endpoint may be called');
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      writes.push(body);
      if (fail) { fail = false; return Response.json({ error: 'Unavailable' }, { status: 500 }); }
      stored = { ...stored, ...body };
    }
    return Response.json(stored);
  };
  const client = new QueryClient({ defaultOptions: {
    queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity },
  } });
  function Harness() {
    const profile = useGetProfile();
    const save = useSaveProfile();
    return profile.data ? <Preferences profile={profile.data} save={save} onSaved={(updated) => {
      client.setQueryData(getGetProfileQueryKey(), updated);
      client.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    }} /> : null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root = createRoot(container);
  const el = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); };
  const click = async (id: string) => { assert.ok(el(id), `missing ${id}`); await act(async () => el(id).click()); await settle(); };
  const change = async (id: string, value: string) => {
    const node = el(id) as HTMLInputElement;
    const prototype = node.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype
      : node.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(node, value);
      node.dispatchEvent(new dom.window.Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    });
  };
  const render = async () => { await act(async () => root.render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)); await settle(); };
  const reload = async () => {
    await act(async () => root.unmount()); client.clear();
    root = createRoot(container); await render();
  };
  try {
    await render();
    assert.ok(el('learning-preferences-empty'));
    await click('button-edit-learning');
    await change('input-learning-age', '25');
    await change('input-learning-memorized', '  أجزاء من القرآن  ');
    await change('select-learning-goal', 'review');
    await change('select-learning-minutes', '30');
    await click('button-save-learning');
    assert.deepEqual(writes[0], { name: 'الاسم المحفوظ', role: 'student',
      learningPreferences: { age: 25, memorized: 'أجزاء من القرآن', goal: 'review', dailyMinutes: 30 } });
    await reload();
    assert.match(el('learning-preferences-summary').textContent!, /أجزاء من القرآن/);
    await click('button-edit-learning');
    await change('input-learning-age', '121');
    assert.equal((el('button-save-learning') as HTMLButtonElement).disabled, true);
    await change('input-learning-age', '');
    await change('input-learning-memorized', '  ');
    assert.equal((el('button-save-learning') as HTMLButtonElement).disabled, true);
    await change('input-learning-memorized', 'لم أحفظ شيئاً بعد');
    await change('select-learning-goal', 'both');
    await change('select-learning-minutes', '45');
    fail = true;
    await click('button-save-learning');
    assert.match(container.textContent!, /تعذّر حفظ التفضيلات/);
    assert.equal((el('select-learning-minutes') as HTMLSelectElement).value, '45');
    assert.equal(stored.learningPreferences?.dailyMinutes, 30);
    await click('button-save-learning');
    await reload();
    assert.match(el('learning-preferences-summary').textContent!, /لم يُذكر/);
    assert.equal(stored.learningPreferences?.dailyMinutes, 45);
    const beforeDelete = writes.length;
    await click('button-delete-learning');
    assert.equal(writes.length, beforeDelete);
    await click('button-cancel-delete-learning');
    assert.equal(writes.length, beforeDelete);
    fail = true;
    await click('button-delete-learning');
    await click('button-confirm-delete-learning');
    assert.match(container.textContent!, /تعذّر حذف الإجابات/);
    assert.ok(stored.learningPreferences);
    await click('button-delete-learning');
    await click('button-confirm-delete-learning');
    await reload();
    assert.equal(stored.learningPreferences, null);
    assert.ok(el('learning-preferences-empty'));
    assert.equal(stored.name, 'الاسم المحفوظ');
    assert.equal(stored.role, 'student');
  } finally {
    await act(async () => root.unmount()); client.clear(); container.remove();
  }
});