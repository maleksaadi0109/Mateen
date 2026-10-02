import { Link } from 'wouter';
import {
  getGetDashboardQueryKey, getGetProfileQueryKey, getGetProgressQueryKey, getGetCatalogQueryKey,
  useGetDashboard, useGetProfile, useGetProgress, useGetCatalog,
} from '@workspace/api-client-react';
import { ArrowLeft, Bookmark, CheckCheck } from 'lucide-react';
import { ErrorState, LoadingList, Notice, StarMark, PageHeader } from '@/components/mateen/bits';
import { fmtDate, num, usePageMeta } from '@/lib/mateen';

export default function StudentHome() {
  usePageMeta('لوحة الطالب | مَتِين', 'ملخص دراستك وآخر موضع توقفت عنده.');
  const profile = useGetProfile({ query: { enabled: true, queryKey: getGetProfileQueryKey() } });
  const dash = useGetDashboard({ query: { enabled: true, queryKey: getGetDashboardQueryKey() } });
  const progress = useGetProgress({ query: { enabled: true, queryKey: getGetProgressQueryKey() } });
  const catalog = useGetCatalog({ query: { enabled: true, queryKey: getGetCatalogQueryKey() } });

  if (dash.isLoading) return <LoadingList rows={3} />;
  if (dash.isError || !dash.data) return <ErrorState onRetry={() => dash.refetch()} />;
  const d = dash.data;
  const started = d.lastStudiedAt !== null || d.studiedCount > 0 || (progress.data?.length ?? 0) > 0;
  const pct = d.totalCount > 0 ? d.studiedCount / d.totalCount : 0;
  const R = 70, C = 2 * Math.PI * R;
  const available = catalog.data?.filter((t) => t.status === 'available') ?? [];

  return (
    <div>
      <PageHeader eyebrow="لوحة الطالب" title={`أهلاً ${profile.data?.name ?? ''}`}>
        {started ? 'تابع من حيث توقفت. هذه الأرقام من إقرارك الذاتي بما درسته، وليست درجة حفظ.' : 'لم تبدأ بعد. افتح الأربعين النووية واقرأ أول حديث.'}
      </PageHeader>

      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <section className="paper-card star-pattern relative overflow-hidden p-8">
          <p className="font-ui text-sm font-semibold text-secondary">{started ? 'آخر موضع توقف' : 'ابدأ من هنا'}</p>
          <h2 className="mt-2 font-display text-3xl font-bold">الأربعون النووية</h2>
          <p className="mt-3 font-arabic text-xl text-foreground/80" data-testid="text-last-hadith">
            {started ? `الحديث رقم ${num(d.lastHadith)}` : 'الحديث الأول: إنما الأعمال بالنيات'}
          </p>
          {d.lastStudiedAt && <p className="mt-1 font-ui text-sm text-muted-foreground">آخر دراسة: {fmtDate(d.lastStudiedAt)}</p>}
          <Link href={`/student/study/nawawi?h=${started ? Math.max(1, d.lastHadith) : 1}`} className="mt-7 inline-flex items-center gap-2 rounded-full bg-secondary px-7 py-3 font-ui font-bold text-secondary-foreground" data-testid="button-continue">
            {started ? 'متابعة الدراسة' : 'ابدأ الدراسة'} <ArrowLeft size={17} />
          </Link>
        </section>

        <section className="paper-card flex flex-col items-center p-8 text-center" aria-label="ما درسته">
          <svg viewBox="0 0 180 180" width="170" height="170" role="img" aria-label={`${num(d.studiedCount)} من ${num(d.totalCount)} موسومة مدروسة`}>
            <circle cx="90" cy="90" r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth="12" />
            <circle cx="90" cy="90" r={R} fill="none" stroke="hsl(var(--secondary))" strokeWidth="12" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform="rotate(-90 90 90)" style={{ transition: 'stroke-dashoffset .9s ease' }} />
            <text x="90" y="88" textAnchor="middle" className="fill-foreground font-display" fontSize="34" fontWeight="700">{num(d.studiedCount)}</text>
            <text x="90" y="116" textAnchor="middle" className="fill-muted-foreground font-ui" fontSize="14">من {num(d.totalCount)}</text>
          </svg>
          <p className="mt-3 font-display font-bold">مواضع موسومة بأنها مدروسة</p>
          <p className="mt-1 font-ui text-xs text-muted-foreground">إقرار ذاتي، لا اختبار ولا تقدير حفظ</p>
        </section>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Link href="/student/reviews" className="paper-card group flex items-center gap-5 p-6 transition hover:-translate-y-1" data-testid="link-bookmarks">
          <Bookmark className="text-secondary" size={28} />
          <div><p className="font-display text-3xl font-bold">{num(d.bookmarkedCount)}</p><p className="font-ui text-sm text-muted-foreground">علامات في قائمة المراجعة</p></div>
        </Link>
        <div className="paper-card flex items-center gap-5 p-6"><CheckCheck className="text-secondary" size={28} />
          <div><p className="font-display text-3xl font-bold">{num(progress.data?.length ?? 0)}</p><p className="font-ui text-sm text-muted-foreground">متون بدأت دراستها</p></div>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Notice title="التسميع الصوتي والاختبارات">غير متاحة في هذا الإصدار، ولن تظهر هنا درجات أو نتائج حتى تُفعَّل فعلاً.</Notice>
        {available.length > 0 && (
          <div className="paper-card p-6"><p className="font-display font-bold">المتاح الآن</p>
            {available.map((t) => (<Link key={t.id} href={`/student/study/${t.id}`} className="mt-3 flex items-center gap-3 font-arabic text-lg hover:text-secondary"><StarMark size={18} className="text-secondary" />{t.title}</Link>))}
          </div>
        )}
      </div>
    </div>
  );
}
