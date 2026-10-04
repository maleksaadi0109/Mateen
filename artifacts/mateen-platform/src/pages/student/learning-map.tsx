import { Fragment, useEffect, useRef } from 'react';
import { Link, useParams, useSearch } from 'wouter';
import { getGetLearningMapQueryKey, useGetLearningMap } from '@workspace/api-client-react';
import { ArrowLeft, BookOpen, GraduationCap, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, ErrorState, PageHeader, SkeletonBlock } from '@/components/mateen/bits';
import { num, usePageMeta } from '@/lib/mateen';
import BookMascot from '@/components/mateen/book-mascot';
import StageNode from '@/components/mateen/journey/stage-node';
import JourneyGuide from '@/components/mateen/journey/journey-guide';
import SectionBanner from '@/components/mateen/journey/section-banner';

export function useNawawiMap() {
  return useGetLearningMap('nawawi', { query: { queryKey: getGetLearningMapQueryKey('nawawi'), refetchOnMount: 'always', refetchOnWindowFocus: true } });
}

const SECTION = 7;

export default function LearningMapPage() {
  const { textId } = useParams<{ textId: string }>();
  usePageMeta('خريطة الأربعين | مَتِين', 'مراحل الأربعين النووية: حديث في كل مرحلة، وامتحان بعد كل سبع مراحل.');
  const map = useNawawiMap();
  const search = useSearch();
  const resume = new URLSearchParams(search).get('resume') === '1';
  const scrolled = useRef(false);
  useEffect(() => {
    if (!resume) { scrolled.current = false; return; }
    if (textId !== 'nawawi' || map.isFetching || scrolled.current) return;
    const stages = map.data?.stages ?? [];
    const target = stages.find(s => s.status === 'current') ?? [...stages].reverse().find(s => s.status === 'passed');
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      const node = document.getElementById(`stage-${target.number}`);
      if (!node) return;
      node.scrollIntoView({ block: 'center', behavior: 'instant' });
      node.focus({ preventScroll: true });
      scrolled.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [resume, textId, map.isFetching, map.data]);
  if (textId !== 'nawawi') return <EmptyState icon={<BookMascot size={72} mood="rest" />} title="هذا المتن قريباً">لا خريطة له بعد. <Link href="/student/tracks" className="font-bold text-secondary">المسارات</Link></EmptyState>;

  const stages = map.data?.stages ?? [];
  const threshold = map.data?.threshold ?? 90;
  const passed = stages.filter((s) => s.status === 'passed').length;
  const current = stages.find((s) => s.status === 'current');
  const pct = stages.length ? (passed / stages.length) * 100 : 0;

  return (
    <div>
      <PageHeader eyebrow="الأربعون النووية" title="رحلة الأربعين">
        حديث في كل مرحلة: ادرسه ثم أنهِ تدريب المرحلة بأكثر من {num(threshold)}٪ لتُفتح التالية. وبعد كل سبع مراحل مجتازة يُفتح امتحان المجموعة: خمسة أحاديث عشوائية منها.
      </PageHeader>
      <div className="mb-6 flex flex-wrap gap-3">
        {current && <Link href={`/student/learn/nawawi/${current.number}`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-secondary px-6 py-3 font-ui font-bold text-secondary-foreground shadow-[0_4px_0_hsl(24_90%_20%)] transition active:translate-y-1 active:shadow-none" data-testid="link-resume-stage">تابع المرحلة {num(current.number)} <ArrowLeft size={16} /></Link>}
        <Link href="/student/study/nawawi" className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-card px-5 py-3 font-ui text-sm font-semibold hover:bg-muted" data-testid="link-fullbook"><BookOpen size={16} />الكتاب كاملاً والتقارير</Link>
      </div>
      {map.isLoading ? (
        <div className="mx-auto grid max-w-md gap-5">{Array.from({ length: 6 }, (_, i) => <SkeletonBlock key={i} className="h-[4.5rem] w-[4.5rem] rounded-full" />)}</div>
      ) : map.isError ? <ErrorState message="تعذّر تحميل الخريطة." onRetry={() => map.refetch()} />
        : !stages.length ? <EmptyState icon={<BookMascot size={72} mood="rest" />} title="لا مراحل بعد">ستظهر المراحل عند نشرها.</EmptyState> : (
        <div className="paper-card mx-auto max-w-2xl overflow-hidden px-3 py-6 sm:px-8">
          <div className="mb-4 flex items-center gap-3">
            <p className="shrink-0 font-ui text-sm font-semibold text-muted-foreground" data-testid="text-map-progress">اجتزت {num(passed)} من {num(stages.length)} مرحلة</p>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={stages.length} aria-valuenow={passed} aria-label="التقدم في المراحل">
              <div className="h-full rounded-full bg-secondary transition-[width] duration-700" style={{ width: `${pct}%` }} />
            </div>
          </div>
          {!current && passed === stages.length && <JourneyGuide mood="cheer" message="أتممت المراحل كلها. يمكنك مراجعة الأحاديث وإعادة امتحانات المجموعات." />}
          <ol className="relative">
            {stages.map((s, i) => {
              const sectionStart = i % SECTION === 0;
              const group = stages.slice(i, i + SECTION);
              return (
                <Fragment key={s.number}>
                  {sectionStart && <SectionBanner from={group[0].number} to={group[group.length - 1].number} passed={group.filter((g) => g.status === 'passed').length} total={group.length} />}
                  <StageNode stage={s} index={i} />
                  {(i + 1) % SECTION === 0 && <CheckpointNode group={(i + 1) / SECTION} from={stages[i + 1 - SECTION].number} to={s.number} open={stages.slice(i + 1 - SECTION, i + 1).every((g) => g.status === 'passed')} />}
                  {s.status === 'current' && (
                    <li className="list-none">
                      <JourneyGuide message={s.number === 1 ? 'بسم الله، نبدأ بالحديث الأول. خطوة بعد خطوة.' : `أنت هنا. أتقن هذا الحديث بأكثر من ${num(threshold)}٪ لتُفتح التالية.`} />
                    </li>
                  )}
                </Fragment>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

function CheckpointNode({ group, from, to, open }: { group: number; from: number; to: number; open: boolean }) {
  const body = (
    <>
      <span className={cn('grid h-16 w-16 shrink-0 rotate-45 place-items-center rounded-2xl border-4', open ? 'border-secondary bg-secondary text-secondary-foreground shadow-[0_5px_0_hsl(24_90%_20%)]' : 'border-muted bg-muted text-muted-foreground')}>
        <span className="-rotate-45">{open ? <GraduationCap size={26} /> : <Lock size={22} />}</span>
      </span>
      <span className="min-w-0 text-start">
        <span className="block font-display text-lg font-bold">امتحان المجموعة {num(group)}</span>
        <span className="block font-ui text-xs text-muted-foreground">{open ? `خمسة أحاديث عشوائية من ${num(from)}–${num(to)}` : `يُفتح بعد اجتياز المراحل ${num(from)}–${num(to)}`}</span>
      </span>
    </>
  );
  const cls = 'mx-auto my-6 flex w-fit items-center gap-5 rounded-3xl border-2 border-dashed px-5 py-4';
  return (
    <li className="list-none" data-testid={`checkpoint-node-${group}`}>
      {open
        ? <Link href={`/student/learn/nawawi/checkpoint/${group}`} className={cn(cls, 'border-secondary/50 bg-secondary/5 transition hover:bg-secondary/10')} data-testid={`link-checkpoint-${group}`}>{body}</Link>
        : <div className={cn(cls, 'border-muted-foreground/30 opacity-80')} aria-disabled="true">{body}</div>}
    </li>
  );
}
