import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Save } from 'lucide-react';
import { num } from '@/lib/mateen';
import type { HadithAnalysis } from '@/lib/recitation-analysis';
import { normalizeWord, PronounceButton, SpeechError, HISTORY_CAP, MAX_ISSUES, type RecitationIssue, type useArabicSpeech } from './recitation-history';

export type ReportSnapshot = { attemptId: string; priorCounts: Map<string, number>; matched: number; attempted: number; issues: RecitationIssue[]; analyses: HadithAnalysis[] };
const KIND: Record<RecitationIssue['kind'], string> = { substitution: 'استُبدلت', omission: 'لم تُلتقط', extra: 'كلمة زائدة مسموعة' };
type Speech = ReturnType<typeof useArabicSpeech>;

export function IssueRow({ issue, prior, speech, hadithStart }: { issue: RecitationIssue; prior: number; speech: Speech; hadithStart: number }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-background/70 p-3" data-testid={`report-issue-${issue.index}`}>
      <span className="font-ui text-[11px] text-muted-foreground" data-testid={`text-issue-location-${issue.index}`}>
        الكلمة {num(issue.index - hadithStart + 1)} في الحديث · {num(issue.index + 1)} في الكتاب
      </span>
      <div className="flex flex-1 flex-wrap items-baseline gap-3">
        {issue.kind !== 'extra' && <span className="hadith-text text-xl text-foreground" data-testid="text-issue-expected"><span className="font-ui text-[10px] text-muted-foreground">المتوقع: </span>{issue.expected}</span>}
        {issue.kind !== 'omission' && issue.heard && <span className="hadith-text text-lg text-red-700 dark:text-red-400" data-testid="text-issue-heard"><span className="font-ui text-[10px]">المسموع: </span>{issue.heard}</span>}
        <span className="font-ui text-[11px] text-muted-foreground">{KIND[issue.kind]}</span>
      </div>
      <span className="font-ui text-[11px] text-muted-foreground" data-testid="text-issue-prior">{prior ? `ظهرت في ${num(prior)} محاولة سابقة` : 'لم تظهر سابقاً'}</span>
      {issue.kind !== 'extra' && issue.expected && <PronounceButton word={issue.expected} speech={speech} />}
    </li>
  );
}

const Stat = ({ label, value, id }: { label: string; value: string; id: string }) => (
  <div className="rounded-xl border bg-card px-3 py-2.5"><p className="font-ui text-[11px] text-muted-foreground">{label}</p><p className="font-display text-2xl font-bold" data-testid={id}>{value}</p></div>
);

