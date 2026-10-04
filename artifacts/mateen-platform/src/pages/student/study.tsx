import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearch } from 'wouter';
import { getGetCatalogQueryKey, getGetProgressQueryKey, getGetDashboardQueryKey, getGetStudyTextQueryKey, useGetCatalog, useGetProgress, useGetStudyText, useSaveProgress, type StudyProgress } from '@workspace/api-client-react';
import { ArrowRight, BarChart3, Library, Lock } from 'lucide-react';
import { EmptyState, ErrorState, LoadingList, Notice } from '@/components/mateen/bits';
import { usePageMeta } from '@/lib/mateen';
import RecitationBook from '@/components/mateen/recitation-book';

export type StudyAssistantContext = {
  textId: string;
  hadith: { number: number; title: string; text: string };
  selected: string | null;
  wordRequest: number;
  onBusyChange: (busy: boolean) => void;
};

export default function StudyPage({ assistant }: { assistant?: (ctx: StudyAssistantContext) => ReactNode } = {}) {
  const { textId = 'nawawi' } = useParams<{ textId: string }>();
  usePageMeta('الدراسة | مَتِين', 'اقرأ الأربعين النووية كاملة صفحة صفحة، ثم سمّعها لتظهر كلماتها مع صوتك.');
  const search = useSearch();
  const catalog = useGetCatalog({ query: { enabled: true, queryKey: getGetCatalogQueryKey() } });
  const entry = catalog.data?.find((t) => t.id === textId);
  const locked = !!entry && entry.status !== 'available';
  const text = useGetStudyText(textId, { query: { enabled: !!catalog.data && !locked, queryKey: getGetStudyTextQueryKey(textId), retry: false } });
  const progress = useGetProgress({ query: { enabled: true, queryKey: getGetProgressQueryKey() } });
  const qc = useQueryClient();
  const save = useSaveProgress();
  const saving = useRef(false);
  const [saveError, setSaveError] = useState<number | null>(null);
  const [mode, setModeState] = useState<'read' | 'recite'>('read');
  const [active, setActive] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [wordRequest, setWordRequest] = useState(0);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const setMode = (m: 'read' | 'recite') => { setModeState(m); if (m === 'recite') setSelected(null); };
  // Context changes (another hadith comes into view) always drop the selected passage.
  const activeRef = useRef<number | null>(null);
  const changeActive = (n: number) => {
    if (activeRef.current === n) return;
    activeRef.current = n; setActive(n); setSelected(null);
  };
  const hadiths = useMemo(() => text.data?.hadiths ?? [], [text.data]);
  const savePosition = (number: number) => {
    if (saving.current || !hadiths.some(h => h.number === number)) return;
    const current = progress.data?.find(p => p.textId === textId);
    if (current?.currentHadith === number) { setSaveError(null); return; }
    saving.current = true;
    setSaveError(null);
    save.mutate({ textId, data: {
      currentHadith: number,
      completedIds: current?.completedIds ?? [],
      bookmarkedIds: current?.bookmarkedIds ?? [],
    } }, {
      onSuccess: saved => {
        saving.current = false;
        qc.setQueryData<StudyProgress[]>(getGetProgressQueryKey(), old => [
          ...(old ?? []).filter(p => p.textId !== saved.textId), saved,
        ]);
        qc.invalidateQueries({ queryKey: getGetProgressQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      },
      onError: () => { saving.current = false; setSaveError(number); },
    });
  };

  if (catalog.isLoading || (!locked && (text.isLoading || progress.isLoading))) return <LoadingList rows={3} />;
  if (catalog.isError) return <ErrorState onRetry={() => catalog.refetch()} />;
  if (!entry || locked) {
    return (
      <EmptyState icon={<Lock size={28} />} title={entry ? `${entry.title}: قريباً` : 'متن غير موجود'}
        action={<Link href="/student/tracks" className="rounded-full bg-primary px-6 py-2.5 font-ui font-bold text-primary-foreground">عودة إلى المسارات</Link>}>
        {entry ? 'هذا المتن غير منشور بعد ولا يمكن دراسته.' : 'لا يوجد متن بهذا المعرّف في الفهرس.'}
      </EmptyState>
    );
  }
  if (text.isError || !text.data) return <ErrorState message="تعذّر تحميل النص." onRetry={() => text.refetch()} />;
  if (progress.isError) return <ErrorState message="تعذّر تحميل تقدمك المحفوظ." onRetry={() => progress.refetch()} />;
  const t = text.data;
  if (hadiths.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-bold">{t.title}</h1>
        <Notice title="النص غير متاح الآن">تعذّر استرجاع النص من مصدره، فلا يعرض الخادم أحاديث. لم نعرض بديلاً غير موثّق. حاول لاحقاً.</Notice>
        <button onClick={() => text.refetch()} className="rounded-full bg-primary px-6 py-2.5 font-ui font-bold text-primary-foreground" data-testid="button-retry-text">إعادة المحاولة</button>
      </div>
    );
  }

  const wanted = Number(new URLSearchParams(search).get('h'));
  const saved = progress.data?.find((x) => x.textId === textId)?.currentHadith;
  const initial = wanted > 0 && hadiths.some((h) => h.number === wanted) ? wanted : saved && hadiths.some((h) => h.number === saved) ? saved : hadiths[0].number;

  const activeHadith = hadiths.find(h => h.number === (active ?? initial));
  const showAssistant = !!assistant && mode === 'read';

  return (
    <div className="space-y-4">
      {mode === 'read' && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav className="flex flex-wrap items-center gap-1" aria-label="تنقل الدراسة">
            <Link href="/student/tracks" className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 font-ui text-xs text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="link-back-tracks"><ArrowRight size={14} />المسارات</Link>
            <Link href="/student/study" className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 font-ui text-xs text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="link-study-library"><Library size={14} />المكتبة</Link>
            <Link href="/student/study/reports" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-secondary/40 px-3 font-ui text-xs font-bold text-secondary hover:bg-secondary/10" data-testid="link-study-reports"><BarChart3 size={14} />تقارير التسميع</Link>
          </nav>
          <h1 className="font-display text-xl font-bold sm:text-2xl" data-testid="text-study-title">{t.title}</h1>
        </div>
      )}
      {saveError !== null && <div role="alert" className="rounded-xl border p-3 font-ui text-sm">
        تعذّر حفظ موضع الدراسة. يمكنك متابعة القراءة، لكن موضع العودة لم يتحدث.
        <button className="mx-2 min-h-10 underline" onClick={() => savePosition(saveError)}>إعادة الحفظ</button>
      </div>}
      <div className={assistant ? 'grid items-start gap-5 lg:grid-cols-[minmax(19rem,24rem)_minmax(0,1fr)]' : ''} dir={assistant ? 'ltr' : undefined}>
        <div dir="rtl" className={assistant ? `min-w-0 lg:order-2 ${showAssistant ? '' : 'lg:col-span-2'}` : undefined}>
          <RecitationBook key={textId} hadiths={hadiths} initialHadith={initial} sourceStatus={t.sourceStatus} onModeChange={setMode} onNavigate={savePosition} navigationPending={save.isPending}
            {...(assistant ? {
              onActiveHadith: changeActive,
              selection: { selected, busy: assistantBusy, onSelect: (n: number, text: string | null) => { changeActive(n); setSelected(text); }, onAsk: () => setWordRequest(x => x + 1) },
            } : {})} />
        </div>
        {showAssistant && activeHadith && (
          <aside dir="rtl" className="min-w-0 lg:order-1" data-testid="study-assistant-column">
            {assistant({ textId, hadith: { number: activeHadith.number, title: activeHadith.title, text: activeHadith.text }, selected, wordRequest, onBusyChange: setAssistantBusy })}
          </aside>
        )}
      </div>
    </div>
  );
}
