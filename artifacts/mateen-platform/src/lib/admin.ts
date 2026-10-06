import { intlTag } from './i18n';
import { fmt } from './i18n';
import { tr } from './i18n';
import type { QueryClient } from '@tanstack/react-query';
import {
  getGetCapabilitiesQueryKey, getGetReviewAccessQueryKey, getGetReviewAuditQueryKey, getGetScholarsQueryKey,
  getGetSourceReviewsQueryKey, getGetStudyTextQueryKey, getGetTeacherQueryKey, getGetTeacherReviewsQueryKey,
} from '@workspace/api-client-react';

export function errStatus(e: unknown): number | undefined {
  return typeof e === 'object' && e && 'status' in e && typeof (e as { status: unknown }).status === 'number' ? (e as { status: number }).status : undefined;
}
/** Real message from ApiError.data when the server sent one. */
export function errMsg(e: unknown, fallback = tr("حدث خطأ غير متوقع.")): string {
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
    'A verified email is required for administrative review': tr("وثّق بريدك الإلكتروني من ملف الحساب، ثم حدّث حالة الوصول. المصادقة الثنائية ليست شرطًا للمراجعة."),
    'Content-review permission is required': tr("هذه العملية تتطلب صلاحية مراجعة المحتوى التي يمنحها مسؤول النظام."),
    'A verified email is required to apply as a teacher': tr("وثّق بريدك الإلكتروني من إعدادات الحساب، ثم أعد المحاولة. لا يلزم تفعيل المصادقة الثنائية لتقديم طلب المعلم."),
    'This operation requires the teacher role': tr("هذه الصفحة لحساب المعلم؛ تأكد من الدخول بالحساب الذي سجّلته كمعلم."),
    'This account is disabled': tr("هذا الحساب موقوف. لا يمكنه تقديم طلب أو الوصول إلى الوثائق."),
    'Account security could not be verified': tr("تعذّر الاتصال بخدمة التحقق من الحساب مؤقتاً. أعد المحاولة دون إنشاء طلب جديد."),
    'Application revision changed or the application is not ready for submission': tr("حدّث بيانات الطلب وارفع شهادة PDF تجتاز الفحص الأمني، ثم أعد الإرسال."),
    'A security-checked PDF certificate is required before approval': tr("لا يمكن القبول دون شهادة PDF اجتازت الفحص الأمني."),
    'Teacher must have an active teacher account and verified email before approval': tr("يلزم حساب معلم نشط وبريد موثّق قبل قبول الطلب."),
    'Document validation is temporarily unavailable; the upload remains retryable': tr("رُفع الملف، لكن خدمة الفحص غير متاحة مؤقتاً. اضغط «إعادة الفحص» دون رفع نسخة أخرى."),
    'Document failed security validation': tr("لم يجتز الملف الفحص الأمني. احذفه وارفع ملف PDF سليماً."),
    'Private storage returned an invalid upload URL': tr("تعذّر تجهيز رابط رفع خاص. أعد المحاولة لاحقاً."),
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
  get draft() { return tr("مسودة"); }, get pending_review() { return tr("قيد المراجعة"); }, get approved() { return tr("معتمد"); }, get needs_information() { return tr("يلزم استيفاء"); }, get rejected() { return tr("مرفوض"); },
};
export const DOC_STATUS: Record<string, string> = { get uploading() { return tr("قيد الرفع"); }, get clean() { return tr("سليم"); }, get rejected() { return tr("مرفوض"); } };
export const SRC_STATUS: Record<string, string> = { get pending_review() { return tr("قيد المراجعة"); }, get approved() { return tr("معتمد"); }, get rejected() { return tr("مرفوض"); }, get withdrawn() { return tr("مسحوب"); }, get pending() { return tr("معلّق"); }, get cleared() { return tr("مُخلّى"); } };
export const DOC_KIND: Record<string, string> = { get qualification() { return tr("مؤهل"); }, get ijaza() { return tr("إجازة"); } };
export const fmtSize = (n: number) => (n >= 1048576 ? fmt("{a} م.ب", "{a} MB", { a: (n / 1048576).toLocaleString(intlTag(), { maximumFractionDigits: 1 }) }) : fmt("{a} ك.ب", "{a} KB", { a: Math.max(1, Math.round(n / 1024)).toLocaleString(intlTag()) }));
export const ACTION_AR: Record<string, string> = { get approved() { return tr("اعتماد"); }, get rejected() { return tr("رفض"); }, get needs_information() { return tr("طلب معلومات"); }, get withdrawn() { return tr("سحب"); } };
