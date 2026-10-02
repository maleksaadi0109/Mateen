import type { QueryClient } from '@tanstack/react-query';
import {
  getGetCapabilitiesQueryKey, getGetReviewAccessQueryKey, getGetReviewAuditQueryKey, getGetScholarsQueryKey,
  getGetSourceReviewsQueryKey, getGetStudyTextQueryKey, getGetTeacherQueryKey, getGetTeacherReviewsQueryKey,
} from '@workspace/api-client-react';

export function errStatus(e: unknown): number | undefined {
  return typeof e === 'object' && e && 'status' in e && typeof (e as { status: unknown }).status === 'number' ? (e as { status: number }).status : undefined;
}
/** Real message from ApiError.data when the server sent one. */
export function errMsg(e: unknown, fallback = 'حدث خطأ غير متوقع.'): string {
  if (typeof e === 'object' && e) {
    const d = (e as { data?: unknown }).data;
    if (d && typeof d === 'object') {
      const o = d as Record<string, unknown>;
      for (const k of ['message', 'error', 'detail', 'reason']) if (typeof o[k] === 'string' && o[k]) return o[k] as string;
    }
    if (typeof d === 'string' && d) return d;
    if (e instanceof Error && e.message) return e.message;
  }
  return fallback;
}
export function invalidateReviewData(qc: QueryClient) {
  const keys = [
    getGetTeacherQueryKey(), getGetTeacherReviewsQueryKey(), getGetSourceReviewsQueryKey(), getGetReviewAuditQueryKey(),
    getGetReviewAccessQueryKey(), getGetScholarsQueryKey(), getGetCapabilitiesQueryKey(), getGetStudyTextQueryKey('nawawi'),
  ];
  return Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}
export const APP_STATUS: Record<string, string> = {
  draft: 'مسودة', pending_review: 'قيد المراجعة', approved: 'معتمد', needs_information: 'يلزم استيفاء', rejected: 'مرفوض',
};
export const DOC_STATUS: Record<string, string> = { uploading: 'قيد الرفع', clean: 'سليم', rejected: 'مرفوض' };
export const SRC_STATUS: Record<string, string> = { pending_review: 'قيد المراجعة', approved: 'معتمد', rejected: 'مرفوض', withdrawn: 'مسحوب', pending: 'معلّق', cleared: 'مُخلّى' };
export const DOC_KIND: Record<string, string> = { qualification: 'مؤهل', ijaza: 'إجازة' };
export const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toLocaleString('ar-EG', { maximumFractionDigits: 1 })} م.ب` : `${Math.max(1, Math.round(n / 1024)).toLocaleString('ar-EG')} ك.ب`);
export const ACTION_AR: Record<string, string> = { approved: 'اعتماد', rejected: 'رفض', needs_information: 'طلب معلومات', withdrawn: 'سحب' };
