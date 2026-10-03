import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearch } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetCatalogQueryKey, getGetDashboardQueryKey, getGetProgressQueryKey, getGetStudyTextQueryKey,
  useGetCatalog, useGetProgress, useGetStudyText, useSaveProgress,
} from '@workspace/api-client-react';
import type { StudyProgress } from '@workspace/api-client-react';
import { ArrowRight, ChevronRight, ChevronLeft, Lock } from 'lucide-react';
import { EmptyState, ErrorState, LoadingList, Notice } from '@/components/mateen/bits';
import { num, usePageMeta } from '@/lib/mateen';
import { useToast } from '@/hooks/use-toast';
import LiveRecitation from '@/components/mateen/live-recitation';

type Snap = { current: number; completed: number[]; bookmarked: number[] };

export default function StudyPage() {
  const { textId = 'nawawi' } = useParams<{ textId: string }>();
  usePageMeta('الدراسة | مَتِين', 'تصفح صفحات الكتاب الأصلية واختر حديثاً، ثم ابدأ التسميع لتظهر كلماته مع صوتك.');
  const search = useSearch();
  const qc = useQueryClient();
  const { toast } = useToast();
  const catalog = useGetCatalog({ query: { enabled: true, queryKey: getGetCatalogQueryKey() } });
  const entry = catalog.data?.find((t) => t.id === textId);
  const locked = !!entry && entry.status !== 'available';
  const text = useGetStudyText(textId, { query: { enabled: !!catalog.data && !locked, queryKey: getGetStudyTextQueryKey(textId), retry: false } });
  const progress = useGetProgress({ query: { enabled: true, queryKey: getGetProgressQueryKey() } });
  const save = useSaveProgress();
  const mutateRef = useRef(save.mutate);
  mutateRef.current = save.mutate;
  const saveBusy = useRef(false);

  const [snap, setSnap] = useState<Snap | null>(null);
  const inited = useRef<string | null>(null);
  const [mode, setMode] = useState<'read' | 'recite'>('read');

  const hadiths = useMemo(() => text.data?.hadiths ?? [], [text.data]);

  useEffect(() => {
    if (inited.current === textId || !progress.isSuccess || !text.isSuccess) return;
    inited.current = textId;
    const p = progress.data.find((x) => x.textId === textId);
    const wanted = Number(new URLSearchParams(search).get('h'));
    const first = hadiths[0]?.number ?? 1;
    const cur = wanted > 0 && hadiths.some((h) => h.number === wanted) ? wanted : p && hadiths.some((h) => h.number === p.currentHadith) ? p.currentHadith : first;
    setSnap({ current: cur, completed: p?.completedIds ?? [], bookmarked: p?.bookmarkedIds ?? [] });
  }, [progress.isSuccess, progress.data, text.isSuccess, textId, hadiths, search]);

  const persist = useCallback((next: Snap, prev: Snap) => {
    if (saveBusy.current) return;
    saveBusy.current = true;
    setSnap(next);
    mutateRef.current(
      { textId, data: { currentHadith: next.current, completedIds: next.completed, bookmarkedIds: next.bookmarked } },
      {
        onSuccess: (saved) => {
          saveBusy.current = false;
          qc.setQueryData<StudyProgress[]>(getGetProgressQueryKey(), (old) => [...(old ?? []).filter((p) => p.textId !== saved.textId), saved]);
          qc.invalidateQueries({ queryKey: getGetProgressQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        },
        onError: () => { saveBusy.current = false; setSnap(prev); toast({ title: 'تعذّر حفظ تقدمك', description: 'لم يُحفظ التغيير. حاول مرة أخرى.', variant: 'destructive' }); },
      },
    );
  }, [qc, textId, toast]);

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
  if (!snap) return <LoadingList rows={2} />;

  const idx = Math.max(0, hadiths.findIndex((h) => h.number === snap.current));
  const h = hadiths[idx];
  const go = (i: number) => { const n = hadiths[i]; if (n && n.number !== snap.current) persist({ ...snap, current: n.number }, snap); window.scrollTo({ top: 0 }); };

  return (
    <div className="space-y-4">
      {mode === 'read' && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card/80 px-2 py-1.5 font-ui text-xs shadow-sm" data-testid="study-toolbar">
          <Link href="/student/tracks" className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="link-back-tracks"><ArrowRight size={14} />المسارات</Link>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
            <button onClick={() => go(idx - 1)} disabled={idx === 0 || save.isPending} aria-label="الحديث السابق" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border disabled:opacity-40" data-testid="button-prev"><ChevronRight size={16} /></button>
            <select value={h.number} onChange={(e) => go(hadiths.findIndex((x) => x.number === Number(e.target.value)))} disabled={save.isPending} aria-label="اختر الحديث"
              className="min-h-9 min-w-0 max-w-[60vw] truncate rounded-full border bg-background px-3 font-bold outline-none focus:border-secondary sm:max-w-xs" data-testid="select-hadith">
              {hadiths.map((x) => <option key={x.id} value={x.number}>{num(x.number)}. {x.title}</option>)}
            </select>
            <button onClick={() => go(idx + 1)} disabled={idx === hadiths.length - 1 || save.isPending} aria-label="الحديث التالي" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border disabled:opacity-40" data-testid="button-next"><ChevronLeft size={16} /></button>
          </div>
          <span className="px-3 font-bold text-secondary" data-testid="text-hadith-number">
            الحديث {num(h.number)} من {num(hadiths.length)}
          </span>
        </div>
      )}
      {h.recitationText
        ? <LiveRecitation key={`${textId}:${h.id}`} text={h.recitationText} fontSize={30} title={h.title} hadithId={textId === 'nawawi' ? h.id : undefined} onModeChange={setMode} />
        : <Notice title="المقطع غير متاح">تعذّر تحميل مقطع التسميع. أعد تحميل النص.</Notice>}
    </div>
  );
}
