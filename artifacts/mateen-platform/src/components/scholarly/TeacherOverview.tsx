import { Link } from 'wouter';
import { getGetMateenTeacherReferralsQueryKey, useGetMateenTeacherReferrals } from '@workspace/api-client-react';
import { fmtDate, num } from '@/lib/mateen';
import { PageHeader, SkeletonBlock } from '@/components/mateen/bits';
import { StatusPill, useFinitePoll } from './shared';
import { errStatus } from '@/lib/admin';

export function TeacherReferralOverview() {
  const poll = useFinitePoll(15000);
  const q = useGetMateenTeacherReferrals(undefined, { query: { queryKey: getGetMateenTeacherReferralsQueryKey(), refetchInterval: poll } });
  if (q.isLoading) return <SkeletonBlock className="h-32" />;
  if (q.isError && errStatus(q.error) === 403) return (
    <div className="paper-card space-y-3 p-5" data-testid="state-teacher-awaiting-approval">
      <h2 className="font-display text-lg font-bold">الإحالات تُتاح بعد اعتماد ملفك</h2>
      <p className="font-ui text-sm text-muted-foreground">يمكنك تقديم طلبك ومتابعة قرار الإدارة الآن. لا تصلك إحالات الطلاب قبل مراجعة الشهادة واعتمادك.</p>
      <Link href="/teacher" className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 font-ui text-sm font-bold text-primary-foreground">عرض طلب الاعتماد</Link>
    </div>
  );
  if (q.isError || !q.data) return <div className="paper-card p-5 font-ui text-sm" role="alert">تعذّر تحميل الإحالات.</div>;
  const waiting = q.data.filter((r) => r.status === 'open').length;
  const answered = q.data.filter((r) => r.status === 'answered').length;
  return (
    <section className="paper-card p-6" data-testid="card-referral-overview">
      <div className="flex items-center justify-between"><h3 className="font-display text-lg font-bold">الإحالات</h3><Link href="/teacher/messages" className="font-ui text-sm font-bold text-secondary" data-testid="link-teacher-messages">فتح الرسائل</Link></div>
      <p className="mt-2 font-ui text-sm text-muted-foreground" data-testid="text-referral-counts">بانتظار الرد: {num(waiting)} · أُجيب: {num(answered)}</p>
      <ul className="mt-3 space-y-2">{q.data.slice(0, 3).map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 font-ui text-sm"><Link href={`/teacher/messages?conversation=${encodeURIComponent(r.conversationId)}`} className="truncate text-secondary underline">{r.question}</Link><span className="flex items-center gap-2 shrink-0"><StatusPill status={r.status} /><span className="text-xs text-muted-foreground">{fmtDate(r.createdAt)}</span></span></li>
      ))}</ul>
    </section>
  );
}

export default function TeacherOverview() {
  return (
    <div>
      <PageHeader eyebrow="نظرة عامة" title="إحالاتك">عدد الإحالات وآخر المحادثات التي وصلتك من الطلاب.</PageHeader>
      <TeacherReferralOverview />
    </div>
  );
}
