import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { beforeEach, afterEach, after, test } from 'node:test';
import type { JSDOM } from 'jsdom';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getGetScholarlyCollationQueryKey, useGetScholarlyCollation } from '@workspace/api-client-react';
import type { ScholarlyCollation } from '@workspace/api-client-react';
import CollationImage from '../src/components/scholarly/CollationImage';

const dom = (globalThis as typeof globalThis & { geometryTestDOM: JSDOM }).geometryTestDOM;
const { createRoot } = await import('react-dom/client');
const sourceId = '0907ac81-af03-4d10-a479-48dc22141bf3';
const passageId = '0807ac81-af03-4d10-a479-48dc22141bf3';
const bytes = 'isolated image fixture';
const sha = createHash('sha256').update(bytes).digest('hex');
const nativeFetch = globalThis.fetch;
const nativeCreate = URL.createObjectURL;
const nativeRevoke = URL.revokeObjectURL;
let client: QueryClient;
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
let entry: ScholarlyCollation;
let posts: any[];
let imageResponse: () => Response;
let historyResponse: (url: string) => Response;
let historyRequests: string[];
let writeResponse: ((body: any) => Response) | undefined;
let revoked: string[];
const el = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
async function settle(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  assert.ok(check(), container.textContent ?? 'UI did not settle');
}
async function clickText(text: string) {
  const b = [...container.querySelectorAll('button')].find(x => x.textContent === text);
  assert.ok(b, text); await act(async () => b.click());
}
async function change(id: string, value: string) {
  const node = el(id)! as HTMLInputElement;
  const prototype = node.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype :
    node.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(node, value);
    node.dispatchEvent(new dom.window.Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
function Viewer() {
  const q = useGetScholarlyCollation(sourceId, { query: { retry: false, staleTime: Infinity } });
  return q.data ? <CollationImage sourceId={sourceId} entry={q.data[0]} /> : null;
}
beforeEach(async () => {
  entry = {
    passageId, originalText: 'نص أصلي محدود', originalTextSha256: 'b'.repeat(64),
    imageSha256: sha, imageAvailable: true, geometry: [],
    geometryStates: ['first', 'second'].map(excerptId => ({ excerptId, revision: null, current: null })),
    correctedDraft: null, exclusionReason: 'بقية الصفحة مستبعدة', viewerPage: 5, pdfPage: 5,
    printedPage: '٥', limitations: [], paginationNote: 'صفحة خاصة',
    excerpts: ['first', 'second'].map(id => ({ id, originalText: `مقتطف ${id}`, correctedText: 'مسودة',
      originalStart: 4, originalEnd: 8, location: 'موضع وصفي', difference: 'فرق', scope: 'المقتطف فقط' })),
  };
  posts = []; revoked = []; writeResponse = undefined;
  imageResponse = () => new Response(new Blob([bytes], { type: 'image/png' }));
  historyResponse = () => Response.json([]);
  historyRequests = [];
  URL.createObjectURL = () => 'blob:private-test';
  URL.revokeObjectURL = url => { revoked.push(url); };
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/image')) return imageResponse();
    if (String(url).includes('/geometry/history/')) {
      historyRequests.push(String(url)); return historyResponse(String(url));
    }
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)); posts.push(body);
      if (writeResponse) return writeResponse(body);
      const saved = { ...body, method: 'manual_visual' as const, recordedAt: new Date().toISOString() };
      entry = { ...entry, geometry: [...entry.geometry.filter(g => g.excerptId !== body.excerptId), ...(body.rectangles.length ? [saved] : [])],
        geometryStates: entry.geometryStates.map(s => s.excerptId === body.excerptId
          ? { excerptId: s.excerptId, revision: 'c'.repeat(64), current: saved } : s) };
      return Response.json(saved);
    }
    return Response.json([entry]);
  };
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  client.setQueryData(getGetScholarlyCollationQueryKey(sourceId), [entry]);
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<QueryClientProvider client={client}><Viewer /></QueryClientProvider>));
  await settle(() => !!el(`img-collation-${passageId}`));
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); });
after(() => {
  globalThis.fetch = nativeFetch; URL.createObjectURL = nativeCreate; URL.revokeObjectURL = nativeRevoke; dom.window.close();
});

