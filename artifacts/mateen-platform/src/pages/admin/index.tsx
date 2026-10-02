import { Link } from 'wouter';
import { CheckCircle2, XCircle } from 'lucide-react';
import { getGetSourceReviewsQueryKey, getGetTeacherReviewsQueryKey, useGetSourceReviews, useGetTeacherReviews } from '@workspace/api-client-react';
import type { ReviewAccess } from '@workspace/api-client-react';
import { AdminGate } from '@/components/admin/AdminGate';
import { ErrorState, LoadingList, PageHeader } from '@/components/mateen/bits';
import { errMsg } from '@/lib/admin';
import { num, usePageMeta } from '@/lib/mateen';

function Check({ ok, label }: { ok: boolean; label: string }) {
  const I = ok ? CheckCircle2 : XCircle;
  return <li className="flex items-center gap-2 font-ui text-sm"><I size={16} className={ok ? 'text-emerald-700' : 'text-red-700'} /> {label}</li>;
}
function Teachers() {
  const q = useGetTeacherReviews({ query: { queryKey: getGetTeacherReviewsQueryKey(), refetchInterval: 30_000 } });
  if (q.isLoading) return <LoadingList rows={1} />;
  if (q.isError || !q.data) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  const pending = q.data.filter((t) => t.status === 'pending_review').length;
  return <Link href="/admin/teachers" className="paper-card block p-6" data-testid="card-teachers"><p className="font-ui text-sm text-muted-foreground">طلبات معلمين بانتظار القرار</p><p className="font-display text-4xl font-bold">{num(pending)}</p><p className="font-ui text-xs text-muted-foreground">من أصل {num(q.data.length)} طلباً</p></Link>;
}
function Sources() {
  const q = useGetSourceReviews({ query: { queryKey: getGetSourceReviewsQueryKey(), refetchInterval: 30_000 } });
  if (q.isLoading) return <LoadingList rows={1} />;
  if (q.isError || !q.data) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  const approved = new Set(q.data.filter((v) => v.status === 'approved').map((v) => v.hadithNumber)).size;
  const pending = q.data.filter((v) => v.status === 'pending_review').length;
  return <Link href="/admin/sources" className="paper-card block p-6" data-testid="card-sources"><p className="font-ui text-sm text-muted-foreground">أحاديث معتمدة المصدر</p><p className="font-display text-4xl font-bold">{num(approved)} / {num(42)}</p><p className="font-ui text-xs text-muted-foreground">{num(pending)} نسخة بانتظار المراجعة</p></Link>;
}
function Overview({ a }: { a: ReviewAccess }) {
  return (
    <div>
      <PageHeader eyebrow="مركز المراجعة" title="نظرة عامة">لا يظهر نص أو معلم للطلاب إلا بعد قرار مراجع مستقل. الخادم هو المرجع في كل صلاحية، ولا تُمنح صلاحيات المراجعة ذاتياً ولا عبر ملف الطالب أو المعلم؛ يمنحها مسؤول النظام خارج هذه الواجهة.</PageHeader>
      <div className="grid gap-5 md:grid-cols-2">
        {a.qualificationReviewer ? <Teachers /> : null}
        {a.contentReviewer ? <Sources /> : null}
      </div>
      <div className="paper-card mt-6 p-6">
        <p className="mb-3 font-ui text-sm font-bold">حالة الجلسة والصلاحيات</p>
        <ul className="grid gap-2 md:grid-cols-2" data-testid="list-access">
          <Check ok={a.qualificationReviewer} label="مراجعة مؤهلات المعلمين" />
          <Check ok={a.contentReviewer} label="مراجعة المصادر العلمية" />
          <Check ok={a.verifiedEmail} label="بريد موثّق" />
          <Check ok={a.mfaEnabled} label="مصادقة ثنائية" />
          <Check ok={a.secureSession} label="جلسة بعاملين" />
        </ul>
      </div>
    </div>
  );
}
export default function AdminHome() {
  usePageMeta('مركز المراجعة | مَتِين', 'نظرة عامة على المراجعة.');
  return <AdminGate>{(a) => <Overview a={a} />}</AdminGate>;
}
