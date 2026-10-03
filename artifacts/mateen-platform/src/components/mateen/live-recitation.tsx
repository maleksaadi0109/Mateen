import { useEffect, useRef, useState } from 'react';
import { BookOpen, Eye, Mic, MoreHorizontal, Pause, RotateCcw, ShieldAlert, X } from 'lucide-react';
import { getGetNawawiBookQueryKey, getGetRecitationPagesQueryKey, useGetNawawiBook, useGetRecitationPages } from '@workspace/api-client-react';
import { useLiveRecitation } from '@/hooks/use-live-recitation';
import { BookReader } from '@/components/mateen/book-reader';
import { ScannedPages } from '@/components/mateen/scanned-pages';
import { GATE_MESSAGES, scannedGate } from '@/lib/scanned-pages';
import { num } from '@/lib/mateen';
import { cn } from '@/lib/utils';

export default function LiveRecitation({ text, fontSize, hadithId, title, onModeChange }: {
  text: string; fontSize: number; hadithId?: number; title?: string; onModeChange?: (mode: 'read' | 'recite') => void;
}) {
  const pagesEnabled = typeof hadithId === 'number';
  const pagesQuery = useGetRecitationPages(hadithId ?? 0, { query: { enabled: pagesEnabled, retry: false, queryKey: getGetRecitationPagesQueryKey(hadithId ?? 0) } });
  // Scan-specific sanad+matn text only when the verified map is available; else fallback text.
  const scanText = pagesQuery.data?.status === 'available' && pagesQuery.data.text ? pagesQuery.data.text : null;
  const sourceText = scanText ?? text;
  const sanadPending = pagesEnabled && !scanText && !pagesQuery.isLoading;
  const r = useLiveRecitation(sourceText);
  const mismatchIndex = r.mismatchIndex;
  const shownTitle = (scanText && pagesQuery.data?.title) || title;
  const [matnPractice, setMatnPractice] = useState(false);
  const startBlocked = pagesEnabled && (pagesQuery.isLoading || (sanadPending && !matnPractice));
  const [mode, setModeState] = useState<'read' | 'recite'>(pagesEnabled ? 'read' : 'recite');
  const modeCb = useRef(onModeChange);
  modeCb.current = onModeChange;
  const setMode = (m: 'read' | 'recite') => { setModeState(m); modeCb.current?.(m); };
  const reading = mode === 'read';
  const bookQuery = useGetNawawiBook({ query: { enabled: pagesEnabled, retry: false, queryKey: getGetNawawiBookQueryKey() } });
  const gate = scannedGate({ enabled: pagesEnabled, isLoading: pagesQuery.isLoading, isError: pagesQuery.isError, data: pagesQuery.data }, sourceText, r.words.length);
  const [imageFailed, setImageFailed] = useState(false);
  const showScan = gate.kind === 'ready' && !imageFailed;
  const [consentOpen, setConsentOpen] = useState(false);
  const [agree, setAgree] = useState(false);
  const [manual, setManual] = useState(false);
  const [more, setMore] = useState(false);
  const stopRef = useRef(r.stop);
  stopRef.current = r.stop;
  useEffect(() => () => stopRef.current(), []);
  useEffect(() => () => modeCb.current?.('read'), []);

  const interim = new Set(r.interimIndices);
  const shown = r.revealed.filter(Boolean).length;
  const total = r.words.length;
  const pct = total ? Math.round((shown / total) * 100) : 0;
  const unsupported = r.supported === false;

  const doReset = () => { r.stop(); r.reset(); setManual(false); };
  const doReveal = () => { r.stop(); r.revealAll(); setManual(true); };
  const begin = () => {
    if (reading) r.reset();
    setManual(false); r.start(); setMode('recite');
  };
  const requestStart = () => { setAgree(false); setConsentOpen(true); };
  const confirmStart = () => { if (!agree) return; setConsentOpen(false); begin(); };
  const backToReading = () => { r.stop(); r.reset(); setManual(false); setMode('read'); };

  return (
    <div className="space-y-4">
      {shownTitle && <h2 className="text-center font-display text-2xl font-bold leading-snug sm:text-3xl" data-testid="text-hadith-title">{shownTitle}</h2>}

      {reading && (
        <>
          <div className="flex justify-center">
            {unsupported ? (
              <div className="flex max-w-xl gap-2 rounded-xl border bg-muted/50 p-3 font-ui text-xs">
                <ShieldAlert size={16} className="mt-0.5 shrink-0 text-secondary" />
                <p>التسميع المباشر غير متاح في متصفحك. جرّب كروم أو إيدج أو سفاري الحديث عبر اتصال آمن. يمكنك مواصلة القراءة.</p>
              </div>
            ) : (
              <button type="button" onClick={requestStart} disabled={r.supported === null || startBlocked}
                className="group relative inline-flex min-h-12 w-full items-center justify-center gap-3 sm:w-auto rounded-full bg-primary py-3 pl-7 pr-3 font-ui text-base font-bold text-primary-foreground shadow-[0_14px_30px_-14px_hsl(var(--primary)/0.8)] transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40"
                data-testid="button-live-start">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-secondary-foreground transition-transform group-hover:scale-110"><Mic size={18} /></span>
                {sanadPending && matnPractice ? 'ابدأ تدريب المتن وحده' : 'ابدأ التسميع'}
              </button>
            )}
          </div>
          <p className="text-center font-ui text-xs text-muted-foreground" data-testid="text-read-first">{sanadPending && matnPractice ? 'تدريب اختياري على المتن وحده، دون السند.' : 'اقرأ أولاً، ثم سمّع السند ثم المتن من حفظك.'}</p>
          {sanadPending && <p className="mx-auto max-w-xl rounded-lg border bg-muted/40 px-3 py-2 text-center font-ui text-[11px] text-muted-foreground" role="status" data-testid="text-sanad-pending">
            السند غير متاح للتسميع في هذا الحديث بعد؛ مطابقته على صفحة الكتاب قيد الإعداد، لذا التسميع الكامل (السند ثم المتن) معطّل.
          </p>}
          {sanadPending && <details className="mx-auto max-w-xl rounded-lg border bg-card/70 px-3 py-2 font-ui text-xs" data-testid="details-matn-practice">
            <summary className="cursor-pointer font-bold">تدريب تجريبي على المتن وحده (اختياري)</summary>
            <label className="mt-2 flex cursor-pointer gap-2 leading-relaxed">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--secondary))]" checked={matnPractice} onChange={(e) => setMatnPractice(e.target.checked)} data-testid="checkbox-matn-practice" />
              <span>أفهم أن هذا تدريب على المتن دون السند، وليس تسميعاً كاملاً ولا اعتماداً علمياً.</span>
            </label>
          </details>}
          <BookReader book={bookQuery.data} isLoading={bookQuery.isLoading} isError={bookQuery.isError} onRetry={() => bookQuery.refetch()} hadithId={hadithId as number} />
          {bookQuery.isError && <p className="hadith-text rounded-xl border bg-background/60 p-4" style={{ fontSize }} data-testid="text-book-fallback">{text}</p>}
        </>
      )}

      {!reading && (
        <div className="space-y-4">
          <div className="mx-auto flex max-w-[820px] flex-col items-center gap-3" role="toolbar" aria-label="أدوات التسميع">
            <div className="flex w-full items-center justify-center gap-3">
              {r.listening ? (
                <button type="button" onClick={r.stop} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-secondary px-6 font-ui text-sm font-bold text-secondary-foreground shadow-[0_14px_30px_-16px_hsl(var(--secondary)/0.9)] sm:flex-none" data-testid="button-live-pause"><Pause size={16} />إيقاف مؤقت</button>
              ) : (
                <button type="button" onClick={begin} disabled={unsupported || manual || startBlocked} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-6 font-ui text-sm font-bold text-primary-foreground shadow-[0_14px_30px_-16px_hsl(var(--primary)/0.8)] disabled:opacity-40 sm:flex-none" data-testid="button-live-resume"><Mic size={16} />{shown > 0 ? 'متابعة التسميع' : 'ابدأ التسميع'}</button>
              )}
              {r.listening && <span className="inline-flex items-center gap-1.5 font-ui text-xs font-bold text-secondary" role="status"><span className="h-2 w-2 animate-pulse rounded-full bg-secondary motion-reduce:animate-none" />يستمع الآن</span>}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1 font-ui text-xs font-bold text-muted-foreground">
              <button type="button" onClick={doReset} disabled={shown === 0 && !r.listening && !manual} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 hover:bg-muted hover:text-foreground disabled:opacity-40" data-testid="button-live-reset"><RotateCcw size={14} />مسح الصفحة</button>
              {pagesEnabled && <button type="button" onClick={backToReading} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 hover:bg-muted hover:text-foreground" data-testid="button-back-to-reading"><BookOpen size={14} />العودة إلى القراءة</button>}
              <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} aria-controls="live-more-actions" className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 hover:bg-muted hover:text-foreground" data-testid="button-live-more"><MoreHorizontal size={14} />{more ? 'أقل' : 'المزيد'}</button>
            </div>
            {more && (
              <div id="live-more-actions" className="flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-dashed bg-card/60 p-3 text-center font-ui text-[11px] text-muted-foreground">
                <button type="button" onClick={doReveal} disabled={manual} className="inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-xs font-bold text-foreground disabled:opacity-40" data-testid="button-live-reveal"><Eye size={14} />إظهار النص</button>
                <p>الإظهار اليدوي يوقف التسميع ولا يُحتسب تسميعاً.</p>
              </div>
            )}
          </div>

          {!manual && mismatchIndex != null && (
            <div dir="rtl" className="mx-auto flex max-w-xl items-start gap-3 rounded-2xl border border-amber-300/70 bg-amber-50/80 p-4 font-ui text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100" role="status" aria-live="polite" data-testid="text-mismatch">
              <RotateCcw size={18} className="mt-1 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
              <p className="text-sm font-bold">لم يتّضح المسموع عند الكلمة {num(mismatchIndex + 1)}، أعد المحاولة بهدوء من هنا.
                <span className="mt-1 block text-[11px] font-normal leading-relaxed opacity-80">التعرّف الآلي في المتصفح قد يخطئ؛ هذه إشارة للمحاولة مجدداً، لا حكم على حفظك ولا درجة.</span>
              </p>
            </div>
          )}
          {gate.kind !== 'idle' && gate.kind !== 'ready' && (
            <p className="rounded-lg border bg-muted/40 px-3 py-2 text-center font-ui text-[11px] text-muted-foreground" role="status" data-testid={`status-scan-${gate.kind}`}>
              {GATE_MESSAGES[gate.kind]}
            </p>
          )}
          {gate.kind === 'ready' && imageFailed && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-center font-ui text-xs text-destructive" role="alert" data-testid="status-scan-image-failed">تعذّر تحميل صورة الصفحة، فعدنا إلى الصفحة النصية.</p>
          )}
          {manual && <p className="rounded-lg border bg-muted/50 px-3 py-2 text-center font-ui text-xs" role="status" data-testid="text-manual-reveal">أظهرتَ النص يدوياً؛ هذا ليس تسميعاً ولا يُسجَّل. امسح الصفحة لإعادة التسميع.</p>}
          {r.error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 font-ui text-xs text-destructive" role="alert">{r.error}</p>}

          {showScan && gate.kind === 'ready' && <ScannedPages data={gate.data} revealed={r.revealed} onImageError={() => setImageFailed(true)} idPrefix={`h${hadithId}`} />}
          <div hidden={showScan} className="relative mx-auto max-w-[820px] rounded-[1.75rem] border bg-card px-4 pb-8 pt-12 shadow-[0_30px_60px_-40px_hsl(var(--primary)/0.5)] ring-1 ring-inset ring-secondary/10 sm:px-12 sm:pb-12 sm:pt-14">
            <span className="pointer-events-none absolute right-5 top-4 font-ui text-[11px] font-bold text-muted-foreground">
              {shown === 0 ? (sanadPending ? 'تدريب المتن وحده؛ ابدأ من حفظك' : 'الصفحة فارغة؛ ابدأ بالسند') : `ظهر ${num(shown)} من ${num(total)} كلمة`}
            </span>
            <p className="hadith-text select-none text-foreground" style={{ fontSize: `clamp(20px, 5vw, ${fontSize}px)`, lineHeight: 2.25, minHeight: '6em', textAlign: 'justify', textAlignLast: 'right' }} data-testid="text-live-recitation">
              {r.words.map((w, i) => {
                const on = r.revealed[i];
                const pending = !on && interim.has(i);
                return (
                  <span key={i}>
                    <span aria-hidden={!on && !pending ? true : undefined}
                      className={cn('transition-opacity duration-500', on ? 'opacity-100' : pending ? 'rounded bg-secondary/15 text-secondary opacity-70' : 'invisible opacity-0')}>{w}</span>{i < r.words.length - 1 ? ' ' : ''}
                  </span>
                );
              })}
            </p>
            <div className="mt-6 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full origin-right bg-secondary transition-transform duration-500" style={{ transform: `scaleX(${pct / 100})` }} />
            </div>
          </div>
        </div>
      )}

      {consentOpen && (
        <div className="fixed inset-0 z-50 grid items-end justify-items-center sm:place-items-center bg-foreground/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="consent-title" data-testid="dialog-consent">
          <div className="w-full max-w-md rounded-t-3xl border bg-card p-5 shadow-xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3">
              <h3 id="consent-title" className="font-display text-xl font-bold">{sanadPending && matnPractice ? 'قبل تدريب المتن وحده دون السند' : 'قبل بدء التسميع'}</h3>
              <button type="button" onClick={() => setConsentOpen(false)} aria-label="إغلاق" className="rounded-full p-1.5 hover:bg-muted" data-testid="button-consent-close"><X size={16} /></button>
            </div>
            <label className="mt-4 flex cursor-pointer gap-3 rounded-xl border bg-background p-3 font-ui text-sm leading-relaxed">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--secondary))]" checked={agree} onChange={(e) => setAgree(e.target.checked)} data-testid="checkbox-live-consent" />
              <span>أوافق على استخدام الميكروفون؛ قد يعالج مزوّد المتصفح صوتي. لا يُحفظ تسجيل ولا تُمنح درجة.</span>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConsentOpen(false)} className="min-h-10 rounded-full border px-5 font-ui text-sm font-bold" data-testid="button-consent-cancel">إلغاء</button>
              <button type="button" onClick={confirmStart} disabled={!agree} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-5 font-ui text-sm font-bold text-primary-foreground disabled:opacity-40" data-testid="button-consent-confirm"><Mic size={14} />ابدأ الآن</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
