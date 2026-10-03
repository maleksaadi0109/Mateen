import { useEffect, useState } from 'react';
import { Check, Save, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { num } from '@/lib/mateen';
import { normalizeWord, PronounceButton, SpeechError, HISTORY_CAP, MAX_ISSUES, type RecitationIssue, type useArabicSpeech } from './recitation-history';

export type ReportSnapshot = { attemptId: string; priorCounts: Map<string, number>; matched: number; attempted: number; issues: RecitationIssue[] };
const KIND: Record<RecitationIssue['kind'], string> = { substitution: 'سُمع بدلاً منها', omission: 'لم تُلتقط', extra: 'كلمة زائدة مسموعة' };

export function IssueRow({ issue, prior, speech }: { issue: RecitationIssue; prior: number; speech: ReturnType<typeof useArabicSpeech> }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-background/70 p-3" data-testid={`report-issue-${issue.index}`}>
      <span className="font-ui text-[11px] text-muted-foreground">الكلمة {num(issue.index + 1)}</span>
      <div className="flex flex-1 flex-wrap items-baseline gap-3">
        {issue.kind !== 'extra' && <span className="hadith-text text-xl text-foreground" data-testid="text-issue-expected">{issue.expected}</span>}
        {issue.kind !== 'omission' && issue.heard && <span className="hadith-text text-lg text-red-700 dark:text-red-400 line-through decoration-1" data-testid="text-issue-heard"><span className="sr-only">المسموع: </span>{issue.heard}</span>}
        <span className="font-ui text-[11px] text-muted-foreground">{KIND[issue.kind]}</span>
      </div>
      <span className="font-ui text-[11px] text-muted-foreground" data-testid="text-issue-prior">{prior ? `ظهرت في ${num(prior)} محاولة سابقة` : 'لم تظهر سابقاً'}</span>
      {issue.kind !== 'extra' && issue.expected && <PronounceButton word={issue.expected} speech={speech} />}
    </li>
  );
}

export function RecitationReport({ report, onClose, onSave, canSave, alreadySaved, speech }: {
  report: ReportSnapshot | null; onClose: () => void; onSave: () => { ok: boolean; message?: string }; canSave: boolean;
  alreadySaved: boolean; speech: ReturnType<typeof useArabicSpeech>;
}) {
  const [saved, setSaved] = useState<{ ok: boolean; message?: string } | null>(null);
  const attemptId = report?.attemptId;
  useEffect(() => { setSaved(null); }, [attemptId]);
  const isSaved = alreadySaved || !!saved?.ok;
  const pct = report && report.attempted ? Math.round((report.matched / report.attempted) * 100) : 0;
  const close = () => { speech.cancel(); onClose(); };
  return (
    <Dialog open={!!report} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-3xl p-0" dir="rtl" data-testid="dialog-recitation-report">
        {report && (<>
          <div className="border-b bg-gradient-to-b from-secondary/10 to-transparent px-5 pb-5 pt-6 sm:px-7">
            <DialogTitle className="font-display text-2xl font-bold">مراجعة المحاولة</DialogTitle>
            <DialogDescription className="mt-1 font-ui text-xs leading-relaxed">ملخص تقريبي من التعرّف الآلي على الصوت. الاختلافات أدناه غير مؤكدة وقد تكون من خطأ التعرّف لا من حفظك. ليست درجة ولا تقييماً.</DialogDescription>
            <div className="mt-5 flex items-end gap-4">
              <p className="font-display text-5xl font-bold text-primary" data-testid="text-report-percent">{report.attempted ? <>{num(pct)}<span className="text-2xl">٪</span></> : '—'}</p>
              <p className="pb-2 font-ui text-xs text-muted-foreground" data-testid="text-report-counts">تطابق تقريبي: {num(report.matched)} من {num(report.attempted)} كلمة حاولتَها. لا تُحتسب الكلمات التي لم تصل إليها.</p>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full origin-right bg-secondary" style={{ transform: `scaleX(${pct / 100})` }} /></div>
          </div>
          <div className="px-5 py-5 sm:px-7">
            <h4 className="font-ui text-sm font-bold">اختلافات محتملة ({num(report.issues.length)})</h4>
            {report.issues.length === 0
              ? <p className="mt-3 rounded-xl border border-dashed p-4 text-center font-ui text-xs text-muted-foreground" data-testid="text-report-no-issues">{report.attempted ? 'لم تُرصد اختلافات في الجزء الذي سمّعته.' : 'لم تُلتقط كلمات مثبتة؛ لا يمكن حساب نسبة. أعد التسميع عندما يصبح الميكروفون جاهزاً.'}</p>
              : <ul className="mt-3 space-y-2">{report.issues.map((i) => <IssueRow key={`${i.index}-${i.kind}-${i.heard}`} issue={i} prior={report.priorCounts.get(normalizeWord(i.expected)) ?? 0} speech={speech} />)}</ul>}
            <div className="mt-3"><SpeechError speech={speech} /></div>
            {alreadySaved && !saved && <p role="status" className="mt-4 rounded-xl bg-secondary/10 px-3 py-2 font-ui text-xs" data-testid="text-report-already-saved">هذه المحاولة محفوظة مسبقاً على هذا الجهاز.</p>}
            {saved && <p role="status" className={`mt-4 rounded-xl px-3 py-2 font-ui text-xs ${saved.ok ? 'bg-secondary/10' : 'bg-destructive/10 text-destructive'}`} data-testid="text-report-save-status">{saved.ok ? (saved.message ?? 'حُفظت النتيجة على هذا الجهاز فقط.') : saved.message}</p>}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={close} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 font-ui text-sm font-bold" data-testid="button-report-close"><X size={14} />إغلاق دون حفظ</button>
              <button type="button" disabled={!canSave || isSaved} onClick={() => setSaved(onSave())} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 font-ui text-sm font-bold text-primary-foreground disabled:opacity-50" data-testid="button-report-save">
                {isSaved ? <><Check size={14} />حُفظت</> : <><Save size={14} />حفظ النتيجة على هذا الجهاز</>}
              </button>
            </div>
            <p className="mt-2 text-left font-ui text-[10px] text-muted-foreground">يُحفظ الملخص والكلمات المختلفة فقط، دون صوت أو نص مسموع كامل. يحتفظ هذا المتصفح بآخر {num(HISTORY_CAP)} محاولة وحتى {num(MAX_ISSUES)} اختلاف لكل محاولة.</p>
          </div>
        </>)}
      </DialogContent>
    </Dialog>
  );
}
