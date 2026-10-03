import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearch } from 'wouter';
import { getGetCatalogQueryKey, getGetProgressQueryKey, getGetDashboardQueryKey, getGetStudyTextQueryKey, useGetCatalog, useGetProgress, useGetStudyText, useSaveProgress, type StudyProgress } from '@workspace/api-client-react';
import { ArrowRight, Lock } from 'lucide-react';
import { EmptyState, ErrorState, LoadingList, Notice } from '@/components/mateen/bits';
import { usePageMeta } from '@/lib/mateen';
import RecitationBook from '@/components/mateen/recitation-book';

export default function StudyPage() {
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
  const [mode, setMode] = useState<'read' | 'recite'>('read');
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

  return (
    <div className="space-y-4">
      {mode === 'read' && (
        <div className="flex items-center justify-between gap-2">
          <Link href="/student/tracks" className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 font-ui text-xs text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="link-back-tracks"><ArrowRight size={14} />المسارات</Link>
          <h1 className="font-display text-xl font-bold sm:text-2xl" data-testid="text-study-title">{t.title}</h1>
        </div>
      )}
      {saveError !== null && <div role="alert" className="rounded-xl border p-3 font-ui text-sm">
        تعذّر حفظ موضع الدراسة. يمكنك متابعة القراءة، لكن موضع العودة لم يتحدث.
        <button className="mx-2 min-h-10 underline" onClick={() => savePosition(saveError)}>إعادة الحفظ</button>
      </div>}
      <RecitationBook key={textId} hadiths={hadiths} initialHadith={initial} sourceStatus={t.sourceStatus} onModeChange={setMode} onNavigate={savePosition} navigationPending={save.isPending} />
    </div>
  );
}
