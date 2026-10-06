import { fmt } from '@/lib/i18n';
import { tr } from '@/lib/i18n';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Save, Sparkles } from 'lucide-react';
import { num } from '@/lib/mateen';
import type { HadithAnalysis } from '@/lib/recitation-analysis';
import { normalizeWord, PronounceButton, SpeechError, HISTORY_CAP, MAX_ISSUES, type RecitationIssue, type useArabicSpeech } from './recitation-history';
import { SavedReportWords } from './saved-report-words';
import WordPractice from './word-practice';
import type { ReferenceContext } from '@/lib/word-practice-selection';

export type ReportSnapshot = { attemptId: string; priorCounts: Map<string, number>; matched: number; attempted: number; issues: RecitationIssue[]; analyses: HadithAnalysis[]; accountReportId?: string; complete?: boolean; issueCount?: number;
  /** Live reports only: full hadith-local reference words plus actual attempted min/max. Retrieved/legacy reports lack it. */
  referenceContexts?: Record<number, ReferenceContext> };
const KIND: Record<RecitationIssue['kind'], string> = { get substitution() { return tr("استُبدلت"); }, get omission() { return tr("لم تُلتقط"); }, get extra() { return tr("كلمة زائدة مسموعة"); } };
type Speech = ReturnType<typeof useArabicSpeech>;

export function IssueRow({ issue, prior, speech, hadithStart }: { issue: RecitationIssue; prior: number | null; speech: Speech; hadithStart: number }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-background/70 p-3" data-testid={`report-issue-${issue.index}`}>
      <span className="font-ui text-[11px] text-muted-foreground" data-testid={`text-issue-location-${issue.index}`}>{tr("الكلمة")}{' '}{num(issue.index - hadithStart + 1)}{' '}{tr("في الحديث ·")}{' '}{num(issue.index + 1)}{' '}{tr("في الكتاب")}</span>
      <div className="flex flex-1 flex-wrap items-baseline gap-3">
        {issue.kind !== 'extra' && <span className="hadith-text text-xl text-foreground" data-testid="text-issue-expected"><span className="font-ui text-[10px] text-muted-foreground">المتوقع: </span>{issue.expected}</span>}
        {issue.kind !== 'omission' && issue.heard && <span className="hadith-text text-lg text-red-700 dark:text-red-400" data-testid="text-issue-heard"><span className="font-ui text-[10px]">المسموع: </span>{issue.heard}</span>}
        <span className="font-ui text-[11px] text-muted-foreground">{KIND[issue.kind]}</span>
      </div>
      <span className="font-ui text-[11px] text-muted-foreground" data-testid="text-issue-prior">{prior === null ? tr("السجل السابق غير متاح هنا") : prior ? fmt("ظهرت في {a} محاولة سابقة", "Appeared in {a} earlier attempt(s)", { a: num(prior) }) : tr("لم تظهر سابقاً")}</span>
      {issue.kind !== 'extra' && issue.expected && <PronounceButton word={issue.expected} speech={speech} />}
    </li>
  );
}

const Stat = ({ label, value, id }: { label: string; value: string; id: string }) => (
  <div className="rounded-xl border bg-card px-3 py-2.5"><p className="font-ui text-[11px] text-muted-foreground">{label}</p><p className="font-display text-2xl font-bold" data-testid={id}>{value}</p></div>
);