async function draft() {
  await clickText('توثيق الحدود يدويًا');
  for (const [key, val] of Object.entries({ x: '10', y: '20', width: '50', height: '15' })) await change(`input-geometry-${key}`, val);
  await change('input-geometry-note', 'راجعت هذه الحدود بصريًا للمقتطف فقط');
}
test('explicit human confirmation, exact fingerprints, visible persistence and selected-excerpt scope', async () => {
  assert.equal(el('geometry-verified'), null);
  await draft();
  const save = el('button-save-geometry') as HTMLButtonElement;
  assert.equal(save.disabled, true);
  assert.ok(el('geometry-draft'));
  await act(async () => el('checkbox-geometry-confirm')!.click());
  assert.equal(save.disabled, false);
  await act(async () => save.click());
  await settle(() => !!el('geometry-verified'));
  assert.deepEqual(posts[0], {
    excerptId: 'first', imageSha256: sha, originalTextSha256: 'b'.repeat(64),
    rectangles: [{ x: 0.1, y: 0.2, width: 0.5, height: 0.15 }],
    note: 'راجعت هذه الحدود بصريًا للمقتطف فقط', manuallyVerified: true,
    expectedRevision: null,
  });
  assert.equal(el('geometry-verified')!.style.left, '10%');
  await change('select-geometry-excerpt', 'second');
  assert.equal(el('geometry-verified'), null);
  assert.ok(container.textContent?.includes('لا حدود صورة موثقة'));
  await change('select-geometry-excerpt', 'first');
  assert.ok(el('geometry-verified'));
  await clickText('تعديل الحدود أو سحبها');
  await change('input-geometry-note', 'سحب الحدود بعد إعادة فحص الدليل');
  await act(async () => el('checkbox-geometry-confirm')!.click());
  await act(async () => el('button-revoke-geometry')!.click());
  await settle(() => posts.length === 2 && !el('geometry-verified') && !el('button-revoke-geometry'));
  assert.deepEqual(posts[1].rectangles, []);
  assert.equal(posts[1].expectedRevision, 'c'.repeat(64));
  assert.ok(container.textContent?.includes('بقية الصفحة مستبعدة'));
});
for (const revoked of [false, true]) {
  test(`conflict displays latest ${revoked ? 'revocation' : 'bounds'} while preserving the draft and requiring explicit acknowledgement`, async () => {
    await draft();
    const current = {
      excerptId: 'first', imageSha256: sha, originalTextSha256: 'b'.repeat(64),
      rectangles: revoked ? [] : [{ x: 0.3, y: 0.4, width: 0.1, height: 0.1 }],
      note: 'توثيق أحدث من مراجع آخر', method: 'manual_visual' as const, recordedAt: new Date().toISOString(),
    };
    const latest = { excerptId: 'first', revision: 'd'.repeat(64), current };
    // Refetch has newer data before save; the editor must still send its opening token.
    entry = { ...entry, geometryStates: [latest, entry.geometryStates[1]],
      geometry: revoked ? [] : [current] };
    await act(async () => { client.setQueryData(getGetScholarlyCollationQueryKey(sourceId), [entry]); });
    writeResponse = () => Response.json({ error: 'Conflict', code: 'geometry_conflict', state: latest }, { status: 409 });
    await act(async () => el('checkbox-geometry-confirm')!.click());
    await act(async () => el('button-save-geometry')!.click());
    await settle(() => !!el('geometry-conflict'));
    assert.equal(posts[0].expectedRevision, null);
    assert.equal((el('input-geometry-note') as HTMLTextAreaElement).value, 'راجعت هذه الحدود بصريًا للمقتطف فقط');
    assert.equal((el('input-geometry-width') as HTMLInputElement).value, '50');
    assert.equal(el('geometry-draft')!.style.left, '10%');
    assert.ok(container.textContent?.includes(current.note));
    assert.equal(!!el('geometry-conflict-current'), !revoked);
    assert.equal((el('button-save-geometry') as HTMLButtonElement).disabled, true);
    assert.equal((el('checkbox-geometry-confirm') as HTMLInputElement).checked, false);
    await act(async () => el('button-acknowledge-geometry-conflict')!.click());
    assert.equal((el('button-save-geometry') as HTMLButtonElement).disabled, true);
    writeResponse = undefined;
    await act(async () => el('checkbox-geometry-confirm')!.click());
    await act(async () => el('button-save-geometry')!.click());
    await settle(() => posts.length === 2 && !!el('geometry-verified') && !el('geometry-conflict'));
    assert.equal(posts[1].expectedRevision, latest.revision);
    assert.deepEqual(posts[1].rectangles, posts[0].rectangles);
  });
}
test('invalid and whole-page drafts cannot be saved even with confirmation; edits reset confirmation', async () => {
  await draft();
  await act(async () => el('checkbox-geometry-confirm')!.click());
  await change('input-geometry-width', '95');
  assert.equal((el('checkbox-geometry-confirm') as HTMLInputElement).checked, false);
  await act(async () => el('checkbox-geometry-confirm')!.click());
  assert.equal((el('button-save-geometry') as HTMLButtonElement).disabled, true);
  for (const [k, v] of Object.entries({ x: '0', y: '0', width: '100', height: '100' })) await change(`input-geometry-${k}`, v);
  await act(async () => el('checkbox-geometry-confirm')!.click());
  assert.equal((el('button-save-geometry') as HTMLButtonElement).disabled, true);
  assert.equal(posts.length, 0);
});
test('changed image bytes and forbidden writes hide evidence, not a fabricated successful overlay', async () => {
  await draft();
  writeResponse = () => Response.json({ error: 'Forbidden' }, { status: 403 });
  await act(async () => el('checkbox-geometry-confirm')!.click());
  await act(async () => el('button-save-geometry')!.click());
  await settle(() => !!container.textContent?.includes('انتهت صلاحية'));
  assert.equal(el('geometry-verified'), null);
  assert.equal(el(`img-collation-${passageId}`), null);
  imageResponse = () => new Response(new Blob(['changed bytes']));
  await clickText('إعادة المحاولة');
  await settle(() => !!container.textContent?.includes('تعذر تحميل صورة مطابقة'));
  assert.equal(el(`img-collation-${passageId}`), null);
  assert.ok(revoked.includes('blob:private-test'));
});
test('manual dragging measures the rendered image, including zoom, and keeps separate bounded parts', async () => {
  await clickText('توثيق الحدود يدويًا');
  await clickText('تكبير الصورة لفحص الحروف');
  const image = el(`img-collation-${passageId}`)!;
  const surface = image.parentElement!;
  Object.assign(surface, {
    getBoundingClientRect: () => ({ left: 100, top: 200, width: 1000, height: 2000 }),
    setPointerCapture() {},
  });
  async function pointer(type: string, clientX: number, clientY: number) {
    const e = new dom.window.Event(type, { bubbles: true });
    Object.assign(e, { button: 0, pointerId: 1, clientX, clientY });
    await act(async () => surface.dispatchEvent(e));
  }
  // Reverse-direction drag uses normalized coordinates of the zoomed image.
  await pointer('pointerdown', 700, 900);
  await pointer('pointermove', 200, 600);
  await pointer('pointerup', 200, 600);
  assert.equal(el('geometry-draft')!.style.left, '10%');
  assert.equal(el('geometry-draft')!.style.top, '20%');
  await clickText('إضافة جزء آخر من المقتطف');
  for (const [k, v] of Object.entries({ x: '20', y: '40', width: '10', height: '5' })) await change(`input-geometry-${k}`, v);
  assert.equal(container.querySelectorAll('[data-testid="geometry-draft"]').length, 2);
  await change('input-geometry-note', 'فحص يدوي لجزأين منفصلين فقط');
  await act(async () => el('checkbox-geometry-confirm')!.click());
  await act(async () => el('button-save-geometry')!.click());
  await settle(() => !!el('geometry-verified'));
  assert.equal(posts[0].rectangles.length, 2);
  assert.ok(Math.abs(posts[0].rectangles[0].height - 0.15) < 0.00001);
  assert.deepEqual(posts[0].rectangles[1], { x: 0.2, y: 0.4, width: 0.1, height: 0.05 });
});

