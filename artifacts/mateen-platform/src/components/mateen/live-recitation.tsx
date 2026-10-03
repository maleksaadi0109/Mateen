import { useEffect, useRef, useState } from 'react';
import { Eye, Mic, Pause, RotateCcw, ShieldAlert } from 'lucide-react';
import { useLiveRecitation } from '@/hooks/use-live-recitation';
import { num } from '@/lib/mateen';
import { cn } from '@/lib/utils';

export default function LiveRecitation({ text, fontSize }: { text: string; fontSize: number }) {
  const r = useLiveRecitation(text);
  const [consent, setConsent] = useState(false);
  const [manual, setManual] = useState(false);
  const stopRef = useRef(r.stop);
  stopRef.current = r.stop;
  useEffect(() => () => stopRef.current(), []);

  const interim = new Set(r.interimIndices);
  const shown = r.revealed.filter(Boolean).length;
  const total = r.words.length;
  const pct = total ? Math.round((shown / total) * 100) : 0;
  const unsupported = r.supported === false;

  const onConsent = (v: boolean) => {
    setConsent(v);
    if (!v) r.stop();
  };
  const doReset = () => { r.stop(); r.reset(); setManual(false); };
  const doReveal = () => { r.stop(); r.revealAll(); setManual(true); };

  return (
    <div className="space-y-5">
      {/* blank typeset page */}
      <div className="relative rounded-2xl border border-dashed border-secondary/40 bg-background/60 px-5 py-8 sm:px-10 sm:py-12">
        <span className="pointer-events-none absolute right-4 top-3 font-ui text-[11px] font-bold tracking-wide text-muted-foreground">
          {shown === 0 ? 'الصفحة فارغة؛ ابدأ التسميع من حفظك' : `ظهر ${num(shown)} من ${num(total)} كلمة`}
        </span>
        <p className="hadith-text select-none text-foreground" style={{ fontSize, lineHeight: 2.3, minHeight: '6em' }} data-testid="text-live-recitation">
          {r.words.map((w, i) => {
            const on = r.revealed[i];
            const pending = !on && interim.has(i);
            return (
              <span key={i}>
                <span
                  aria-hidden={!on && !pending ? true : undefined}
                  className={cn(
                    'transition-opacity duration-500',
                    on ? 'opacity-100' : pending ? 'rounded bg-secondary/15 text-secondary opacity-70 decoration-secondary/60 underline decoration-dotted underline-offset-8' : 'invisible opacity-0',
                  )}
                >{w}</span>{i < r.words.length - 1 ? ' ' : ''}
              </span>
            );
          })}
        </p>
        <div className="mt-6 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full origin-right bg-secondary transition-transform duration-500" style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-ui text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-foreground" />كلمة تعرّف عليها المتصفح</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-dotted border-secondary bg-secondary/20" />كلمة مسموعة لم تثبت بعد</span>
        {r.listening && <span className="inline-flex items-center gap-1.5 font-bold text-secondary" role="status"><span className="h-2 w-2 animate-pulse rounded-full bg-secondary" />يستمع الآن</span>}
      </div>

      {manual && (
        <p className="rounded-xl border border-amber-700/30 bg-amber-50/60 p-3 font-ui text-sm text-amber-900" role="status" data-testid="text-manual-reveal">
          أظهرتَ النص يدوياً للقراءة. هذا عون على المراجعة، وليس تسميعاً ناجحاً ولا يُسجَّل لك.
        </p>
      )}

      {unsupported ? (
        <div className="flex gap-3 rounded-xl border bg-muted/50 p-4 font-ui text-sm">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-secondary" />
          <p>التسميع المباشر غير متاح في متصفحك الحالي. جرّب كروم أو إيدج على الحاسوب أو أندرويد، أو سفاري الحديث، مع فتح الموقع عبر اتصال آمن والسماح بالميكروفون. يمكنك إظهار النص يدوياً للقراءة.</p>
        </div>
      ) : (
        <label className="flex cursor-pointer gap-3 rounded-xl border bg-card p-4 font-ui text-sm leading-relaxed">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--secondary))]" checked={consent} onChange={(e) => onConsent(e.target.checked)} data-testid="checkbox-live-consent" />
          <span>أفهم أن التعرّف على الكلام في المتصفح قد يرسل صوتي إلى مزوّد المتصفح لمعالجته، وأن هذه الميزة تجريبية: لا تمنح درجة، ولا تحفظ تسجيلاً، ولا تَسِم الحديث مدروساً.</span>
        </label>
      )}

      {r.error && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 font-ui text-sm text-destructive" role="alert">{r.error}</p>}
      {r.heardText && <details className="font-ui text-sm text-muted-foreground">
        <summary className="cursor-pointer">ما التقطه الميكروفون</summary>
        <p className="mt-2 break-words font-arabic leading-loose">{r.heardText}</p>
        <p className="mt-1 text-xs">هذا تفريغ آلي مؤقت، وليس حكماً على صحة حفظك.</p>
      </details>}

      <div className="flex flex-wrap gap-2.5">
        {r.listening ? (
          <button type="button" onClick={r.stop} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-secondary px-6 py-2.5 font-ui text-sm font-bold text-secondary-foreground" data-testid="button-live-pause"><Pause size={16} />إيقاف مؤقت</button>
        ) : (
          <button type="button" onClick={() => { setManual(false); r.start(); }} disabled={!consent || unsupported || r.supported === null || manual}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-ui text-sm font-bold text-primary-foreground disabled:opacity-40" data-testid="button-live-start">
            <Mic size={16} />{shown > 0 ? 'متابعة التسميع' : 'ابدأ التسميع'}
          </button>
        )}
        <button type="button" onClick={doReset} disabled={shown === 0 && !r.listening && !manual} className="inline-flex min-h-11 items-center gap-2 rounded-full border px-5 py-2.5 font-ui text-sm font-bold disabled:opacity-40" data-testid="button-live-reset"><RotateCcw size={15} />مسح الصفحة</button>
        <button type="button" onClick={doReveal} disabled={manual} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-dashed px-5 py-2.5 font-ui text-sm font-bold text-muted-foreground disabled:opacity-40" data-testid="button-live-reveal"><Eye size={15} />إظهار النص للقراءة</button>
      </div>
      {manual && <p className="font-ui text-xs text-muted-foreground">لإعادة التسميع امسح الصفحة أولاً.</p>}
    </div>
  );
}
