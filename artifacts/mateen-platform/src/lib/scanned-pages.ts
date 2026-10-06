import { tr } from './i18n';
import type { RecitationPages, RecitationPageRegion } from '@workspace/api-client-react';

export type ScannedGate =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'rights_pending'; message: string }
  | { kind: 'mapping_pending'; message: string }
  | { kind: 'mismatch' }
  | { kind: 'invalid' }
  | { kind: 'ready'; data: RecitationPages };

/** Decide whether scanned pages may be shown. Only an exact text match with
 * well-formed geometry unlocks image requests; everything else keeps typeset practice. */
export function scannedGate(
  input: { enabled: boolean; isLoading: boolean; isError: boolean; data?: RecitationPages },
  text: string,
  wordCount: number,
): ScannedGate {
  if (!input.enabled) return { kind: 'idle' };
  if (input.isLoading) return { kind: 'loading' };
  if (input.isError || !input.data) return { kind: 'error' };
  const d = input.data;
  if (d.status === 'rights_pending') return { kind: 'rights_pending', message: d.message };
  if (d.status === 'mapping_pending') return { kind: 'mapping_pending', message: d.message };
  if (d.status !== 'available') return { kind: 'invalid' };
  if (d.text !== text) return { kind: 'mismatch' };
  const pages = new Set(d.pages.map((p) => p.page));
  const okPages = d.pages.length > 0 && pages.size === d.pages.length &&
    d.pages.every((p) => Number.isFinite(p.width) && Number.isFinite(p.height) && p.width > 0 && p.height > 0 && !!p.imageUrl);
  const okRegions = d.regions.length > 0 && d.regions.every((r) => {
    const p = d.pages.find(p => p.page === r.page);
    return !!p && [r.x, r.y, r.width, r.height].every(Number.isFinite) &&
      r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0 &&
      r.x + r.width <= p.width && r.y + r.height <= p.height &&
      r.wordIndices.length > 0 && r.wordIndices.every((i) => Number.isInteger(i) && i >= 0 && i < wordCount);
  });
  const h=d.heading;
  const hp=h && d.pages.find(p=>p.page===h.page);
  const okHeading=!h || (!!hp && [h.x,h.y,h.width,h.height].every(Number.isFinite) &&
    h.x>=0 && h.y>=0 && h.width>0 && h.height>0 && h.x+h.width<=hp.width && h.y+h.height<=hp.height);
  if (!okPages || !okRegions || !okHeading) return { kind: 'invalid' };
  return { kind: 'ready', data: d };
}

/** A region is visible only when every word in it is finally revealed. Interim never counts. */
export function regionVisible(region: RecitationPageRegion, revealed: boolean[]): boolean {
  return region.wordIndices.length > 0 && region.wordIndices.every((i) => revealed[i] === true);
}

export function visibleRegions(regions: RecitationPageRegion[], revealed: boolean[], page?: number) {
  return regions.filter((r) => (page === undefined || r.page === page) && regionVisible(r, revealed));
}

export const GATE_MESSAGES: Record<Exclude<ScannedGate['kind'], 'ready' | 'idle'>, string> = {
  get loading() { return tr("جارٍ التحقق من توفر صفحات الكتاب المصوّرة…"); },
  get error() { return tr("تعذّر التحقق من صفحات الكتاب المصوّرة. تستمر صفحة التسميع النصية كما هي."); },
  get rights_pending() { return tr("صفحات الكتاب المصوّرة بانتظار استيفاء حقوق الاستخدام. تستمر صفحة التسميع النصية كما هي."); },
  get mapping_pending() { return tr("لم تكتمل مطابقة كلمات هذا الحديث على الصفحات المصوّرة بعد. تستمر صفحة التسميع النصية كما هي."); },
  get mismatch() { return tr("نص الصفحات المصوّرة لا يطابق نص التسميع حرفياً، فلم نعرضها احتياطاً. تستمر صفحة التسميع النصية."); },
  get invalid() { return tr("بيانات الصفحات المصوّرة غير مكتملة، فلم نعرضها. تستمر صفحة التسميع النصية."); },
};