export function RecitationReport({ report, onClose, onSave, canSave, alreadySaved, speech, userId, onAccountSave }: {
  report: ReportSnapshot | null; onClose: () => void; onSave: () => { ok: boolean; message?: string }; canSave: boolean;
  alreadySaved: boolean; speech: Speech; userId?: string | null;
  onAccountSave?: () => Promise<void>;
}) {
  const [saved, setSaved] = useState<{ ok: boolean; message?: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountStatus, setAccountStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [practice, setPractice] = useState<HadithAnalysis | null>(null);
  const attemptId = report?.attemptId;
  useEffect(() => { setPractice(null); }, [attemptId]);
  useEffect(() => { setSaved(null); setConsent(false); setAccountStatus(null); }, [attemptId]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [attemptId]);
  const t = useMemo(() => {
    const s = { matched: 0, attempted: 0, heard: 0, sub: 0, om: 0, ex: 0 };
    for (const a of report?.analyses ?? []) { s.matched += a.matched; s.attempted += a.attempted; s.heard += a.heard; s.sub += a.substitutions; s.om += a.omissions; s.ex += a.extras; }
    return s;
  }, [report]);
  if (!report) return null;
  if (practice) return <WordPractice hadith={{ id: practice.id, title: practice.title }} hadithStart={practice.start} issues={practice.issues}
    context={report.accountReportId || report.complete === false ? null : report.referenceContexts?.[practice.id] ?? null} onClose={() => setPractice(null)} />;
  const isSaved = alreadySaved || !!saved?.ok;
  const pct = t.attempted ? Math.round((t.matched / t.attempted) * 100) : 0;
  const agree = t.matched === report.matched && t.attempted === report.attempted;
  const close = () => { speech.cancel(); onClose(); };
  return (
    <div className="mx-auto max-w-[860px] space-y-5" data-testid="full-page-recitation-report">
      <button type="button" onClick={close} className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-card px-4 font-ui text-sm font-bold" data-testid="button-report-back"><ArrowRight size={14} />{tr("العودة إلى الدراسة")}</button>
      <header className="rounded-3xl border bg-gradient-to-b from-secondary/10 to-card px-5 pb-5 pt-6 sm:px-8">
        <h2 className="font-display text-3xl font-bold">{tr("مراجعة المحاولة")}</h2>
        <p className="mt-1 font-ui text-xs leading-relaxed text-muted-foreground">{tr("ملخص تقريبي من التعرّف الآلي على الصوت. الاختلافات غير مؤكدة وقد تكون من خطأ التعرّف لا من حفظك. ليست درجة ولا تقييماً.")}</p>
        {report.complete === false && <p role="status" className="mt-3 rounded-xl border p-3 font-ui text-xs">{tr("هذه محاولة محلية قديمة نُقلت بموافقتك. المقاييس محفوظة، لكن تفاصيل الكلمات جزئية وقد تقتصر على أول 100 اختلاف؛ لا يمكن استعادة الكلمات التي لم يحفظها المتصفح.")}</p>}
        <div className="mt-5 flex flex-wrap items-end gap-4">
          <p className="font-display text-6xl font-bold text-primary" data-testid="text-report-percent">{t.attempted ? <>{num(pct)}<span className="text-2xl">{tr("٪")}</span></> : '—'}</p>
          <p className="max-w-md pb-2 font-ui text-xs text-muted-foreground" data-testid="text-report-counts">{tr("تطابق تقريبي = المطابق ÷ المحاولة:")}{' '}{num(t.matched)}{' '}{tr("من")}{' '}{num(t.attempted)}{' '}{tr("كلمة. المحاولة = مطابقة + استبدال + حذف + زيادة. الأحاديث التي لم تصل إليها غير مذكورة ولا تُعدّ إخفاقاً.")}</p>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full origin-right bg-secondary" style={{ transform: `scaleX(${pct / 100})` }} /></div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label={tr("مسموعة (دون الحذف)")} value={num(t.heard)} id="text-total-heard" />
          <Stat label={tr("اختلافات")} value={num(t.sub + t.om + t.ex)} id="text-total-errors" />
          <Stat label={tr("استبدال")} value={num(t.sub)} id="text-total-substitutions" />
          <Stat label={tr("حذف")} value={num(t.om)} id="text-total-omissions" />
          <Stat label={tr("زيادة")} value={num(t.ex)} id="text-total-extras" />
        </div>
        {!agree && <p className="mt-3 font-ui text-[11px] text-destructive" role="alert" data-testid="text-report-mismatch">{tr("تنبيه: مجموع الأحاديث (")}{num(t.matched)}{' '}{tr("من")}{' '}{num(t.attempted)}{tr(") يختلف عن ملخص المحاولة (")}{num(report.matched)}{' '}{tr("من")}{' '}{num(report.attempted)}).</p>}
      </header>

      <section className="space-y-4" aria-label={tr("التحليل لكل حديث")}>
        {report.analyses.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center font-ui text-xs text-muted-foreground" data-testid="text-report-no-issues">{tr("لم تُلتقط كلمات مثبتة؛ لا يمكن حساب نسبة. أعد التسميع عندما يصبح الميكروفون جاهزاً.")}</p>}
        {report.analyses.map((a) => (
          <article key={a.id} className="rounded-2xl border bg-card p-4 sm:p-5" data-testid={`hadith-analysis-${a.number}`}>
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-secondary/50 font-display text-sm font-bold text-secondary">{num(a.number)}</span>
              <h3 className="font-display text-lg font-bold leading-snug">{a.title}</h3>
            </div>
            <p className="mt-2 font-ui text-xs text-muted-foreground" data-testid={`text-hadith-covered-${a.number}`}>
              {a.covered < a.totalWords ? fmt("سمّعتَ جزءاً من الحديث: غُطّيت {a} من {b} كلمة.", "You recited part of the hadith: {a} of {b} words covered.", { a: num(a.covered), b: num(a.totalWords) }) : fmt("غُطّيت {a} من {b} كلمة.", "{a} of {b} words covered.", { a: num(a.covered), b: num(a.totalWords) })}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 font-ui text-xs sm:grid-cols-4">
              <p className="rounded-lg bg-muted/60 px-3 py-2">{tr("مسموعة")}{' '}<b className="block text-base" data-testid={`text-hadith-heard-${a.number}`}>{num(a.heard)}</b></p>
              <p className="rounded-lg bg-muted/60 px-3 py-2">{tr("محاولة")}{' '}<b className="block text-base" data-testid={`text-hadith-attempted-${a.number}`}>{num(a.attempted)}</b></p>
              <p className="rounded-lg bg-secondary/10 px-3 py-2">{tr("نسبة النجاح التقريبية")}{' '}<b className="block text-base" data-testid={`text-hadith-success-${a.number}`}>{num(a.successPercent)}{tr("٪")}</b></p>
              <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800 dark:bg-red-950/30 dark:text-red-300">{tr("نسبة الاختلاف")}{' '}<b className="block text-base" data-testid={`text-hadith-difference-${a.number}`}>{num(a.differencePercent)}{tr("٪")}</b></p>
            </div>
            <p className="mt-2 font-ui text-[11px] text-muted-foreground" data-testid={`text-hadith-breakdown-${a.number}`}>{tr("مطابقة")}{' '}{num(a.matched)}{' '}{tr("· استبدال")}{' '}{num(a.substitutions)}{' '}{tr("· حذف")}{' '}{num(a.omissions)}{' '}{tr("· زيادة")}{' '}{num(a.extras)}</p>
            {userId && <button type="button" onClick={() => { speech.cancel(); setPractice(a); }} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border px-4 font-ui text-xs font-bold" data-testid={`button-word-practice-${a.number}`}><Sparkles size={14} />{tr("تدرّب على الكلمات الصعبة")}</button>}
            {report.accountReportId && userId
              ? <SavedReportWords key={`${report.accountReportId}-${a.id}`} id={report.accountReportId} userId={userId} hadith={a} speech={speech} />
              : a.issues.length === 0
              ? <p className="mt-3 rounded-xl border border-dashed p-3 text-center font-ui text-xs text-muted-foreground" data-testid={`text-hadith-no-issues-${a.number}`}>{tr("لم تُرصد اختلافات في الجزء الذي سمّعته.")}</p>
              : <ul className="mt-3 space-y-2">{a.issues.map((i) => <IssueRow key={`${i.index}-${i.kind}-${i.heard}`} issue={i} hadithStart={a.start} prior={report.priorCounts.get(normalizeWord(i.expected)) ?? 0} speech={speech} />)}</ul>}
          </article>
        ))}
        <SpeechError speech={speech} />
      </section>

      {report.accountReportId && <p className="font-ui text-xs text-muted-foreground">{tr("تقرير محفوظ في الحساب ·")}{' '}{num(report.issueCount ?? 0)}{' '}{tr("اختلاف محفوظ. يمكنك حذفه من سجل تقارير الحساب.")}</p>}
      {!report.accountReportId && <>
      {alreadySaved && !saved && <p role="status" className="rounded-xl bg-secondary/10 px-3 py-2 font-ui text-xs" data-testid="text-report-already-saved">{tr("هذه المحاولة محفوظة مسبقاً على هذا الجهاز.")}</p>}
      {saved && <p role="status" className={`rounded-xl px-3 py-2 font-ui text-xs ${saved.ok ? 'bg-secondary/10' : 'bg-destructive/10 text-destructive'}`} data-testid="text-report-save-status">{saved.ok ? (saved.message ?? tr("حُفظت النتيجة على هذا الجهاز فقط.")) : saved.message}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={close} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 font-ui text-sm font-bold" data-testid="button-report-close">{tr("إغلاق دون حفظ")}</button>
        <button type="button" disabled={!canSave || isSaved} onClick={() => setSaved(onSave())} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 font-ui text-sm font-bold text-primary-foreground disabled:opacity-50" data-testid="button-report-save">
          {isSaved ? <><Check size={14} />{tr("حُفظت")}</> : <><Save size={14} />{tr("حفظ النتيجة على هذا الجهاز")}</>}
        </button>
      </div>
      <p className="font-ui text-[11px] leading-relaxed text-muted-foreground" data-testid="text-report-history-limit">{tr("تُعرض هنا كل الاختلافات (")}{num(report.issues.length)}{tr("). عند الحفظ يخزّن هذا المتصفح الملخص ومقاييس كل حديث دون تفاصيل الاختلافات، ويحفظ في السجل العام أول")}{' '}{num(MAX_ISSUES)}{' '}{tr("اختلاف فقط لكل محاولة، وآخر")}{' '}{num(HISTORY_CAP)}{' '}{tr("محاولة. لا صوت ولا نص مسموع كامل، ولا تُرسل إلى الخادم.")}</p>
      <section className="space-y-3 rounded-2xl border bg-card p-4 font-ui text-xs" data-testid="account-report-save">
        <p>{tr("حفظ التقرير الكامل في حسابك يتيح فتحه من أي جهاز، بكل اختلافات الكلمات ومقاييس الأحاديث. لا يُحفظ صوت أو نص مفرّغ كامل، ولا تتغيّر درجاتك أو إتمام الدراسة. الحد 500 تقرير للحساب؛ يمكنك حذف أي تقرير من السجل.")}</p>
        <label className="flex items-start gap-2"><input type="checkbox" checked={consent} disabled={accountSaving || !!accountStatus?.ok} onChange={e => setConsent(e.target.checked)} data-testid="checkbox-account-report-consent" /><span>{tr("أوافق على حفظ هذا التقرير واختلافات الكلمات في حسابي.")}</span></label>
        {!userId && <p>{tr("سجّل الدخول لحفظ التقرير في حسابك.")}</p>}
        <button className="min-h-11 rounded-full bg-primary px-5 font-bold text-primary-foreground disabled:opacity-50" disabled={!userId || !report.attempted || !consent || accountSaving || !!accountStatus?.ok || !onAccountSave}
          data-testid="button-report-save-account" onClick={async () => {
            setAccountSaving(true); setAccountStatus(null);
            try { await onAccountSave!(); setAccountStatus({ ok: true, message: tr("حُفظ التقرير الكامل في حسابك. يمكنك فتحه من السجل على أي جهاز.") }); }
            catch { setAccountStatus({ ok: false, message: tr("تعذّر حفظ التقرير في الحساب. قد يكون الطلب غير صالح أو تجاوز الحد؛ لم يُحذف التقرير الحالي أو سجلك المحلي. أعد المحاولة أو احذف تقريرًا قديمًا إذا بلغ الحساب 500 تقرير.") }); }
            finally { setAccountSaving(false); }
          }}>{accountSaving ? tr("جارٍ الحفظ…") : accountStatus?.ok ? tr("محفوظ في الحساب") : tr("حفظ التقرير الكامل في حسابي")}</button>
        {accountStatus && <p role={accountStatus.ok ? 'status' : 'alert'} data-testid="text-account-report-save-status">{accountStatus.message}</p>}
      </section>
      </>}
    </div>
  );
}
