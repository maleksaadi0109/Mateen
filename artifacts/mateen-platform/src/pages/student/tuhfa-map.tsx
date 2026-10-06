import { fmt } from '@/lib/i18n';
import { tr } from '@/lib/i18n';
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
  const st = stages.find((s) => s.number === ch.number)?.status;
  return st === 'passed' ? 'passed' : st === 'current' ? 'current' : 'locked';
}

export default function TuhfaMapPage() {
  usePageMeta(tr("رحلة تحفة الأطفال | مَتِين"), tr("أبواب تحفة الأطفال: اقرأ الباب كاملاً ثم سمّع أبياته كلها في محاولة واحدة ليُفتح الباب التالي."));
  const map = useTuhfaMap();
  const text = useTuhfaText();
  const stages = map.data?.stages ?? [];
  const chapters = text.data?.chapters ?? [];
  const threshold = map.data?.threshold ?? 90;
  const passed = stages.filter((s) => s.status === 'passed').length;
  const current = stages.find((s) => s.status === 'current');
  const currentChapter = current ? chapters.find((c) => c.number === current.number) : undefined;
  const pct = stages.length ? (passed / stages.length) * 100 : 0;

  return (
    <div>
      <PageHeader eyebrow={tr("تحفة الأطفال")} title={tr("رحلة التحفة")}>{tr("كل باب مرحلة واحدة: اقرأه كاملاً، ثم سمّع جميع أبياته في محاولة واحدة. يُفتح الباب التالي عند تسميع هذا الباب بأكثر من")}{' '}{num(threshold)}{tr("٪.")}</PageHeader>
      {current && currentChapter && (
        <div className="mb-6">
          <Link href={`/student/learn/tuhfa/${currentChapter.number}`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-secondary px-6 py-3 font-ui font-bold text-secondary-foreground shadow-[0_4px_0_hsl(24_90%_20%)] transition active:translate-y-1 active:shadow-none" data-testid="link-resume-verse">{tr("تابع الباب")}{' '}{num(currentChapter.number)} <ArrowLeft size={16} />
          </Link>
        </div>
      )}
      {map.isLoading || text.isLoading ? (
        <div className="mx-auto grid max-w-2xl gap-4">{Array.from({ length: 5 }, (_, i) => <SkeletonBlock key={i} className="h-24" />)}</div>
      ) : map.isError ? <ErrorState message={tr("تعذّر تحميل تقدّمك في التحفة.")} onRetry={() => map.refetch()} />
        : text.isError ? <ErrorState message={tr("تعذّر تحميل نص التحفة.")} onRetry={() => text.refetch()} />
        : !chapters.length || !stages.length ? <EmptyState icon={<BookMascot size={72} mood="rest" />} title={tr("لا أبواب بعد")}>{tr("ستظهر الأبواب عند نشرها.")}</EmptyState> : (
        <div className="paper-card mx-auto max-w-2xl px-4 py-6 sm:px-8">
          <div className="mb-5 flex items-center gap-3">
            <p className="shrink-0 font-ui text-sm font-semibold text-muted-foreground" data-testid="text-tuhfa-progress">{tr("أتممت")}{' '}{num(passed)}{' '}{tr("من")}{' '}{num(stages.length)}{' '}{tr("أبواب")}</p>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={stages.length} aria-valuenow={passed} aria-label={tr("التقدم في الأبواب")}>
              <div className="h-full rounded-full bg-secondary transition-[width] duration-700" style={{ width: `${pct}%` }} />
            </div>
          </div>
          {!current && passed === stages.length && <JourneyGuide mood="cheer" message={tr("أتممت أبواب التحفة كلها. راجع الأبواب متى شئت.")} />}
          <ol className="relative space-y-3">
            <span className="absolute inset-y-6 right-[1.9rem] w-0.5 bg-border" aria-hidden />
            {chapters.map((ch, i) => {
              const status = chapterStatus(ch, stages);
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
                    <span className="block font-ui text-xs font-semibold leading-6 text-secondary">{tr("الباب")}{' '}{num(ch.number)}{first ? fmt(" · الأبيات {a}–{b}", " · verses {a}–{b}", { a: num(first), b: num(last ?? first) }) : ''}</span>
                    <span className="block py-1 font-display text-lg font-bold leading-[2]">{ch.title}</span>
                    <span className="mt-1 block font-ui text-xs text-muted-foreground">{status === 'locked' ? tr("يُفتح بعد إتمام الباب السابق") : status === 'passed' ? tr("تم تسميعه") : fmt("{a} أبيات · تسميع واحد", "{a} verses · one recitation", { a: num(ch.verses.length) })}</span>
                  </span>
                  {status !== 'locked' && <ArrowLeft size={18} className="shrink-0 text-secondary" aria-hidden />}
                </>
              );
              const cls = 'flex items-center gap-4 rounded-2xl p-3';
              const here = status === 'current';
              return (
                <Reveal key={ch.number} delay={Math.min(i, 6) * 0.05}>
                  <li className="list-none" data-testid={`chapter-node-${ch.number}`}>
                    {status === 'locked'
                      ? <div className={cn(cls, 'opacity-75')} aria-disabled="true">{body}</div>
                      : <Link href={`/student/learn/tuhfa/${ch.number}`} className={cn(cls, 'transition hover:bg-secondary/5', status === 'current' && 'bg-secondary/5 ring-1 ring-secondary/30')} data-testid={`link-chapter-${ch.number}`}>{body}</Link>}
                  </li>
                  {here && <JourneyGuide mood="cheer" message={fmt("اقرأ الباب {a} كاملاً، واختر الكلمات لتسأل عنها. سمّع جميع أبياته في محاولة واحدة لتفتح الباب التالي بأكثر من {b}٪. هذا تدريب كلمات تقريبي، لا تقييم للنطق.", "Read chapter {a} in full and pick words to ask about. Recite all its verses in one attempt above {b}% to unlock the next chapter. This is approximate word practice, not a pronunciation assessment.", { a: num(ch.number), b: num(threshold) })} />}
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
