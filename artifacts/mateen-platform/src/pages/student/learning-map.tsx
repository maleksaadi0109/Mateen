import { Link, useParams } from 'wouter';
import { getGetLearningMapQueryKey, useGetLearningMap } from '@workspace/api-client-react';
import { Check, Lock, ArrowLeft, BookOpen, FileText } from 'lucide-react';
import { EmptyState, ErrorState, PageHeader, SkeletonBlock } from '@/components/mateen/bits';
import { num, usePageMeta } from '@/lib/mateen';

export function useNawawiMap() {
  return useGetLearningMap('nawawi', { query: { queryKey: getGetLearningMapQueryKey('nawawi'), refetchOnMount: 'always', refetchOnWindowFocus: true } });
}

export default function LearningMapPage() {
  const { textId } = useParams<{ textId: string }>();
  usePageMeta('خريطة الأربعين | مَتِين', 'مراحل الأربعين النووية: حديث في كل مرحلة، وامتحان يفتح ما بعده.');
  const map = useNawawiMap();
  if (textId !== 'nawawi') return <EmptyState title="هذا المتن قريباً">لا خريطة له بعد. <Link href="/student/tracks" className="font-bold text-secondary">المسارات</Link></EmptyState>;

  const stages = map.data?.stages ?? [];
  const passed = stages.filter((s) => s.status === 'passed').length;
  const current = stages.find((s) => s.status === 'current');
  return (
    <div>
      <PageHeader eyebrow="الأربعون النووية" title="خريطة المراحل">
        حديث في كل مرحلة: ادرسه، تدرّب على تسميعه، ثم امتحنه. تُفتح المرحلة التالية عند بلوغ نحو {num(map.data?.threshold ?? 90)}٪.
      </PageHeader>
      <div className="mb-6 flex flex-wrap gap-3">
        {current && <Link href={`/student/learn/nawawi/${current.number}`} className="inline-flex items-center gap-2 rounded-full bg-secondary px-6 py-3 font-ui font-bold text-secondary-foreground" data-testid="link-resume-stage">تابع المرحلة {num(current.number)} <ArrowLeft size={16} /></Link>}
        <Link href="/student/exams" className="inline-flex items-center gap-2 rounded-full border px-5 py-3 font-ui text-sm font-semibold hover:bg-muted" data-testid="link-comprehensive-exam"><FileText size={16} />الامتحان الشامل الشفهي والكتابي</Link>
        <Link href="/student/study/nawawi" className="inline-flex items-center gap-2 rounded-full border px-5 py-3 font-ui text-sm font-semibold hover:bg-muted" data-testid="link-fullbook"><BookOpen size={16} />الكتاب كاملاً والتقارير</Link>
      </div>
      {map.isLoading ? <div className="grid gap-3">{Array.from({ length: 6 }, (_, i) => <SkeletonBlock key={i} className="h-20" />)}</div>
        : map.isError ? <ErrorState message="تعذّر تحميل الخريطة." onRetry={() => map.refetch()} />
        : !stages.length ? <EmptyState title="لا مراحل بعد">ستظهر المراحل عند نشرها.</EmptyState> : (
        <>
          <p className="mb-5 font-ui text-sm text-muted-foreground" data-testid="text-map-progress">اجتزت {num(passed)} من {num(stages.length)} مرحلة</p>
          <ol className="relative mx-auto max-w-xl">
            {stages.map((s, i) => {
              const off = ['me-0', 'me-16', 'me-28', 'me-16'][i % 4];
              const node = (
                <div className={`flex items-center gap-4 ${off}`}>
                  <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-full border-4 font-display text-xl font-bold transition ${
                    s.status === 'passed' ? 'border-secondary bg-secondary text-secondary-foreground'
                    : s.status === 'current' ? 'border-secondary bg-card text-secondary shadow-[0_0_0_6px_hsl(var(--secondary)/.15)]'
                    : 'border-border bg-muted text-muted-foreground'}`}>
                    {s.status === 'passed' ? <Check size={24} /> : s.status === 'locked' ? <Lock size={20} /> : num(s.number)}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-ui text-xs font-semibold text-muted-foreground">المرحلة {num(s.number)}{s.bestPercent != null && ` · أفضل نتيجة ${num(s.bestPercent)}٪`}</span>
                    <span className={`block truncate font-arabic text-lg ${s.status === 'locked' ? 'text-muted-foreground' : ''}`}>{s.title}</span>
                  </span>
                </div>
              );
              return (
                <li key={s.number} className="py-2" data-testid={`stage-${s.number}`} data-status={s.status}>
                  {s.status === 'locked' ? <div aria-disabled="true" className="opacity-70">{node}</div>
                    : <Link href={`/student/learn/nawawi/${s.number}`} className="block rounded-2xl p-1 transition hover:-translate-x-1" data-testid={`link-stage-${s.number}`}>{node}</Link>}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