function historicalSnapshot(imageMatches = true) {
  return { excerptId: 'first', imageSha256: imageMatches ? sha : 'a'.repeat(64),
    originalTextSha256: 'b'.repeat(64), excerptSha256: 'c'.repeat(64),
    rectangles: [{ x: 0.1, y: 0.2, width: 0.5, height: 0.15 }],
    note: 'حدود تاريخية فقط', method: 'manual_visual',
    recordedAt: '2026-10-01T10:00:00Z', imageMatches, textMatches: true };
}
test('selected excerpt history exposes actor, reason and before/after; historical previews never revive revoked geometry', async () => {
  const before = historicalSnapshot();
  historyResponse = url => Response.json(url.endsWith('/first') ? [{
    id: '1407ac81-af03-4d10-a479-48dc22141bf3', actorId: 'reviewer-A',
    createdAt: '2026-10-02T12:00:00Z', reason: 'سحب التوثيق بعد فحص حدود المقتطف',
    change: 'revoked', before, after: { ...before, rectangles: [] },
  }] : []);
  assert.equal(historyRequests.length, 0);
  await clickText('عرض تاريخ الحدود');
  await settle(() => !!container.textContent?.includes('reviewer-A'));
  assert.ok(container.textContent?.includes('سحب التوثيق بعد فحص حدود المقتطف'));
  assert.ok(container.textContent?.includes('x=0.1, y=0.2, width=0.5, height=0.15'));
  assert.ok(container.textContent?.includes('حدود فارغة — سحب التظليل'));
  await clickText('معاينة الحدود السابقة كتظليل تاريخي');
  assert.ok(el('geometry-historical'));
  assert.equal(el('geometry-historical')!.style.left, '10%');
  assert.equal(el('geometry-verified'), null);
  assert.ok(container.textContent?.includes('تظليل تاريخي غير نافذ'));
  assert.equal(posts.length, 0);
  await change('select-geometry-excerpt', 'second');
  await settle(() => !!container.textContent?.includes('لا تعديلات مسجلة'));
  assert.equal(el('geometry-historical'), null);
  assert.ok(historyRequests.some(url => url.endsWith('/second')));
  assert.equal(el('geometry-verified'), null);
});
test('mismatched historical image cannot be overlaid and permission loss clears the evidence', async () => {
  historyResponse = () => Response.json([{
    id: '1407ac81-af03-4d10-a479-48dc22141bf3', actorId: 'reviewer-B',
    createdAt: '2026-10-02T12:00:00Z', reason: 'دليل قديم مختلف الصورة',
    change: 'recorded', before: null, after: historicalSnapshot(false),
  }]);
  await clickText('عرض تاريخ الحدود');
  await settle(() => !!container.textContent?.includes('reviewer-B'));
  const button = [...container.querySelectorAll('button')].find(x => x.textContent === 'معاينة الحدود اللاحقة كتظليل تاريخي')!;
  assert.equal(button.disabled, true);
  await act(async () => button.click());
  assert.equal(el('geometry-historical'), null);
  assert.ok(container.textContent?.includes('المعاينة ممنوعة'));
  historyResponse = () => Response.json({ error: 'Forbidden' }, { status: 403 });
  await clickText('تحديث السجل');
  await settle(() => !!container.textContent?.includes('انتهت صلاحية المراجعة'));
  assert.equal(el(`img-collation-${passageId}`), null);
  assert.equal(el('geometry-history-preview'), null);
});
