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
      for (const k of ['message', 'error', 'detail', 'reason']) if (typeof o[k] === 'string' && o[k]) return reviewErrorMessage(o[k] as string);
    }
    if (typeof d === 'string' && d) return d;
    if (e instanceof Error && e.message) return e.message;
  }
  return fallback;
}
function reviewErrorMessage(message: string) {
  const messages: Record<string, string> = {
    'A verified email is required to apply as a teacher': 'وثّق بريدك الإلكتروني من إعدادات الحساب، ثم أعد المحاولة. لا يلزم تفعيل المصادقة الثنائية لتقديم طلب المعلم.',
    'This operation requires the teacher role': 'هذه الصفحة لحساب المعلم؛ تأكد من الدخول بالحساب الذي سجّلته كمعلم.',
    'This account is disabled': 'هذا الحساب موقوف. لا يمكنه تقديم طلب أو الوصول إلى الوثائق.',
    'Account security could not be verified': 'تعذّر الاتصال بخدمة التحقق من الحساب مؤقتاً. أعد المحاولة دون إنشاء طلب جديد.',
    'Application revision changed or the application is not ready for submission': 'حدّث بيانات الطلب وارفع شهادة PDF تجتاز الفحص الأمني، ثم أعد الإرسال.',
    'A security-checked PDF certificate is required before approval': 'لا يمكن القبول دون شهادة PDF اجتازت الفحص الأمني.',
    'Teacher must have an active teacher account and verified email before approval': 'يلزم حساب معلم نشط وبريد موثّق قبل قبول الطلب.',
    'Document validation is temporarily unavailable; the upload remains retryable': 'رُفع الملف، لكن خدمة الفحص غير متاحة مؤقتاً. اضغط «إعادة الفحص» دون رفع نسخة أخرى.',
    'Document failed security validation': 'لم يجتز الملف الفحص الأمني. احذفه وارفع ملف PDF سليماً.',
    'Private storage returned an invalid upload URL': 'تعذّر تجهيز رابط رفع خاص. أعد المحاولة لاحقاً.',
  };
  return messages[message] ?? message;
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
