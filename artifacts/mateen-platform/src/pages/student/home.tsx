import { Link } from 'wouter';
import {
  getGetDashboardQueryKey, getGetProfileQueryKey, getGetStudyActivityQueryKey,
  useGetDashboard, useGetProfile, useGetStudyActivity,
} from '@workspace/api-client-react';
import { ArrowLeft, Bookmark, Flame, CalendarDays, Trophy, GraduationCap } from 'lucide-react';
import { ErrorState, PageHeader, SkeletonBlock } from '@/components/mateen/bits';
import { num, usePageMeta } from '@/lib/mateen';
import { useNawawiMap } from '@/pages/student/learning-map';

const RESUME = '/student/learn/nawawi?resume=1';
const GROUP = 7;

function dayLabel(d: string | null) {
  if (!d) return '';
  const t = new Date(`${d}T00:00:00`);
  return Number.isNaN(t.getTime()) ? d : new Intl.DateTimeFormat('ar', { dateStyle: 'long' }).format(t);
}

export default function StudentHome() {
  usePageMeta('لوحة الطالب | مَتِين', 'موضعك على خريطة الأربعين ونشاطك الفعلي.');
  const profile = useGetProfile({ query: { enabled: true, queryKey: getGetProfileQueryKey() } });
  const map = useNawawiMap();
  const act = useGetStudyActivity({ query: { enabled: true, queryKey: getGetStudyActivityQueryKey() } });
  const dash = useGetDashboard({ query: { enabled: true, queryKey: getGetDashboardQueryKey() } });

  const stages = map.data?.stages ?? [];
  const passed = stages.filter((s) => s.status === 'passed').length;
  const current = stages.find((s) => s.status === 'current');
  const best = current?.bestPercent ?? null;
  let checkpoints = 0;
  for (let i = 0; i + GROUP <= stages.length; i += GROUP) {
    if (stages.slice(i, i + GROUP).every((s) => s.status === 'passed')) checkpoints++;
  }
  const pct = stages.length ? passed / stages.length : 0;
  const R = 70, C = 2 * Math.PI * R;
  const done = stages.length > 0 && !current && passed === stages.length;

  return (
    <div>
      <PageHeader eyebrow="لوحة الطالب" title={`أهلاً ${profile.data?.name ?? ''}`}>
        موضعك من الخريطة ونشاطك الفعلي في المنصة، دون أرقام مُقرَّة ذاتياً.
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="paper-card star-pattern relative overflow-hidden p-6 sm:p-8">
          {map.isLoading ? (
            <div className="space-y-3"><SkeletonBlock className="h-5 w-32" /><SkeletonBlock className="h-9 w-56" /><SkeletonBlock className="h-12 w-48 rounded-full" /></div>
          ) : map.isError ? (
            <ErrorState message="تعذّر تحميل موضعك من الخريطة." onRetry={() => map.refetch()} />
          ) : (
            <>
              <p className="font-ui text-sm font-semibold text-secondary">{done ? 'أتممت المراحل' : current ? 'أنت هنا على الخريطة' : 'الخريطة'}</p>
              <h2 className="mt-2 font-display text-3xl font-bold">الأربعون النووية</h2>
              <p className="mt-3 font-arabic text-xl text-foreground/80" data-testid="text-current-stage">
                {current ? `المرحلة ${num(current.number)}${current.title ? `: ${current.title}` : ''}` : done ? 'اجتزت كل المراحل' : 'لا مراحل منشورة بعد'}
              </p>
              {best !== null && <p className="mt-1 font-ui text-sm text-muted-foreground" data-testid="text-best-percent">أفضل نتيجة آلية تقريبية في هذه المرحلة: {num(best)}٪</p>}
              <Link href={RESUME} className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full bg-secondary px-7 py-3 font-ui font-bold text-secondary-foreground" data-testid="button-continue">
                متابعة التعلم <ArrowLeft size={17} />
              </Link>
              <div className="mt-4 flex flex-wrap gap-4 font-ui text-sm font-bold">
                <Link href={RESUME} className="text-secondary hover:underline" data-testid="link-resume-map">خريطة المراحل</Link>
                <Link href="/student/tracks" className="text-muted-foreground hover:underline" data-testid="link-tracks">اختيار المسار</Link>
              </div>
            </>
          )}
        </section>

        <section className="paper-card flex flex-col items-center p-6 text-center sm:p-8" aria-label="المراحل المجتازة">
          {map.isLoading ? <SkeletonBlock className="h-[170px] w-[170px] rounded-full" /> : map.isError ? (
            <p className="font-ui text-sm text-muted-foreground">لا يمكن عرض المراحل المجتازة الآن.</p>
          ) : (
            <>
              <svg viewBox="0 0 180 180" width="170" height="170" role="img" aria-label={`${num(passed)} من ${num(stages.length)} مرحلة مجتازة`}>
                <circle cx="90" cy="90" r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth="12" />
                <circle cx="90" cy="90" r={R} fill="none" stroke="hsl(var(--secondary))" strokeWidth="12" strokeLinecap="round"
                  strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform="rotate(-90 90 90)" style={{ transition: 'stroke-dashoffset .9s ease' }} />
                <text x="90" y="88" textAnchor="middle" className="fill-foreground font-display" fontSize="34" fontWeight="700">{num(passed)}</text>
                <text x="90" y="116" textAnchor="middle" className="fill-muted-foreground font-ui" fontSize="14">من {num(stages.length)}</text>
              </svg>
              <p className="mt-3 font-display font-bold">مراحل مجتازة</p>
              <p className="mt-1 flex items-center gap-1.5 font-ui text-xs text-muted-foreground" data-testid="text-checkpoints"><GraduationCap size={14} />امتحانات مجموعات مفتوحة: {num(checkpoints)}</p>
            </>
          )}
        </section>
      </div>

      <section className="mt-6" aria-label="نشاطك">
        {act.isLoading ? (
          <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <SkeletonBlock key={i} className="h-24" />)}</div>
        ) : act.isError || !act.data ? (
          <ErrorState message="تعذّر تحميل نشاطك. الخريطة تعمل كما هي." onRetry={() => act.refetch()} />
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="paper-card flex items-center gap-4 p-5"><Flame className="shrink-0 text-secondary" size={26} />
                <div><p className="font-display text-3xl font-bold" data-testid="text-current-streak">{num(act.data.currentStreak)}</p><p className="font-ui text-sm text-muted-foreground">أيام متتالية الآن</p></div></div>
              <div className="paper-card flex items-center gap-4 p-5"><Trophy className="shrink-0 text-secondary" size={26} />
                <div><p className="font-display text-3xl font-bold" data-testid="text-longest-streak">{num(act.data.longestStreak)}</p><p className="font-ui text-sm text-muted-foreground">أطول سلسلة</p></div></div>
              <div className="paper-card flex items-center gap-4 p-5"><CalendarDays className="shrink-0 text-secondary" size={26} />
                <div><p className="font-display text-3xl font-bold" data-testid="text-active-days">{num(act.data.activeDays)}</p><p className="font-ui text-sm text-muted-foreground">أيام نشطة</p></div></div>
            </div>
            <p className="mt-3 font-ui text-sm text-muted-foreground" data-testid="text-study-today">
              {act.data.studiedToday ? 'درست اليوم.' : 'لم تدرس اليوم بعد.'}
              {act.data.lastStudyDay ? ` آخر يوم دراسة: ${dayLabel(act.data.lastStudyDay)}.` : ''}
              {act.data.timezone ? ` المنطقة الزمنية: ${act.data.timezone}.` : ''}
            </p>
          </>
        )}
      </section>

      {dash.data && (
        <Link href="/student/reviews" className="paper-card mt-6 flex items-center gap-5 p-5 transition hover:-translate-y-1" data-testid="link-bookmarks">
          <Bookmark className="shrink-0 text-secondary" size={26} />
          <div><p className="font-display text-3xl font-bold">{num(dash.data.bookmarkedCount)}</p><p className="font-ui text-sm text-muted-foreground">علامات في قائمة المراجعة</p></div>
        </Link>
      )}
    </div>
  );
}
