import { Link } from 'wouter';
import { getGetCatalogQueryKey, getGetProgressQueryKey, useGetCatalog, useGetProgress } from '@workspace/api-client-react';
import { ArrowLeft, BarChart3, BookOpen, Lock } from 'lucide-react';
import { EmptyState, ErrorState, SkeletonBlock } from '@/components/mateen/bits';
import { num, usePageMeta } from '@/lib/mateen';
import { cn } from '@/lib/utils';
import { StudyContinuity } from '@/components/mateen/study-continuity';

const spines = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--primary) / 0.7)', 'hsl(var(--secondary) / 0.75)'];

export default function StudyLibraryPage() {
  usePageMeta('مكتبة الدراسة | مَتِين', 'المتون المتاحة للقراءة والتسميع في مَتِين.');
  const catalog = useGetCatalog({ query: { queryKey: getGetCatalogQueryKey() } });
  const progress = useGetProgress({ query: { queryKey: getGetProgressQueryKey() } });

  return (
    <div className="space-y-8" data-testid="page-study-library">
      <header className="relative overflow-hidden rounded-[1.75rem] border bg-card px-6 py-8 sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute -left-10 -top-16 h-56 w-56 rounded-full bg-secondary/10" aria-hidden />
        <p className="font-ui text-xs font-bold tracking-wide text-secondary">خزانة المتون</p>
        <h1 className="mt-2 font-display text-3xl font-bold leading-tight sm:text-4xl">مكتبة الدراسة</h1>
        <p className="mt-3 max-w-xl font-ui text-sm leading-relaxed text-muted-foreground">اختر متناً لتقرأه صفحة صفحة، ثم سمّعه من حفظك. لا يُفتح إلا ما راجعنا نصه وأتحناه؛ وما سواه يبقى على الرف حتى يكتمل.</p>
        <Link href="/student/study/reports" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full border border-secondary/40 px-4 font-ui text-sm font-bold text-secondary hover:bg-secondary/10" data-testid="link-library-reports">
          <BarChart3 size={15} />نظرة على تقارير التسميع
        </Link>
      </header>

      <StudyContinuity />
      {catalog.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2"><SkeletonBlock className="h-52" /><SkeletonBlock className="h-52" /></div>
      ) : catalog.isError ? (
        <ErrorState message="تعذّر تحميل فهرس المتون." onRetry={() => catalog.refetch()} />
      ) : !catalog.data?.length ? (
        <EmptyState icon={<BookOpen size={28} />} title="الرف فارغ الآن">لا توجد متون في الفهرس بعد.</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" data-testid="list-library-books">
          {catalog.data.map((b, i) => {
            const open = b.status === 'available';
            const saved = progress.data?.find(p => p.textId === b.id)?.currentHadith;
            const body = (
              <>
                <span className="absolute inset-y-0 right-0 w-3" style={{ background: spines[i % spines.length], opacity: open ? 1 : 0.35 }} aria-hidden />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-ui text-[11px] font-bold text-muted-foreground">{b.track} · {b.level}</p>
                    <h2 className="mt-1 font-display text-2xl font-bold leading-snug">{b.title}</h2>
                  </div>
                  {open
                    ? <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 font-ui text-[11px] font-bold text-primary">متاح</span>
                    : <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-ui text-[11px] font-bold text-muted-foreground"><Lock size={11} />قريباً</span>}
                </div>
                <p className="mt-3 line-clamp-3 font-ui text-sm leading-relaxed text-muted-foreground">{b.description}</p>
                <div className="mt-5 flex items-center justify-between gap-2 border-t border-dashed pt-3 font-ui text-xs">
                  <span className="text-muted-foreground">{b.hadithCount ? `${num(b.hadithCount)} حديثاً` : 'العدد غير محدد'}</span>
                  {open
                    ? <span className="inline-flex items-center gap-1 font-bold text-secondary">{saved ? `متابعة من الحديث ${num(saved)}` : 'ابدأ القراءة'}<ArrowLeft size={14} /></span>
                    : <span className="text-muted-foreground">غير منشور بعد</span>}
                </div>
              </>
            );
            const cls = 'relative block h-full overflow-hidden rounded-[1.25rem] border bg-card p-5 pr-7';
            return (
              <li key={b.id}>
                {open
                  ? <Link href={`/student/study/${b.id}`} className={cn(cls, 'transition-transform hover:-translate-y-0.5 hover:border-secondary/50 motion-reduce:transition-none')} data-testid={`link-library-book-${b.id}`}>{body}</Link>
                  : <div className={cn(cls, 'opacity-70')} aria-disabled="true" data-testid={`card-library-locked-${b.id}`}>{body}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
