import { Link } from 'wouter';
import { getGetLearningMapQueryKey, getGetTuhfaTextQueryKey, useGetLearningMap, useGetTuhfaText, type LearningMapStagesItem, type TuhfaChapter } from '@workspace/api-client-react';
import { ArrowLeft, Check, Lock, BookOpenText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, ErrorState, PageHeader, Reveal, SkeletonBlock } from '@/components/mateen/bits';
import { num, usePageMeta } from '@/lib/mateen';
import BookMascot from '@/components/mateen/book-mascot';
import JourneyGuide from '@/components/mateen/journey/journey-guide';

export function useTuhfaMap() {
  return useGetLearningMap('tuhfa', { query: { queryKey: getGetLearningMapQueryKey('tuhfa'), refetchOnMount: 'always', refetchOnWindowFocus: true } });
}
export function useTuhfaText() {
  return useGetTuhfaText({ query: { queryKey: getGetTuhfaTextQueryKey(), staleTime: 5 * 60_000 } });
}

export type ChapterStatus = 'locked' | 'current' | 'passed';
export function chapterStatus(ch: TuhfaChapter, stages: LearningMapStagesItem[]): ChapterStatus {
  const st = ch.verses.map((v) => stages.find((s) => s.number === v.number)?.status ?? 'locked');
  if (st.length && st.every((s) => s === 'passed')) return 'passed';
  if (st.some((s) => s === 'current')) return 'current';
  return 'locked';
}

export default function TuhfaMapPage() {
  usePageMeta('رحلة تحفة الأطفال | مَتِين', 'أبواب تحفة الأطفال: اقرأ الباب كاملاً، وسمّع كل بيت لتُفتح الأبيات التالية.');
  const map = useTuhfaMap();
  const text = useTuhfaText();
  const stages = map.data?.stages ?? [];
  const chapters = text.data?.chapters ?? [];
  const threshold = map.data?.threshold ?? 90;
  const passed = stages.filter((s) => s.status === 'passed').length;
  const current = stages.find((s) => s.status === 'current');
  const currentChapter = current ? chapters.find((c) => c.verses.some((v) => v.number === current.number)) : undefined;
  const pct = stages.length ? (passed / stages.length) * 100 : 0;

  return (
    <div>
      <PageHeader eyebrow="تحفة الأطفال" title="رحلة التحفة">
        المنظومة مقسّمة على أبوابها: اقرأ الباب المفتوح كاملاً، ثم سمّع أبياته بيتاً بيتاً. يُفتح البيت التالي عند تسميع السابق بأكثر من {num(threshold)}٪.
      </PageHeader>
      {current && currentChapter && (
        <div className="mb-6">
          <Link href={`/student/learn/tuhfa/${currentChapter.number}?verse=${current.number}`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-secondary px-6 py-3 font-ui font-bold text-secondary-foreground shadow-[0_4px_0_hsl(24_90%_20%)] transition active:translate-y-1 active:shadow-none" data-testid="link-resume-verse">
            تابع البيت {num(current.number)} <ArrowLeft size={16} />
          </Link>
        </div>
      )}
      {map.isLoading || text.isLoading ? (
        <div className="mx-auto grid max-w-2xl gap-4">{Array.from({ length: 5 }, (_, i) => <SkeletonBlock key={i} className="h-24" />)}</div>
      ) : map.isError ? <ErrorState message="تعذّر تحميل تقدّمك في التحفة." onRetry={() => map.refetch()} />
        : text.isError ? <ErrorState message="تعذّر تحميل نص التحفة." onRetry={() => text.refetch()} />
        : !chapters.length || !stages.length ? <EmptyState icon={<BookMascot size={72} mood="rest" />} title="لا أبواب بعد">ستظهر الأبواب عند نشرها.</EmptyState> : (
        <div className="paper-card mx-auto max-w-2xl px-4 py-6 sm:px-8">
          <div className="mb-5 flex items-center gap-3">
            <p className="shrink-0 font-ui text-sm font-semibold text-muted-foreground" data-testid="text-tuhfa-progress">سمّعت {num(passed)} من {num(stages.length)} بيتاً</p>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={stages.length} aria-valuenow={passed} aria-label="التقدم في الأبيات">
              <div className="h-full rounded-full bg-secondary transition-[width] duration-700" style={{ width: `${pct}%` }} />
            </div>
          </div>
          {!current && passed === stages.length && <JourneyGuide mood="cheer" message="أتممت أبيات التحفة كلها. راجع الأبواب متى شئت." />}
          <ol className="relative space-y-3">
            <span className="absolute inset-y-6 right-[1.9rem] w-0.5 bg-border" aria-hidden />
            {chapters.map((ch, i) => {
              const status = chapterStatus(ch, stages);
              const done = ch.verses.filter((v) => stages.find((s) => s.number === v.number)?.status === 'passed').length;
              const first = ch.verses[0]?.number, last = ch.verses[ch.verses.length - 1]?.number;
              const body = (
                <>
                  <span className={cn('relative z-[1] grid h-[3.75rem] w-[3.75rem] shrink-0 place-items-center rounded-full border-4 font-display text-lg font-bold',
                    status === 'passed' && 'border-primary bg-primary text-primary-foreground',
                    status === 'current' && 'border-secondary bg-secondary text-secondary-foreground shadow-[0_5px_0_hsl(24_90%_20%)]',
                    status === 'locked' && 'border-muted bg-muted text-muted-foreground')}>
                    {status === 'current' && <span className="journey-ring absolute inset-0 rounded-full border-4 border-secondary" aria-hidden />}
                    {status === 'passed' ? <Check size={24} /> : status === 'locked' ? <Lock size={20} /> : num(ch.number)}
                  </span>
                  <span className="min-w-0 flex-1 text-start">
                    <span className="block font-ui text-xs font-semibold text-secondary">الباب {num(ch.number)}{first ? ` · الأبيات ${num(first)}–${num(last ?? first)}` : ''}</span>
                    <span className="block font-display text-lg font-bold leading-snug">{ch.title}</span>
                    <span className="mt-1 block font-ui text-xs text-muted-foreground">{status === 'locked' ? 'يُفتح بعد إتمام الباب السابق' : `${num(done)} من ${num(ch.verses.length)} أبيات مُسمّعة`}</span>
                  </span>
                  {status !== 'locked' && <ArrowLeft size={18} className="shrink-0 text-secondary" aria-hidden />}
                </>
              );
              const cls = 'flex items-center gap-4 rounded-2xl p-3';
              return (
                <Reveal key={ch.number} delay={Math.min(i, 6) * 0.05}>
                  <li className="list-none" data-testid={`chapter-node-${ch.number}`}>
                    {status === 'locked'
                      ? <div className={cn(cls, 'opacity-75')} aria-disabled="true">{body}</div>
                      : <Link href={`/student/learn/tuhfa/${ch.number}`} className={cn(cls, 'transition hover:bg-secondary/5', status === 'current' && 'bg-secondary/5 ring-1 ring-secondary/30')} data-testid={`link-chapter-${ch.number}`}>{body}</Link>}
                  </li>
                </Reveal>
              );
            })}
          </ol>
          <p className="mt-6 flex items-center gap-2 font-ui text-xs text-muted-foreground"><BookOpenText size={14} aria-hidden />{text.data?.title} · {text.data?.author}</p>
        </div>
      )}
    </div>
  );
}
