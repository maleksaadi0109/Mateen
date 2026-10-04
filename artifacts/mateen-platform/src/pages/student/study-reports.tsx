import { useMemo, type ReactNode } from 'react';
import { Link } from 'wouter';
import { useUser } from '@clerk/react';
import { useQuery } from '@tanstack/react-query';
import { listPracticeReports, type PracticeReport } from '@workspace/api-client-react';
import { ArrowRight, BookOpen, CheckCircle2, CircleDashed, RotateCcw } from 'lucide-react';
import { EmptyState, ErrorState, SkeletonBlock } from '@/components/mateen/bits';
import { buildStudyInsights } from '@/lib/study-insights';
import { num, usePageMeta } from '@/lib/mateen';
import { cn } from '@/lib/utils';

const PAGE = 20;
const CAP = 500;

async function fetchAllReports(signal: AbortSignal): Promise<PracticeReport[]> {
  const all: PracticeReport[] = [];
  let offset = 0;
  while (all.length < CAP) {
    const page = await listPracticeReports({ offset }, { signal });
    all.push(...page.reports);
    if (!page.hasMore || page.reports.length === 0) break;
    offset += PAGE;
  }
  return all.slice(0, CAP);
}

type Insights = ReturnType<typeof buildStudyInsights>;
type HadithRow = Insights['hadiths'][number];

const pct = (m: number, a: number) => (a > 0 ? Math.round((100 * m) / a) : 0);

export default function StudyReportsPage() {
  usePageMeta('تقارير التسميع | مَتِين', 'نظرة صادقة على تقارير التسميع المحفوظة في حسابك.');
  const { user, isLoaded } = useUser();
  const userId = isLoaded && user ? user.id : null;
  // Shares the ['practice-reports', userId] prefix so saving/deleting a report in the reader invalidates this.
  const query = useQuery({
    queryKey: ['practice-reports', userId, 'overview'], enabled: !!userId,
    queryFn: ({ signal }) => fetchAllReports(signal),
    staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true,
  });
  const insights = useMemo(() => (query.data ? buildStudyInsights(query.data) : null), [query.data]);

  return (
    <div className="space-y-8" data-testid="page-study-reports">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/student/study" className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 font-ui text-xs text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="link-reports-library"><ArrowRight size={14} />المكتبة</Link>
        <Link href="/student/study/nawawi" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 font-ui text-xs font-bold hover:bg-muted" data-testid="link-reports-reader"><BookOpen size={14} />القارئ</Link>
      </div>

      <header className="max-w-2xl">
        <p className="font-ui text-xs font-bold text-secondary">دفتر المراجعة</p>
        <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">تقارير التسميع</h1>
        <p className="mt-3 font-ui text-sm leading-relaxed text-muted-foreground" data-testid="text-reports-honesty">
          مبنية فقط على التقارير التي اخترت حفظها في حسابك. النسب مقارنة آلية تقريبية بين ما التقطه التعرّف على الصوت والنص؛ ليست تقييماً معتمداً للنطق أو التجويد ولا درجة اختبار.
        </p>
      </header>

      {!isLoaded || query.isLoading ? (
        <div className="space-y-4"><SkeletonBlock className="h-28" /><SkeletonBlock className="h-64" /></div>
      ) : !userId ? (
        <EmptyState title="سجّل الدخول لرؤية تقاريرك">التقارير محفوظة في الحساب فقط.</EmptyState>
      ) : query.isError ? (
        <ErrorState message="تعذّر تحميل تقارير التسميع." onRetry={() => query.refetch()} />
      ) : !insights || insights.reportCount === 0 ? (
        <EmptyState icon={<CircleDashed size={28} />} title="لا توجد تقارير مكتملة للتحليل بعد"
          action={<Link href="/student/study/nawawi" className="rounded-full bg-primary px-6 py-2.5 font-ui font-bold text-primary-foreground" data-testid="link-reports-empty-start">افتح القارئ وسمّع</Link>}>
          بعد إنهاء محاولة تسميع، اختر حفظ التقرير في حسابك ليظهر هنا.
        </EmptyState>
      ) : (
        <Overview insights={insights} capped={(query.data?.length ?? 0) >= CAP} />
      )}
    </div>
  );
}

