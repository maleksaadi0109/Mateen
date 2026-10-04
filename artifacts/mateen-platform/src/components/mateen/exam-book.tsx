import { useMemo } from 'react';
import type { StageOutcome } from '@workspace/api-client-react';
import { normalizeRecitationWord, type RecitationIssue } from '@/lib/live-recitation';
import { num } from '@/lib/mateen';
import { cn } from '@/lib/utils';

/** Local snapshot taken from r.finish(): canonical words, committed indices and issues. */
export type ExamSnapshot = { words: string[]; matched: number[]; issues: RecitationIssue[] };

export const ISSUE_KIND: Record<RecitationIssue['kind'], string> = { substitution: 'استبدال', omission: 'حذف', extra: 'زيادة' };

/** Ordinal among real words (punctuation tokens are skipped), 1-based. */
function useOrdinals(words: string[]) {
  return useMemo(() => {
    let n = 0;
    return words.map((w) => (normalizeRecitationWord(w) ? ++n : 0));
  }, [words]);
}

const paper = 'relative overflow-hidden rounded-[1.75rem] border border-[hsl(32_40%_78%)] bg-[hsl(42_60%_96%)] shadow-[0_1px_0_hsl(32_40%_85%),0_14px_30px_-18px_hsl(24_50%_25%/0.45)] dark:border-border dark:bg-card';
const ruled = { backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent calc(2.6em - 1px), hsl(32 35% 82% / 0.55) calc(2.6em - 1px), hsl(32 35% 82% / 0.55) 2.6em)' } as const;

function BookFrame({ title, caption, children, testId }: { title: string; caption?: string; children: React.ReactNode; testId: string }) {
  return (
    <figure className={paper} data-testid={testId}>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 end-0 w-3 bg-gradient-to-l from-[hsl(32_30%_70%/0.35)] to-transparent" />
      <header className="flex items-center justify-between gap-3 border-b border-[hsl(32_40%_82%)] px-5 py-3 sm:px-8">
        <span className="font-display text-sm font-bold text-secondary">{title}</span>
        {caption && <span className="font-ui text-[11px] text-muted-foreground">{caption}</span>}
      </header>
      <div className="px-5 py-5 sm:px-10 sm:py-7">{children}</div>
    </figure>
  );
}

/** Live page: only committed words and tentative interim words appear; unreached text stays hidden. */
export function LiveExamBook({ words, revealed, interimIndices, listening, title }: { words: string[]; revealed: boolean[]; interimIndices: number[]; listening: boolean; title: string }) {
  const interim = useMemo(() => new Set(interimIndices), [interimIndices]);
  let last = -1;
  for (let i = 0; i < words.length; i++) if (revealed[i] || interim.has(i)) last = i;
  const shownCount = revealed.reduce((n, v, i) => n + (v && normalizeRecitationWord(words[i]) ? 1 : 0), 0);
  return (
    <BookFrame title={title} caption={listening ? 'يُكتب ما تسمّعه' : 'التسميع متوقف'} testId="exam-live-book">
      <p className="sr-only" role="status" aria-live="polite">ظهر {num(shownCount)} كلمة مثبتة.</p>
      <p dir="rtl" className="hadith-text min-h-[7.8em] text-[clamp(1.15rem,4.2vw,1.6rem)] leading-[2.6em] text-foreground" style={ruled}>
        {last < 0 && <span className="font-ui text-sm text-muted-foreground">ابدأ التسميع؛ تظهر الكلمات هنا كما تُكتب في الكتاب كلما أثبتها التعرّف.</span>}
        {words.slice(0, last + 1).map((w, i) => {
          if (revealed[i]) return <span key={i} className="animate-in fade-in duration-300 motion-reduce:animate-none">{w} </span>;
          if (interim.has(i)) return <span key={i} className="text-muted-foreground/70 underline decoration-dotted decoration-secondary/60 underline-offset-8" title="كلمة مؤقتة لم تُثبت">{w} </span>;
          return <span key={i} aria-label="موضع لم يُثبت" className="mx-1 inline-block w-10 border-b-2 border-dashed border-[hsl(32_30%_70%)] align-middle" />;
        })}
        {listening && <span aria-hidden className="ms-1 inline-block h-[1.1em] w-0.5 animate-pulse bg-secondary align-middle motion-reduce:animate-none" />}
      </p>
      <p className="mt-3 font-ui text-[11px] text-muted-foreground">الكلمات الباهتة ذات الخط المنقّط مؤقتة حتى يثبتها التعرّف. لا تُعرض الملاحظات أثناء التسميع؛ تظهر كلها بعد الإنهاء.</p>
    </BookFrame>
  );
}

