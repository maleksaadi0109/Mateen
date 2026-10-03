import { useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '@clerk/react';
import { Flag, BookOpen, ChevronLeft, ChevronRight, Eye, Lightbulb, Mic, MoreHorizontal, Pause, RotateCcw, ShieldAlert } from 'lucide-react';
import { useLiveRecitation } from '@/hooks/use-live-recitation';
import { buildRecitationBook } from '@/lib/recitation-book';
import { analyzeRecitation } from '@/lib/recitation-analysis';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { num } from '@/lib/mateen';
import { cn } from '@/lib/utils';
import { useRecitationHistory, useArabicSpeech, RecitationHistory } from './recitation-history';
import { RecitationReport, type ReportSnapshot } from './recitation-report';
import { AccountRecitationHistory, useAccountReports, reportInput } from './account-recitation-history';

type BookHadith = { id: number; number: number; title: string; text: string; sourceUrl: string; sourcePage: number; reviewStatus?: string };
type BookProps = { hadiths: BookHadith[]; initialHadith?: number; sourceStatus?: string; navigationPending?: boolean; onNavigate?: (number: number) => void; onModeChange?: (m: 'read' | 'recite') => void };

export default function RecitationBook(props: BookProps) {
  const { user } = useUser();
  const book = useMemo(() => {
    try { return buildRecitationBook(props.hadiths); }
    catch { return null; }
  }, [props.hadiths]);
  if (!book) return <p role="alert" className="rounded-xl border p-5 font-ui">تعذّر إعداد صفحات التسميع لأن بيانات النص غير مكتملة. أعد تحميل الصفحة.</p>;
  return <RecitationBookContent key={`${user?.id ?? 'guest'}:${book.text}`} {...props} book={book} />;
}

function RecitationBookContent({ hadiths, initialHadith, sourceStatus, onModeChange, onNavigate, navigationPending, book }: BookProps & {book: ReturnType<typeof buildRecitationBook>}) {
  const r = useLiveRecitation(book.text, { continuousFeedback: true });
  const { user, isLoaded: userLoaded } = useUser();
  const userId = userLoaded && user ? user.id : null;
  const history = useRecitationHistory(userId);
  const account = useAccountReports(userId);
  const newAttemptId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const [attemptId, setAttemptId] = useState(newAttemptId);
  const stopMicRef = useRef<() => void>(() => {});
  const speech = useArabicSpeech(() => stopMicRef.current());
  const [report, setReport] = useState<ReportSnapshot | null>(null);
  const issueAt = useMemo(() => { const m = new Map<number, typeof r.issues[number]>(); for (const i of r.issues) m.set(i.index, i); return m; }, [r.issues]);
  const total = r.words.length;
  const pageOf = (i: number) => Math.max(0, book.pages.findIndex((p) => i >= p.start && i < p.end));

  const initialHadithRef = useRef(initialHadith);
  const initialIdx = useMemo(() => {
    const h = hadiths.find((x) => x.number === initialHadithRef.current);
    return h ? (book.hadithStarts[h.id] ?? 0) : 0;
  }, [book, hadiths]);
  const [pageIdx, setPageIdx] = useState(() => pageOf(initialIdx));
  const [mode, setModeState] = useState<'read' | 'recite'>('read');
  const modeCb = useRef(onModeChange);
  modeCb.current = onModeChange;
  const setMode = (m: 'read' | 'recite') => { setModeState(m); modeCb.current?.(m); };
  const reading = mode === 'read';
  const [consented, setConsented] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [agree, setAgree] = useState(false);
  const [manual, setManual] = useState(false);
  const [hint, setHint] = useState(false);
  const [more, setMore] = useState(false);

  const seekRef = useRef(r.seek);
  seekRef.current = r.seek;
  const stopRef = useRef(r.stop);
  stopRef.current = r.stop;
  stopMicRef.current = r.stop;
  useEffect(() => {
    seekRef.current(initialIdx);
    setPageIdx(pageOf(initialIdx));
  }, [initialIdx]);
  const cancelSpeechRef = useRef(speech.cancel);
  cancelSpeechRef.current = speech.cancel;
  useEffect(() => () => { stopRef.current(); cancelSpeechRef.current(); modeCb.current?.('read'); }, []);

  // Follow the reciter: frontier = furthest committed or provisional word.
  const lastInterim = r.interimIndices.length ? Math.max(...r.interimIndices) + 1 : 0;
  const frontier = Math.max(r.cursor, lastInterim);
  useEffect(() => {
    if (reading || manual || total === 0) return;
    setPageIdx(pageOf(Math.min(frontier, total - 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontier, reading, total, manual]);
  const articleRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!reading) articleRef.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
  }, [pageIdx]);
  useEffect(() => { setHint(false); }, [r.mismatchIndex]);

  const page = book.pages[pageIdx] ?? book.pages[0];
  const interim = useMemo(() => new Set(r.interimIndices), [r.interimIndices]);
  const pageRead = page ? r.revealed.slice(page.start, page.end).filter(Boolean).length : 0;
  const pageLen = page ? page.end - page.start : 0;
  const finished = total > 0 && r.cursor >= total && !manual;
  const unsupported = r.supported === false;
  const pending = sourceStatus !== 'approved' || hadiths.some((h) => h.reviewStatus && h.reviewStatus !== 'approved');

  const canFinish = !manual && !r.finishing && (r.attemptedCount > 0 || r.listening);
  const finishReview = async () => {
    if (!canFinish) return;
    speech.cancel();
    const summary = await r.finish();
    if (!summary) return;
    setReport({ attemptId, priorCounts: history.countsExcluding(attemptId), matched: summary.matchedCount, attempted: summary.attemptedCount, issues: summary.issues,
      analyses: analyzeRecitation(book, summary.matchedIndices, summary.issues) });
  };
  const discardReport = () => setReport(null);
  const freshAttempt = () => { setReport(null); setAttemptId(newAttemptId()); };
  const jumpTo = (wordIdx: number) => {
    if (navigationPending) return;
    freshAttempt(); speech.cancel();
    r.seek(wordIdx); setManual(false); setPageIdx(pageOf(wordIdx));
    const segment = book.pages[pageOf(wordIdx)]?.segments.find(s => wordIdx >= s.start && wordIdx < s.end);
    if (segment) onNavigate?.(segment.hadithNumber);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const goPage = (i: number) => { const p = book.pages[i]; if (p) jumpTo(p.start); };
  const begin = () => { setManual(false); setMode('recite'); r.start(); };
  const requestStart = () => { if (consented) begin(); else { setAgree(false); setConsentOpen(true); } };
  const confirmStart = () => { if (!agree) return; setConsented(true); setConsentOpen(false); begin(); };
  const resetPage = () => { freshAttempt(); speech.cancel(); if (page) { r.seek(page.start); setManual(false); } };
  const revealPage = () => { r.stop(); setManual(true); };
  const backToReading = () => { r.seek(page.start); speech.cancel(); freshAttempt(); setManual(false); setMode('read'); };
  const stored = report ? report.issues.slice(0, 100) : [];
  const reportSaved = !!report && history.entries.some(e =>
    e.attemptId === report.attemptId && e.matched === report.matched && e.attempted === report.attempted &&
    e.issues.length === stored.length && e.issues.every((issue, i) =>
      issue.index === stored[i].index && issue.kind === stored[i].kind &&
      issue.expected === stored[i].expected.slice(0, 60) && issue.heard === stored[i].heard.slice(0, 60)));
  const currentHadith = page?.segments.find(s => r.cursor >= s.start && r.cursor < s.end) ?? page?.segments[0];

  if (!page) return null;

  if (report) {
    return (
      <RecitationReport report={report} onClose={discardReport} canSave={!report.accountReportId && !!userId && !manual && !!report.attempted} alreadySaved={reportSaved} speech={speech}
        userId={userId} onAccountSave={async () => { await account.save(reportInput(report)); }}
        onSave={() => history.save({ attemptId: report.attemptId, matched: report.matched, attempted: report.attempted,
          issues: stored.map(({ index, expected, heard, kind }) => ({ index, expected, heard, kind })),
          analyses: report.analyses.map(({ issues: _issues, ...summary }) => summary) })} />
    );
  }

  return (
    <div className="space-y-4" data-testid="recitation-book">
      {/* Navigator */}
      <div className="sticky top-2 z-20 mx-auto flex max-w-[860px] flex-col-reverse items-stretch gap-2 rounded-2xl border bg-card/90 p-2 font-ui text-xs shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between" data-testid="book-navigator">
        <div className="flex items-center justify-between gap-1">
          <button onClick={() => goPage(pageIdx - 1)} disabled={pageIdx === 0} aria-label="الصفحة السابقة" className="grid h-10 w-10 place-items-center rounded-full border bg-background hover:border-secondary/60 disabled:opacity-40" data-testid="button-book-prev-page"><ChevronRight size={16} /></button>
          <span className="min-w-[7.5rem] text-center font-bold" aria-live="polite" data-testid="text-book-page">صفحة {num(page.number)} من {num(book.pages.length)}</span>
          <button onClick={() => goPage(pageIdx + 1)} disabled={pageIdx >= book.pages.length - 1} aria-label="الصفحة التالية" className="grid h-10 w-10 place-items-center rounded-full border bg-background hover:border-secondary/60 disabled:opacity-40" data-testid="button-book-next-page"><ChevronLeft size={16} /></button>
        </div>
        <select value={currentHadith?.hadithId ?? ''} onChange={(e) => { const id = Number(e.target.value); jumpTo(book.hadithStarts[id] ?? 0); }}
          aria-label="انتقل إلى حديث" className="min-h-10 min-w-0 max-w-full flex-1 truncate rounded-full border bg-background px-3 font-bold outline-none focus:border-secondary sm:max-w-xs" data-testid="select-book-hadith">
          {hadiths.map((h) => <option key={h.id} value={h.id}>{num(h.number)}. {h.title}</option>)}
        </select>
      </div>

      {/* Controls: one primary action, quiet secondary actions */}
      <div className="mx-auto flex max-w-[860px] flex-col items-center gap-3" role="toolbar" aria-label="أدوات التسميع">
        {reading ? (
          unsupported ? (
            <div className="flex max-w-xl gap-2 rounded-xl border bg-muted/50 p-3 font-ui text-xs" data-testid="text-book-unsupported">
              <ShieldAlert size={16} className="mt-0.5 shrink-0 text-secondary" />
              <p>التسميع المباشر غير متاح في متصفحك. يمكنك مواصلة القراءة.</p>
            </div>
          ) : (
            <button type="button" onClick={requestStart} disabled={r.supported === null || finished}
              className="group inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full bg-primary py-3 pl-7 pr-3 font-ui text-base font-bold text-primary-foreground shadow-[0_14px_30px_-14px_hsl(var(--primary)/0.8)] transition-transform hover:-translate-y-0.5 disabled:opacity-40 motion-reduce:transition-none sm:w-auto"
              data-testid="button-book-start">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-secondary-foreground"><Mic size={18} /></span>
              سمّع من هذا الموضع
            </button>
          )
        ) : (
          <>
            <div className="flex w-full items-center justify-center gap-3">
              {r.listening
                ? <button type="button" onClick={r.stop} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-secondary px-6 font-ui text-sm font-bold text-secondary-foreground shadow-[0_14px_30px_-16px_hsl(var(--secondary)/0.9)] sm:flex-none" data-testid="button-book-pause"><Pause size={16} />إيقاف مؤقت</button>
                : <button type="button" onClick={requestStart} disabled={unsupported || manual || finished} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-6 font-ui text-sm font-bold text-primary-foreground shadow-[0_14px_30px_-16px_hsl(var(--primary)/0.8)] disabled:opacity-40 sm:flex-none" data-testid="button-book-resume"><Mic size={16} />متابعة التسميع</button>}
              {r.listening && <span className="inline-flex items-center gap-1.5 font-ui text-xs font-bold text-secondary" role="status" data-testid="status-book-listening"><span className="h-2 w-2 animate-pulse rounded-full bg-secondary motion-reduce:animate-none" />يستمع الآن</span>}
            </div>
            <div className="flex w-full flex-col items-center gap-1">
              <button type="button" onClick={finishReview} disabled={!canFinish} className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-primary/70 bg-card px-5 font-ui text-sm font-bold text-primary hover:bg-primary/5 disabled:opacity-40" data-testid="button-book-finish"><Flag size={15} />إنهاء ومراجعة المحاولة</button>
              <p className="font-ui text-[11px] text-muted-foreground" data-testid="text-book-finish-note">{manual ? 'الإظهار اليدوي لا يُراجَع ولا يُحفظ. أعد الصفحة أولاً ثم سمّع.' : r.attemptedCount === 0 ? 'سمّع بعض الكلمات أولاً لتظهر المراجعة.' : 'الإيقاف المؤقت يتيح المتابعة؛ الإنهاء يعرض الملخص. يُحتسب ما اعتُمد من التعرّف فقط.'}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1 font-ui text-xs font-bold text-muted-foreground">
              <button type="button" onClick={resetPage} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 hover:bg-muted hover:text-foreground" data-testid="button-book-reset"><RotateCcw size={14} />إعادة الصفحة</button>
              <button type="button" onClick={backToReading} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 hover:bg-muted hover:text-foreground" data-testid="button-book-read"><BookOpen size={14} />القراءة</button>
              <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} aria-controls="book-more-actions" className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 hover:bg-muted hover:text-foreground" data-testid="button-book-more"><MoreHorizontal size={14} />{more ? 'أقل' : 'المزيد'}</button>
            </div>
            {more && (
              <div id="book-more-actions" className="flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-dashed bg-card/60 p-3 text-center font-ui text-[11px] text-muted-foreground">
                <button type="button" onClick={revealPage} disabled={manual} className="inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-xs font-bold text-foreground disabled:opacity-40" data-testid="button-book-reveal"><Eye size={14} />إظهار الصفحة كاملة</button>
                <p>الإظهار اليدوي يوقف التسميع ولا يُحتسب تسميعاً.</p>
              </div>
            )}
          </>
        )}
      </div>
      {reading && <p className="text-center font-ui text-xs text-muted-foreground" data-testid="text-book-read-first">اقرأ الصفحة أولاً، ثم سمّع السند والمتن والتخريج من حفظك.</p>}

      {!reading && !manual && r.mismatchIndex != null && (
        <div className="mx-auto flex max-w-xl items-start gap-3 rounded-2xl border border-amber-300/70 bg-amber-50/80 p-4 font-ui text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100" role="status" aria-live="polite" data-testid="alert-book-mismatch">
          <RotateCcw size={18} className="mt-1 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
          <div className="flex-1 text-right">
            <p className="text-sm font-bold">لم يتّضح المسموع عند الكلمة {num(r.mismatchIndex + 1)}، أعد المحاولة بهدوء من هنا.</p>
            <p className="mt-1 text-[11px] leading-relaxed opacity-80">قد يكون السبب التعرّف الآلي على الصوت؛ هذا ليس حكماً على حفظك ولا درجة.</p>
            {hint
              ? <p className="hadith-text mt-2 text-xl" data-testid="text-book-hint">{r.words[r.mismatchIndex]}</p>
              : <button type="button" onClick={() => setHint(true)} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-amber-700/30 bg-card/60 px-3 text-xs font-bold hover:bg-card" data-testid="button-book-hint"><Lightbulb size={13} />أظهر الكلمة المتوقعة</button>}
          </div>
        </div>
      )}
      {!reading && r.error && <p className="mx-auto max-w-xl rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-center font-ui text-xs text-destructive" role="alert" data-testid="text-book-error">{r.error}</p>}
      {!reading && manual && <p className="mx-auto max-w-xl rounded-xl border bg-muted/50 px-3 py-2 text-center font-ui text-xs" role="status" data-testid="text-book-manual">أظهرتَ الصفحة يدوياً؛ هذا ليس تسميعاً. أعد الصفحة لتسمّعها.</p>}
      {finished && !report && <div className="flex justify-center"><button type="button" onClick={finishReview} disabled={!canFinish} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-ui text-sm font-bold text-primary-foreground disabled:opacity-40" data-testid="button-book-finish-complete"><Flag size={15} />مراجعة المحاولة</button></div>}
      {finished && <p className="rounded-xl border border-secondary/40 bg-secondary/10 px-4 py-3 text-center font-ui text-sm font-bold" role="status" data-testid="text-book-complete">بلغتَ نهاية الأحاديث المتاحة. هذا انتهاء للمقطع وليس درجة أو إثباتاً لتسميع الصفحات التي تجاوزتها.</p>}

      {/* Page */}
      <article ref={articleRef} key={page.number} className="relative mx-auto max-w-[860px] scroll-mt-24 animate-in fade-in slide-in-from-left-4 duration-500 rounded-[1.75rem] border bg-card px-4 py-7 ring-1 ring-secondary/10 ring-inset shadow-[0_30px_60px_-40px_hsl(var(--primary)/0.5)] motion-reduce:animate-none sm:px-12 sm:py-12" aria-label={`صفحة ${num(page.number)}`} data-testid={`book-page-${page.number}`}>
        <div className="ornament mb-6 font-ui text-[11px] font-bold text-muted-foreground">
          <span>{reading ? 'وضع القراءة' : `ظهر ${num(pageRead)} من ${num(pageLen)} كلمة في هذه الصفحة`}</span>
          <span className="text-secondary">{num(page.number)}</span>
        </div>
        {page.segments.map((s) => (
          <section key={`${s.hadithId}-${s.start}`} className="mb-8 last:mb-0" data-testid={`book-segment-${s.hadithNumber}-${page.number}`}>
            <header className="mb-3 flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-secondary/50 font-display text-sm font-bold text-secondary">{num(s.hadithNumber)}</span>
              <h3 className="font-display text-lg font-bold leading-snug sm:text-xl">{s.title}</h3>
              {s.continued && <span className="rounded-full bg-muted px-2 py-0.5 font-ui text-[10px] text-muted-foreground">تتمة</span>}
            </header>
            <p className="hadith-text select-none text-foreground" style={{ fontSize: 'clamp(21px, 2.6vw, 30px)', lineHeight: 2.25, textAlign: 'justify', textAlignLast: 'right' }} data-testid={`text-book-segment-${s.hadithNumber}-${page.number}`}>
              {r.words.slice(s.start, s.end).map((w, k) => {
                const i = s.start + k;
                const on = reading || manual || r.revealed[i];
                const prov = !on && interim.has(i);
                const bad = !reading && !manual && r.mismatchIndex === i;
                const visible = on || prov;
                const iss = !reading && !manual ? issueAt.get(i) : undefined;
                return (
                  <span key={i}>
                    {iss && iss.kind !== 'omission' && iss.heard && <span className="mx-0.5 inline-block rounded bg-red-50 dark:bg-red-950/30 px-1 text-[0.7em] text-red-700 dark:text-red-400" data-testid={`book-heard-${i}`}><span className="sr-only">سُمع على وجه غير مؤكد: </span>{iss.heard}</span>}
                    <span aria-hidden={visible ? undefined : true} data-testid={`book-word-${i}`}
                      className={cn('inline-block transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none',
                        on ? 'translate-y-0 opacity-100' : prov ? 'translate-y-0 text-secondary opacity-60' : 'invisible translate-y-1 opacity-0',
                        iss && iss.kind !== 'extra' && 'visible rounded-md border-b-2 border-dashed border-amber-500 opacity-100',
                        bad && 'visible rounded-md bg-amber-100/70 text-transparent opacity-100 ring-2 ring-amber-400/80 dark:bg-amber-900/30')}>{w}</span>{' '}
                  </span>
                );
              })}
            </p>
          </section>
        ))}
        <div className="mt-8 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full origin-right bg-secondary transition-transform duration-500 motion-reduce:transition-none" style={{ transform: `scaleX(${reading || !pageLen ? 0 : pageRead / pageLen})` }} />
        </div>
      </article>

      <footer className="mx-auto max-w-[860px] space-y-1 text-center font-ui text-[11px] leading-relaxed text-muted-foreground" data-testid="text-book-source">
        <p className="break-words">المصدر النصي: {Array.from(new Set(page.segments.map((s) => s.sourceUrl))).map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer" className="mx-1 underline underline-offset-2" data-testid="link-book-source">مرجع النص {num(i + 1)}</a>)}
          {' '}· بداية الحديث في المصدر: {Array.from(new Set(page.segments.map((s) => num(s.sourcePage)))).join('، ')}</p>
        <p>ترقيم الصفحات هنا رقمي للتسميع وليس ترقيم الطبعة المطبوعة.</p>
        <p>يشمل السند والمتن والعزو في الأحاديث الـ٤٢ المتاحة؛ لا يشمل مقدمة المؤلف أو هوامش الطبعة المصوّرة.</p>
        {pending && <p className="font-bold text-secondary" data-testid="text-book-pending">النص قيد المراجعة العلمية، فالتسميع تجريبي.</p>}
      </footer>

      {userId && <AccountRecitationHistory account={account} local={history.entries} onOpen={snapshot => { r.stop(); speech.cancel(); setReport(snapshot); }} />}
      <RecitationHistory entries={history.entries} onClear={history.clear} signedIn={!!userId} speech={speech} />
      {r.finishing && <p role="status" className="text-center font-ui text-sm">جارٍ انتظار آخر كلمات الميكروفون قبل إعداد المراجعة…</p>}

      <Dialog open={consentOpen} onOpenChange={setConsentOpen}>
          <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-2xl p-5" dir="rtl" data-testid="dialog-book-consent">
            <div className="flex items-start justify-between gap-3">
              <DialogTitle className="font-display text-xl font-bold">قبل بدء التسميع</DialogTitle>
            </div>
            <DialogDescription className="font-ui text-sm">تدريب تجريبي لإظهار الكلمات، لا تقييم للنطق أو التشكيل أو الحفظ.</DialogDescription>
            <label className="mt-4 flex cursor-pointer gap-3 rounded-xl border bg-background p-3 font-ui text-sm leading-relaxed">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--secondary))]" checked={agree} onChange={(e) => setAgree(e.target.checked)} data-testid="checkbox-book-consent" />
              <span>أوافق على استخدام الميكروفون. قد ترسل خدمة التعرّف في المتصفح صوتي إلى مزوّد خارجي. لا تحفظ المنصة تسجيلاً صوتياً ولا النص المسموع كاملاً، ولا تُرسل نتائج إلى الخادم. بعد إنهاء المحاولة يمكنك اختيارياً «حفظ النتيجة» (نسبة التطابق التقريبية والكلمات المختلفة) على هذا المتصفح فقط لحسابك، ويمكنك مسحها في أي وقت.</span>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConsentOpen(false)} className="min-h-10 rounded-full border px-5 font-ui text-sm font-bold" data-testid="button-book-consent-cancel">إلغاء</button>
              <button type="button" onClick={confirmStart} disabled={!agree} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-5 font-ui text-sm font-bold text-primary-foreground disabled:opacity-40" data-testid="button-book-consent-confirm"><Mic size={14} />ابدأ الآن</button>
            </div>
          </DialogContent>
      </Dialog>
    </div>
  );
}
