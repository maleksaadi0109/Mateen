import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearch } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetCatalogQueryKey, getGetDashboardQueryKey, getGetProgressQueryKey, getGetStudyTextQueryKey,
  useGetCatalog, useGetProgress, useGetStudyText, useSaveProgress, useListScheduledReviews, getListScheduledReviewsQueryKey,
} from '@workspace/api-client-react';
import type { StudyProgress } from '@workspace/api-client-react';
import { Bookmark, BookmarkCheck, CheckCircle2, Circle, ChevronRight, ChevronLeft, ExternalLink, Lock, Minus, Plus, Search, X } from 'lucide-react';
import { EmptyState, ErrorState, LoadingList, Notice, useLocalNumber } from '@/components/mateen/bits';
import { normalizeArabic, num, usePageMeta } from '@/lib/mateen';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import RecitationRecorder from '@/components/mateen/recitation-recorder';

type Snap = { current: number; completed: number[]; bookmarked: number[] };

export default function StudyPage() {
  const { textId = 'nawawi' } = useParams<{ textId: string }>();
  usePageMeta('الدراسة | مَتِين', 'قراءة النص بتشكيله مع حفظ موضع التوقف والعلامات.');
  const search = useSearch();
  const qc = useQueryClient();
  const { toast } = useToast();
  const catalog = useGetCatalog({ query: { enabled: true, queryKey: getGetCatalogQueryKey() } });
  const entry = catalog.data?.find((t) => t.id === textId);
  const locked = !!entry && entry.status !== 'available';
  const text = useGetStudyText(textId, { query: { enabled: !!catalog.data && !locked, queryKey: getGetStudyTextQueryKey(textId), retry: false } });
  const progress = useGetProgress({ query: { enabled: true, queryKey: getGetProgressQueryKey() } });
  const scheduledReviews = useListScheduledReviews({ query: { enabled: textId === 'nawawi' && !locked, queryKey: getListScheduledReviewsQueryKey() } });
  const save = useSaveProgress();
  const mutateRef = useRef(save.mutate);
  mutateRef.current = save.mutate;
  const saveBusy = useRef(false);

  const [snap, setSnap] = useState<Snap | null>(null);
  const inited = useRef<string | null>(null);
  const [fontSize, setFontSize] = useLocalNumber('mateen-reader-font', 30);
  const [q, setQ] = useState('');
  const [listOpen, setListOpen] = useState(false);

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
  const review = t.sourceStatus === 'retrieved_pending_review';
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
  const studied = snap.completed.includes(h.id);
  const marked = snap.bookmarked.includes(h.id);
  const confirmedReviews = scheduledReviews.data?.filter((item) => item.hadithNumber === h.number) ?? [];
  const go = (i: number) => { const n = hadiths[i]; if (n && n.number !== snap.current) persist({ ...snap, current: n.number }, snap); setListOpen(false); window.scrollTo({ top: 0 }); };
  const toggle = (arr: number[], id: number) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const nq = normalizeArabic(q.trim());
  const filtered = nq ? hadiths.filter((x) => normalizeArabic(`${x.title} ${x.text}`).includes(nq)) : hadiths;

  const list = (
    <div>
      <div className="relative mb-3"><Search size={16} className="pointer-events-none absolute right-3 top-3.5 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في النص" aria-label="بحث في النص" className="w-full rounded-xl border bg-background py-2.5 pl-9 pr-9 font-ui text-sm outline-none focus:border-secondary" data-testid="input-search" />
        {q && <button onClick={() => setQ('')} className="absolute left-3 top-3" aria-label="مسح البحث"><X size={16} /></button>}
      </div>
      <ul className="max-h-[60dvh] space-y-1 overflow-y-auto" data-testid="list-hadiths">
        {filtered.length === 0 && <li className="p-4 text-center font-arabic text-muted-foreground">لا نتائج مطابقة.</li>}
        {filtered.map((x) => (
          <li key={x.id}><button onClick={() => go(hadiths.indexOf(x))} disabled={save.isPending} className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right font-ui text-sm transition disabled:opacity-50', x.id === h.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')} data-testid={`button-hadith-${x.number}`}>
            <span className="w-6 shrink-0 font-bold">{num(x.number)}</span><span className="flex-1 truncate">{x.title}</span>
            {snap.bookmarked.includes(x.id) && <Bookmark size={13} />}{snap.completed.includes(x.id) && <CheckCircle2 size={13} />}
          </button></li>
        ))}
      </ul>
    </div>
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="font-ui text-sm font-semibold text-secondary">{t.author}</p><h1 className="font-display text-3xl font-bold md:text-4xl">{t.title}</h1></div>
        <div className="flex items-center gap-1 rounded-full border bg-card p-1" role="group" aria-label="حجم الخط">
          <button onClick={() => setFontSize(Math.max(22, fontSize - 3))} className="rounded-full p-2 hover:bg-muted" aria-label="تصغير الخط" data-testid="button-font-down"><Minus size={16} /></button>
          <span className="w-10 text-center font-ui text-xs font-bold">{num(fontSize)}</span>
          <button onClick={() => setFontSize(Math.min(60, fontSize + 3))} className="rounded-full p-2 hover:bg-muted" aria-label="تكبير الخط" data-testid="button-font-up"><Plus size={16} /></button>
        </div>
      </div>
      {review && <div className="mb-6"><Notice title="بيان مصدر النص والتقييم">نُقل هذا النص من مصدره المذكور، ولم تكتمل مراجعته العلمية الشاملة بعد. مقطع التدريب أدناه مستخرج منه دون تعليقات الناشر. المقارنات الصوتية الآلية تجريبية ولا تُعتمد درجات منها؛ وتحتاج إجابات الاختبار الشفهية إلى مراجعة مخوّلة للتسجيل والنص المرجعي قبل اعتماد نتيجة المطابقة.</Notice></div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <article className="paper-card relative overflow-hidden p-6 md:p-12" aria-live="polite">
          <div className="star-pattern pointer-events-none absolute inset-0 opacity-40" />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-ui text-sm font-bold text-secondary" data-testid="text-hadith-number">الحديث {num(h.number)} من {num(hadiths.length)}</p>
              <button onClick={() => setListOpen(!listOpen)} className="rounded-full border px-4 py-1.5 font-ui text-xs font-bold lg:hidden" data-testid="button-toggle-index">الفهرس والبحث</button>
            </div>
            {listOpen && <div className="paper-card mt-4 p-4 lg:hidden">{list}</div>}
            <h2 className="mt-4 font-display text-2xl font-bold">{h.title}</h2>
            <p className="hadith-text mt-6" style={{ fontSize: fontSize, lineHeight: 2.2 }} data-testid="text-hadith">{h.text}</p>
            <a href={h.sourceUrl} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 font-ui text-sm text-muted-foreground underline underline-offset-4 hover:text-secondary" data-testid="link-source">
              المصدر: {t.title}، الصفحة المطبوعة {num(h.sourcePage)}
              {h.viewerPage && <> · صفحة العارض {num(h.viewerPage)}</>} <ExternalLink size={13} />
            </a>
            {h.reviewStatus && <p className="mt-2 font-ui text-xs text-muted-foreground" data-testid="hadith-review-status">
              {h.reviewStatus === 'approved' ? 'نسخة معتمدة علميًا ومصرّح باستخدامها' : 'نسخة غير معتمدة للتقييم'}
              {h.sourceVersionId && <> · {h.sourceVersionId}</>}
            </p>}
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => persist({ ...snap, completed: toggle(snap.completed, h.id) }, snap)} aria-pressed={studied} disabled={save.isPending}
                className={cn('inline-flex items-center gap-2 rounded-full px-6 py-3 font-ui text-sm font-bold transition', studied ? 'bg-secondary text-secondary-foreground' : 'border-2 border-secondary text-secondary hover:bg-secondary/10')} data-testid="button-studied">
                {studied ? <CheckCircle2 size={17} /> : <Circle size={17} />} {studied ? 'وسمتُه مدروساً' : 'وسم كمدروس'}
              </button>
              <button onClick={() => persist({ ...snap, bookmarked: toggle(snap.bookmarked, h.id) }, snap)} aria-pressed={marked} disabled={save.isPending}
                className={cn('inline-flex items-center gap-2 rounded-full border-2 px-6 py-3 font-ui text-sm font-bold transition', marked ? 'border-primary bg-primary text-primary-foreground' : 'border-primary/50 text-primary hover:bg-primary/10')} data-testid="button-bookmark">
                {marked ? <BookmarkCheck size={17} /> : <Bookmark size={17} />} {marked ? 'عليه علامة' : 'ضع علامة'}
              </button>
            </div>
            <p className="mt-3 font-ui text-xs text-muted-foreground">الوسم إقرار ذاتي منك بأنك درست هذا الموضع، وليس نتيجة اختبار أو حفظ.</p>
            <div className="mt-10 flex items-center justify-between border-t pt-6">
              <button onClick={() => go(idx - 1)} disabled={idx === 0 || save.isPending} className="inline-flex items-center gap-2 rounded-full border px-5 py-2.5 font-ui text-sm font-bold disabled:opacity-40" data-testid="button-prev"><ChevronRight size={16} /> السابق</button>
              <button onClick={() => go(idx + 1)} disabled={idx === hadiths.length - 1 || save.isPending} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-ui text-sm font-bold text-primary-foreground disabled:opacity-40" data-testid="button-next">التالي <ChevronLeft size={16} /></button>
            </div>
          </div>
        </article>
        <aside className="paper-card hidden h-fit p-4 lg:sticky lg:top-6 lg:block">{list}</aside>
      </div>
      <section className="paper-card mt-6 min-w-0 space-y-4 p-5 sm:p-7" aria-labelledby="recitation-reference-title">
        <h2 id="recitation-reference-title" className="font-display text-xl font-bold">المقطع المحدد للتدريب الصوتي</h2>
        <p className="font-ui text-sm text-muted-foreground">اقرأ هذا المقطع؛ ولا تُدخل سند الحديث أو تعليقات المصدر التي تقع خارجه. لا يُقيَّم النطق أو التشكيل.</p>
        {h.recitationSelection === 'selected-primary-report' && <p className="font-ui text-sm text-muted-foreground">اختير التقرير الأول من هذا الحديث فقط لهذا التدريب.</p>}
        {h.recitationText
          ? <p className="break-words font-arabic text-xl leading-loose sm:text-2xl" data-testid="text-recitation-reference">{h.recitationText}</p>
          : <Notice title="المقطع غير متاح">تعذّر تحميل المقطع المحدد. أعد تحميل النص قبل بدء التسجيل.</Notice>}
        {scheduledReviews.isError && <button type="button" onClick={() => scheduledReviews.refetch()} className="min-h-11 rounded-full border px-5 py-2 font-ui text-sm">إعادة تحميل المراجعات المصححة</button>}
        {confirmedReviews.length > 0 && <Notice title="لهذا الحديث مراجعات مبنية على أداء مصحح">
          لديك {num(confirmedReviews.length)} مراجعة محفوظة لهذا الحديث، وهي منفصلة عن علامة القراءة.
          <Link href="/student/reviews" className="mt-2 block w-fit rounded-full border px-5 py-2 font-ui font-bold">عرض المواعيد وأداء المراجعة</Link>
        </Notice>}
        <Link href="/student/exams" className="inline-flex min-h-11 items-center rounded-full border px-5 py-2 font-ui text-sm font-bold">الانتقال إلى اختبار المستوى دون اشتراط إكمال الدراسة</Link>
      </section>
      {h.recitationText && <RecitationRecorder key={`${textId}:${h.id}`} hadithNumber={h.number} />}
    </div>
  );
}