export function RecitationReport({ report, onClose, onSave, canSave, alreadySaved, speech }: {
  report: ReportSnapshot | null; onClose: () => void; onSave: () => { ok: boolean; message?: string }; canSave: boolean;
  alreadySaved: boolean; speech: Speech;
}) {
  const [saved, setSaved] = useState<{ ok: boolean; message?: string } | null>(null);
  const attemptId = report?.attemptId;
  useEffect(() => { setSaved(null); }, [attemptId]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [attemptId]);
  const t = useMemo(() => {
    const s = { matched: 0, attempted: 0, heard: 0, sub: 0, om: 0, ex: 0 };
    for (const a of report?.analyses ?? []) { s.matched += a.matched; s.attempted += a.attempted; s.heard += a.heard; s.sub += a.substitutions; s.om += a.omissions; s.ex += a.extras; }
    return s;
  }, [report]);
  if (!report) return null;
  const isSaved = alreadySaved || !!saved?.ok;
  const pct = t.attempted ? Math.round((t.matched / t.attempted) * 100) : 0;
  const agree = t.matched === report.matched && t.attempted === report.attempted;
  const close = () => { speech.cancel(); onClose(); };
  return (
    <div className="mx-auto max-w-[860px] space-y-5" data-testid="full-page-recitation-report">
      <button type="button" onClick={close} className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-card px-4 font-ui text-sm font-bold" data-testid="button-report-back"><ArrowRight size={14} />العودة إلى الدراسة</button>
      <header className="rounded-3xl border bg-gradient-to-b from-secondary/10 to-card px-5 pb-5 pt-6 sm:px-8">
        <h2 className="font-display text-3xl font-bold">مراجعة المحاولة</h2>
        <p className="mt-1 font-ui text-xs leading-relaxed text-muted-foreground">ملخص تقريبي من التعرّف الآلي على الصوت. الاختلافات غير مؤكدة وقد تكون من خطأ التعرّف لا من حفظك. ليست درجة ولا تقييماً.</p>
        <div className="mt-5 flex flex-wrap items-end gap-4">
          <p className="font-display text-6xl font-bold text-primary" data-testid="text-report-percent">{t.attempted ? <>{num(pct)}<span className="text-2xl">٪</span></> : '—'}</p>
          <p className="max-w-md pb-2 font-ui text-xs text-muted-foreground" data-testid="text-report-counts">تطابق تقريبي = المطابق ÷ المحاولة: {num(t.matched)} من {num(t.attempted)} كلمة. المحاولة = مطابقة + استبدال + حذف + زيادة. الأحاديث التي لم تصل إليها غير مذكورة ولا تُعدّ إخفاقاً.</p>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full origin-right bg-secondary" style={{ transform: `scaleX(${pct / 100})` }} /></div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="مسموعة (دون الحذف)" value={num(t.heard)} id="text-total-heard" />
          <Stat label="اختلافات" value={num(t.sub + t.om + t.ex)} id="text-total-errors" />
          <Stat label="استبدال" value={num(t.sub)} id="text-total-substitutions" />
          <Stat label="حذف" value={num(t.om)} id="text-total-omissions" />
          <Stat label="زيادة" value={num(t.ex)} id="text-total-extras" />
        </div>
        {!agree && <p className="mt-3 font-ui text-[11px] text-destructive" role="alert" data-testid="text-report-mismatch">تنبيه: مجموع الأحاديث ({num(t.matched)} من {num(t.attempted)}) يختلف عن ملخص المحاولة ({num(report.matched)} من {num(report.attempted)}).</p>}
      </header>

      <section className="space-y-4" aria-label="التحليل لكل حديث">
        {report.analyses.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center font-ui text-xs text-muted-foreground" data-testid="text-report-no-issues">لم تُلتقط كلمات مثبتة؛ لا يمكن حساب نسبة. أعد التسميع عندما يصبح الميكروفون جاهزاً.</p>}
        {report.analyses.map((a) => (
          <article key={a.id} className="rounded-2xl border bg-card p-4 sm:p-5" data-testid={`hadith-analysis-${a.number}`}>
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-secondary/50 font-display text-sm font-bold text-secondary">{num(a.number)}</span>
              <h3 className="font-display text-lg font-bold leading-snug">{a.title}</h3>
            </div>
            <p className="mt-2 font-ui text-xs text-muted-foreground" data-testid={`text-hadith-covered-${a.number}`}>
              {a.covered < a.totalWords ? `سمّعتَ جزءاً من الحديث: غُطّيت ${num(a.covered)} من ${num(a.totalWords)} كلمة.` : `غُطّيت ${num(a.covered)} من ${num(a.totalWords)} كلمة.`}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 font-ui text-xs sm:grid-cols-4">
              <p className="rounded-lg bg-muted/60 px-3 py-2">مسموعة <b className="block text-base" data-testid={`text-hadith-heard-${a.number}`}>{num(a.heard)}</b></p>
              <p className="rounded-lg bg-muted/60 px-3 py-2">محاولة <b className="block text-base" data-testid={`text-hadith-attempted-${a.number}`}>{num(a.attempted)}</b></p>
              <p className="rounded-lg bg-secondary/10 px-3 py-2">نسبة النجاح التقريبية <b className="block text-base" data-testid={`text-hadith-success-${a.number}`}>{num(a.successPercent)}٪</b></p>
              <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800 dark:bg-red-950/30 dark:text-red-300">نسبة الاختلاف <b className="block text-base" data-testid={`text-hadith-difference-${a.number}`}>{num(a.differencePercent)}٪</b></p>
            </div>
            <p className="mt-2 font-ui text-[11px] text-muted-foreground" data-testid={`text-hadith-breakdown-${a.number}`}>مطابقة {num(a.matched)} · استبدال {num(a.substitutions)} · حذف {num(a.omissions)} · زيادة {num(a.extras)}</p>
            {a.issues.length === 0
              ? <p className="mt-3 rounded-xl border border-dashed p-3 text-center font-ui text-xs text-muted-foreground" data-testid={`text-hadith-no-issues-${a.number}`}>لم تُرصد اختلافات في الجزء الذي سمّعته.</p>
              : <ul className="mt-3 space-y-2">{a.issues.map((i) => <IssueRow key={`${i.index}-${i.kind}-${i.heard}`} issue={i} hadithStart={a.start} prior={report.priorCounts.get(normalizeWord(i.expected)) ?? 0} speech={speech} />)}</ul>}
          </article>
        ))}
        <SpeechError speech={speech} />
      </section>

      {alreadySaved && !saved && <p role="status" className="rounded-xl bg-secondary/10 px-3 py-2 font-ui text-xs" data-testid="text-report-already-saved">هذه المحاولة محفوظة مسبقاً على هذا الجهاز.</p>}
      {saved && <p role="status" className={`rounded-xl px-3 py-2 font-ui text-xs ${saved.ok ? 'bg-secondary/10' : 'bg-destructive/10 text-destructive'}`} data-testid="text-report-save-status">{saved.ok ? (saved.message ?? 'حُفظت النتيجة على هذا الجهاز فقط.') : saved.message}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={close} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 font-ui text-sm font-bold" data-testid="button-report-close">إغلاق دون حفظ</button>
        <button type="button" disabled={!canSave || isSaved} onClick={() => setSaved(onSave())} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 font-ui text-sm font-bold text-primary-foreground disabled:opacity-50" data-testid="button-report-save">
          {isSaved ? <><Check size={14} />حُفظت</> : <><Save size={14} />حفظ النتيجة على هذا الجهاز</>}
        </button>
      </div>
      <p className="font-ui text-[11px] leading-relaxed text-muted-foreground" data-testid="text-report-history-limit">
        تُعرض هنا كل الاختلافات ({num(report.issues.length)}). عند الحفظ يخزّن هذا المتصفح الملخص ومقاييس كل حديث دون تفاصيل الاختلافات، ويحفظ في السجل العام أول {num(MAX_ISSUES)} اختلاف فقط لكل محاولة، وآخر {num(HISTORY_CAP)} محاولة. لا صوت ولا نص مسموع كامل، ولا تُرسل إلى الخادم.
      </p>
    </div>
  );
}