/** Final review: whole canonical text with numbered highlights and a full list of differences. */
export function ExamReview({ snapshot, outcome, title, compact }: { snapshot: ExamSnapshot; outcome: StageOutcome; title: string; compact?: boolean }) {
  const { words, matched, issues } = snapshot;
  const ord = useOrdinals(words);
  const model = useMemo(() => {
    const matchedSet = new Set(matched);
    const sorted = [...issues].sort((a, b) => a.index - b.index || (a.kind === 'extra' ? -1 : 1));
    let reach = -1;
    for (const i of matched) reach = Math.max(reach, i);
    for (const i of issues) if (i.kind !== 'extra') reach = Math.max(reach, i.index);
    const at = new Map<number, { n: number; issue: RecitationIssue }>();
    const extrasBefore = new Map<number, { n: number; issue: RecitationIssue }[]>();
    sorted.forEach((issue, k) => {
      const entry = { n: k + 1, issue };
      if (issue.kind === 'extra') extrasBefore.set(issue.index, [...(extrasBefore.get(issue.index) ?? []), entry]);
      else at.set(issue.index, entry);
    });
    const unreached = words.reduce((n, w, i) => n + (i > reach && normalizeRecitationWord(w) ? 1 : 0), 0);
    return { matchedSet, sorted, reach, at, extrasBefore, unreached };
  }, [words, matched, issues]);

  const context = (index: number) => {
    const s = Math.max(0, index - 3), e = Math.min(words.length, index + 4);
    return <>{s > 0 && '… '}{words.slice(s, index).join(' ')} <mark className="rounded bg-secondary/20 px-1 text-foreground">{words[index] ?? ''}</mark> {words.slice(index + 1, e).join(' ')}{e < words.length && ' …'}</>;
  };
  const wordNo = (index: number) => {
    for (let i = Math.min(index, words.length - 1); i >= 0; i--) if (ord[i]) return ord[i];
    return 1;
  };
  const Chip = ({ n, tone }: { n: number; tone: string }) => <sup className={cn('mx-0.5 rounded-full px-1.5 font-ui text-[10px] font-bold', tone)}>{num(n)}</sup>;

  return (
    <div className="space-y-5" data-testid="exam-review">
      <div className={cn('rounded-2xl border p-4 text-center sm:p-6', outcome.passed ? 'border-secondary/40 bg-secondary/10' : 'border-destructive/30 bg-destructive/5')} role="status">
        <p className="font-ui text-xs font-bold text-muted-foreground">{outcome.passed ? 'اجتياز — أكثر من ٩٠٪' : !outcome.complete ? 'المقطع غير مكتمل' : 'لم تتجاوز ٩٠٪'}</p>
        <p className={cn('font-display font-bold text-primary', compact ? 'text-4xl' : 'text-[clamp(2.75rem,10vw,4rem)]')} data-testid="exam-review-percent">{num(outcome.percent)}٪</p>
        <p className="font-ui text-sm">{num(outcome.matched)} من {num(outcome.total)} كلمة مطابقة · زيادات {num(outcome.extras)} · اختلافات مرصودة {num(model.sorted.length)}</p>
        <p className="mt-1 font-ui text-[11px] leading-relaxed text-muted-foreground">النسبة والاجتياز من الخادم، محسوبة على الحديث كاملًا مع الزيادات. يُشترط تجاوز ٩٠٪ تمامًا؛ ٩٠٪ وحدها لا تكفي.</p>
      </div>

      <BookFrame title={title} caption="النص كما في الكتاب" testId="exam-review-book">
        <p dir="rtl" className="hadith-text text-[clamp(1.1rem,4vw,1.5rem)] leading-[2.6em]" style={ruled}>
          {words.map((w, i) => {
            const extras = model.extrasBefore.get(i);
            const issue = model.at.get(i);
            const pre = extras?.map((x) => <span key={`x${x.n}`} className="mx-0.5 rounded-md border border-dashed border-amber-600/60 bg-amber-100/70 px-1 font-ui text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-200" title={`زيادة: ${x.issue.heard}`}>+{x.issue.heard}<Chip n={x.n} tone="bg-amber-600 text-white" /></span>);
            let node: React.ReactNode;
            if (issue?.issue.kind === 'substitution') node = <span className="rounded-md bg-orange-200/70 px-0.5 text-foreground ring-1 ring-orange-500/40 dark:bg-orange-900/40">{w}<Chip n={issue.n} tone="bg-orange-600 text-white" /></span>;
            else if (issue?.issue.kind === 'omission') node = <span className="rounded-md bg-rose-100 px-0.5 text-foreground underline decoration-rose-500 decoration-wavy underline-offset-8 dark:bg-rose-900/30">{w}<Chip n={issue.n} tone="bg-rose-600 text-white" /></span>;
            else if (i > model.reach && normalizeRecitationWord(w)) node = <span className="text-muted-foreground/60">{w}</span>;
            else node = <span>{w}</span>;
            return <span key={i}>{pre}{node} </span>;
          })}
          {model.extrasBefore.get(words.length)?.map((x) => <span key={`x${x.n}`} className="mx-0.5 rounded-md border border-dashed border-amber-600/60 bg-amber-100/70 px-1 font-ui text-xs text-amber-900">+{x.issue.heard}<Chip n={x.n} tone="bg-amber-600 text-white" /></span>)}
        </p>
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-ui text-[11px] text-muted-foreground" aria-label="مفتاح الألوان">
          <li><span className="me-1 inline-block h-2.5 w-2.5 rounded-sm bg-orange-300 align-middle" />استبدال</li>
          <li><span className="me-1 inline-block h-2.5 w-2.5 rounded-sm bg-rose-200 align-middle" />حذف</li>
          <li><span className="me-1 inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-amber-600 bg-amber-100 align-middle" />زيادة مسموعة</li>
          {model.unreached > 0 && <li><span className="me-1 text-muted-foreground/60">نص باهت</span>لم يُبلغ في التسميع</li>}
        </ul>
      </BookFrame>

      {model.unreached > 0 && <p className="rounded-xl border border-dashed p-3 font-ui text-xs leading-relaxed" data-testid="exam-review-incomplete">توقّف التسميع قبل آخر الحديث: {num(model.unreached)} كلمة في آخره لم تُبلغ. هذا الجزء غير مكتمل ولا يُعدّ حذوفات مرصودة، ولذلك لا يظهر في قائمة الاختلافات.</p>}

      <section aria-label="قائمة الاختلافات" className="space-y-2">
        <h3 className="font-display text-lg font-bold">الاختلافات بالتفصيل ({num(model.sorted.length)})</h3>
        {model.sorted.length === 0
          ? <p className="rounded-xl border border-dashed p-4 text-center font-ui text-xs text-muted-foreground" data-testid="exam-review-no-issues">لم تُرصد اختلافات في الجزء الذي سمّعته.</p>
          : <ol className="space-y-2">{model.sorted.map((issue, k) => (
            <li key={`${issue.index}-${issue.kind}-${k}`} className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-[auto_1fr] sm:gap-4" data-testid={`exam-issue-${k + 1}`}>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-muted font-ui text-xs font-bold">{num(k + 1)}</span>
              <div className="min-w-0 space-y-1.5">
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-ui text-xs">
                  <b className="text-secondary">{ISSUE_KIND[issue.kind]}</b>
                  <span className="text-muted-foreground">{issue.kind === 'extra' ? `قبل الكلمة ${num(Math.min(wordNo(issue.index) + (ord[issue.index] ? 0 : 1), ord.reduce((a, b) => Math.max(a, b), 0)))}` : `الكلمة ${num(wordNo(issue.index))}`} من الحديث</span>
                </p>
                <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  {issue.kind !== 'extra' && <span className="hadith-text text-lg"><span className="font-ui text-[10px] text-muted-foreground">المتوقع: </span>{issue.expected}</span>}
                  {issue.kind !== 'omission' && issue.heard && <span className="hadith-text text-lg text-orange-800 dark:text-orange-300"><span className="font-ui text-[10px] text-muted-foreground">المسموع: </span>{issue.heard}</span>}
                  {issue.kind === 'omission' && <span className="font-ui text-[11px] text-muted-foreground">لم تُسمع هذه الكلمة</span>}
                </p>
                <p className="hadith-text text-sm leading-loose text-muted-foreground" dir="rtl">{context(issue.index)}</p>
              </div>
            </li>
          ))}</ol>}
        <p className="font-ui text-[11px] leading-relaxed text-muted-foreground">الاختلافات تقريبية من التعرّف الآلي على الصوت وقد تنتج عن خطأ التعرّف لا عن الحفظ. لا تقييم للنطق أو التشكيل.</p>
      </section>
    </div>
  );
}