function Overview({ insights, capped }: { insights: Insights; capped: boolean }) {
  const strong = insights.hadiths.filter(h => h.status === 'strong');
  const review = insights.hadiths.filter(h => h.status === 'review');
  const partial = insights.hadiths.filter(h => h.status === 'partial');
  return (
    <>
      <section className="grid gap-px overflow-hidden rounded-[1.5rem] border bg-border sm:grid-cols-2 lg:grid-cols-4" aria-label="ملخص" data-testid="reports-summary">
        <Stat label="سلسلة الأيام الحالية" value={num(insights.currentStreak)} unit="يوم" testId="stat-current-streak" />
        <Stat label="أطول سلسلة" value={num(insights.longestStreak)} unit="يوم" testId="stat-longest-streak" />
        <Stat label="أيام فيها تقارير" value={num(insights.activeDays)} unit="يوم" testId="stat-active-days" />
        <Stat label="تطابق تقريبي إجمالي" value={`${num(pct(insights.matched, insights.attempted))}٪`} unit={`${num(insights.reportCount)} تقريراً`} testId="stat-overall-match" />
      </section>
      <p className="-mt-5 font-ui text-[11px] leading-relaxed text-muted-foreground" data-testid="text-streak-note">
        الأيام تُحسب من وقت حفظ تقارير التسميع بتوقيت متصفحك، لا من كل أيام دراستك أو قراءتك. حذف تقرير يعيد الحساب. التقارير القديمة ذات التفاصيل الناقصة لا تدخل في هذا الملخص.
        {capped && ` تُعرض أحدث ${num(CAP)} تقرير فقط.`}
      </p>

      <Group title="ثابت في آخر تقرير" hint="غطّى التقرير الكامل كل الكلمات بتطابق تقريبي ٩٠٪ فأكثر." icon={<CheckCircle2 size={18} />} tone="primary" rows={strong} testId="group-strong" />
      <Group title="يحتاج مراجعة" hint="غُطّيت الكلمات كلها لكن التطابق التقريبي دون ٩٠٪." icon={<RotateCcw size={18} />} tone="secondary" rows={review} testId="group-review" />
      <Group title="تسميع جزئي" hint="بقيت كلمات لم يشملها آخر تقرير كامل." icon={<CircleDashed size={18} />} tone="muted" rows={partial} testId="group-partial" />

      <aside className="rounded-2xl border border-dashed bg-card/60 p-4 font-ui text-xs leading-relaxed text-muted-foreground">
        التقارير التفصيلية كلمة بكلمة، وحذف أي تقرير من الحساب، متاحان أسفل صفحة القارئ في «تقارير محفوظة في حسابك».{' '}
        <Link href="/student/study/nawawi" className="font-bold text-secondary underline-offset-2 hover:underline" data-testid="link-reports-detail">افتح القارئ</Link>
      </aside>
    </>
  );
}

function Stat({ label, value, unit, testId }: { label: string; value: string; unit: string; testId: string }) {
  return (
    <div className="bg-card p-5" data-testid={testId}>
      <p className="font-ui text-[11px] font-bold text-muted-foreground">{label}</p>
      <p className="mt-2 flex items-baseline gap-2"><span className="font-display text-3xl font-bold">{value}</span><span className="font-ui text-xs text-muted-foreground">{unit}</span></p>
    </div>
  );
}

function Group({ title, hint, icon, tone, rows, testId }: { title: string; hint: string; icon: ReactNode; tone: 'primary' | 'secondary' | 'muted'; rows: HadithRow[]; testId: string }) {
  return (
    <section data-testid={testId}>
      <div className="mb-3 flex items-center gap-2">
        <span className={cn('grid h-8 w-8 place-items-center rounded-full', tone === 'primary' ? 'bg-primary/10 text-primary' : tone === 'secondary' ? 'bg-secondary/15 text-secondary' : 'bg-muted text-muted-foreground')}>{icon}</span>
        <h2 className="font-display text-xl font-bold">{title}</h2>
        <span className="font-ui text-xs text-muted-foreground">({num(rows.length)})</span>
      </div>
      <p className="mb-3 font-ui text-xs text-muted-foreground">{hint}</p>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center font-ui text-xs text-muted-foreground">لا أحاديث هنا الآن.</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {rows.map(h => (
            <li key={h.id}>
              <Link href={`/student/study/nawawi?h=${h.number}`} className="flex flex-col gap-2 p-4 hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between" data-testid={`link-report-hadith-${h.number}`}>
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-secondary/50 font-display text-sm font-bold text-secondary">{num(h.number)}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-display text-base font-bold">{h.title}</span>
                    <span className="block font-ui text-[11px] text-muted-foreground">غُطّي {num(h.covered)} من {num(h.totalWords)} كلمة · تطابق تقريبي {num(pct(h.matched, h.attempted))}٪</span>
                  </span>
                </span>
                <span className="flex flex-wrap gap-1.5 font-ui text-[11px]">
                  <Chip label="استبدال" n={h.substitutions} />
                  <Chip label="إسقاط" n={h.omissions} />
                  <Chip label="زيادة" n={h.extras} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Chip({ label, n }: { label: string; n: number }) {
  return <span className={cn('rounded-full px-2 py-0.5', n > 0 ? 'bg-secondary/10 font-bold text-secondary' : 'bg-muted text-muted-foreground')}>{label} {num(n)}</span>;
}
