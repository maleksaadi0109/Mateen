import { fmt } from '@/lib/i18n';
import { tr } from '@/lib/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/react';
import { ArrowRight, BookOpen, Check, Eye, Flag, Mic, Pause, RotateCcw, Save, Sparkles } from 'lucide-react';
import { getWordPracticeReference, saveWordPractice, saveWordPracticeAttempt, type WordPractice as SavedPractice, type WordPracticeReference } from '@workspace/api-client-react';
import { useLiveRecitation } from '@/hooks/use-live-recitation';
import { useReaderActivity } from '@/hooks/use-study-activity';
import { summarizeWordPractice } from '@/lib/word-practice';
import { MAX_PASSAGE, MAX_TARGETS, suggestTargets, toggleTarget, validRange, verifiedSpan, type ReferenceContext } from '@/lib/word-practice-selection';
import { normalizeRecitationWord, type RecitationIssue } from '@/lib/live-recitation';
import { num } from '@/lib/mateen';
import { cn } from '@/lib/utils';

type Attempt = SavedPractice['attempts'][number];
type Source = Pick<WordPracticeReference, 'hadithId' | 'title' | 'fingerprint' | 'tokenizerVersion' | 'words'>;
type Range = { start: number; end: number };
const btn = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 font-ui text-sm font-bold disabled:opacity-50';
const STATUS: Record<Attempt['status'], string> = { get comparable() { return tr("قابلة للمقارنة"); }, get incomplete() { return tr("غير مكتمل"); }, get unavailable() { return tr("تعذّر التقييم"); } };

export const wordPracticeKey = (userId: string | null, hadithId: number) => ['word-practice-reference', userId, hadithId] as const;

function saveError(err: unknown, attempt = false) {
  const status = err && typeof err === 'object' && 'status' in err ? Number((err as { status: unknown }).status) : 0;
  const reason = err && typeof err === 'object' && 'data' in err ? (err as { data?: { error?: string } }).data?.error : '';
  if (status === 409 && reason === 'quota') return attempt
    ? tr("بلغ هذا التمرين حدّ ٢٠ محاولة محفوظة. يمكنك متابعة التدريب دون حفظ، ولا يُستبدل الأقدم تلقائياً.")
    : tr("بلغ حسابك حدّ ١٠٠ تمرين محفوظ. احذف تمريناً قديماً من المراجعات ثم أعد المحاولة.");
  if (status === 409 && reason === 'conflict') return tr("يوجد حفظ مختلف بالمعرّف نفسه. ابدأ اختياراً جديداً؛ لن يُستبدل الحفظ السابق.");
  if (status === 409) return tr("تغيّر النص المرجعي منذ فتح التمرين، فلم يُحفظ. اختر الكلمات من النص الحالي من جديد.");
  if (status === 413 || status === 429 || status === 422) return tr("بلغ حسابك حدّ ١٠٠ تمرين أو المحاولات المحفوظة، أو لم يُقبل الطلب. احذف تمريناً قديماً من صفحة المراجعات ثم أعد المحاولة؛ لم يُفقد شيء محلياً.");
  return tr("تعذّر الحفظ. لم يُحذف شيء محلياً؛ أعد المحاولة وسيُستخدم المعرّف نفسه فلا يتكرر الحفظ.");
}

export default function WordPractice({ hadith, hadithStart = 0, issues = [], context, resume, onClose }: {
  hadith: { id: number; title: string }; hadithStart?: number; issues?: RecitationIssue[];
  context?: ReferenceContext | null; resume?: SavedPractice; onClose: () => void;
}) {
  const { user, isLoaded } = useUser();
  const userId = isLoaded && user ? user.id : null;
  return <WordPracticeInner key={userId ?? 'guest'} userId={userId} hadith={hadith} hadithStart={hadithStart} issues={issues} context={context} resume={resume} onClose={onClose} />;
}

function WordPracticeInner({ userId, hadith, hadithStart, issues, context, resume, onClose }: {
  userId: string | null; hadith: { id: number; title: string }; hadithStart: number; issues: RecitationIssue[];
  context?: ReferenceContext | null; resume?: SavedPractice; onClose: () => void;
}) {
  const reusable = !!resume && !resume.stale;
  const [saved, setSaved] = useState<SavedPractice | null>(reusable ? resume! : null);
  const [freshOnly, setFreshOnly] = useState(false);
  const query = useQuery({
    queryKey: wordPracticeKey(userId, hadith.id), enabled: !!userId,
    queryFn: ({ signal }) => getWordPracticeReference(hadith.id, { signal }), staleTime: 0, refetchOnMount: 'always',
    refetchOnWindowFocus: true, refetchInterval: 30_000,
  });
  const [exercise, setExercise] = useState<{ source: Source; range: Range; targets: number[] } | null>(
    reusable ? { source: { ...resume!.reference }, range: { start: resume!.start, end: resume!.end }, targets: resume!.targets } : null);
  const [attempts, setAttempts] = useState<Attempt[]>(reusable ? resume!.attempts : []);
  const [persisted, setPersisted] = useState<Set<string>>(() => new Set(reusable ? resume!.attempts.map((a) => a.requestId) : []));
  const [round, setRound] = useState(0);

  if (!userId) return <Shell onClose={onClose}><p role="alert" className="font-ui text-sm" data-testid="text-word-practice-signin">{tr("سجّل الدخول لاستخدام تدريب الكلمات الصعبة.")}</p></Shell>;
  const reselect = () => { setExercise(null); setSaved(null); setAttempts([]); setPersisted(new Set()); setFreshOnly(true); };
  if (exercise && query.data && query.data.fingerprint !== exercise.source.fingerprint) return <Shell onClose={onClose}>
    <p role="alert" className="rounded-xl border p-4 font-ui text-sm">{tr("تغيّر النص الحالي. أُوقف التسميع والمقارنة مع المحاولات السابقة؛ اختر كلماتك من النص الحالي.")}</p>
    <button type="button" onClick={reselect} className={cn(btn, 'border')} data-testid="button-word-practice-source-changed">{tr("إعادة الاختيار")}</button>
  </Shell>;
  if (exercise && query.isLoading) return <Shell onClose={onClose}><p role="status">{tr("جارٍ التحقق من النص الحالي…")}</p></Shell>;
  if (exercise && query.isError) return <Shell onClose={onClose}><p role="alert">{tr("تعذّر التحقق من إتاحة النص الحالي؛ أُوقف التسميع والمقارنة.")}</p><button type="button" className={cn(btn, 'border')} onClick={() => void query.refetch()}>{tr("إعادة المحاولة")}</button></Shell>;
  if (exercise) return (
    <Shell onClose={onClose}>
      <Rehearse key={`${exercise.source.fingerprint}:${exercise.range.start}:${exercise.range.end}:${exercise.targets.join(',')}`} userId={userId} {...exercise}
        attempts={attempts} persisted={persisted} saved={saved} round={round}
        onAttempt={(a) => setAttempts((p) => [...p, a].slice(-20))} onRepeat={() => setRound((n) => n + 1)}
        onSaved={(p, ids) => { setSaved(p); setPersisted((s) => new Set([...s, ...ids])); }}
        onReselect={reselect} />
    </Shell>
  );
  return (
    <Shell onClose={onClose}>
      {resume?.stale && <p role="status" className="mb-4 rounded-xl border border-amber-400/60 bg-amber-50/70 p-3 font-ui text-xs leading-relaxed text-amber-950 dark:bg-amber-950/30 dark:text-amber-100" data-testid="text-word-practice-stale">{tr("تغيّر النص المرجعي بعد حفظ هذا التمرين، فلا تُقارن محاولاته القديمة بالنص الحالي. اختر كلماتك من النص الحالي من جديد.")}</p>}
      {query.isLoading && <div className="space-y-2" data-testid="loading-word-practice" aria-busy><div className="h-6 w-1/2 animate-pulse rounded bg-muted" /><div className="h-32 animate-pulse rounded-2xl bg-muted" /></div>}
      {query.isError && <div role="alert" className="rounded-xl border border-destructive/30 p-4 font-ui text-sm" data-testid="error-word-practice">{tr("تعذّر تحميل النص المرجعي الحالي.")}{' '}<button type="button" className="mx-2 min-h-10 underline" onClick={() => query.refetch()} data-testid="button-word-practice-retry">{tr("إعادة المحاولة")}</button></div>}
      {query.data && !query.isError && <Select key={query.data.fingerprint} source={query.data} hadithStart={hadithStart} issues={issues} context={resume?.stale || freshOnly ? null : context}
        onStart={(range, targets) => { setAttempts([]); setPersisted(new Set()); setSaved(null); setExercise({ source: query.data, range, targets }); }} />}
    </Shell>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="mx-auto max-w-[860px] space-y-4" data-testid="word-practice">
      <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-card px-4 font-ui text-sm font-bold" data-testid="button-word-practice-close"><ArrowRight size={14} />{tr("رجوع")}</button>
      <header className="rounded-3xl border bg-gradient-to-b from-secondary/10 to-card px-5 py-5 sm:px-8">
        <h2 className="font-display text-2xl font-bold">{tr("تدريب الكلمات الصعبة")}</h2>
        <p className="mt-1 font-ui text-xs leading-relaxed text-muted-foreground">{tr("مساحة هادئة لإعادة قراءة مقطع قصير وإخفاء كلمات اخترتَها ثم تسميعه. التعرّف الآلي تجريبي، وهذا التمرين ليس درجة ولا قياساً للإتقان ولا يغيّر تقدّمك.")}</p>
      </header>
      {children}
    </div>
  );
}

function Select({ source, hadithStart, issues, context, onStart }: {
  source: WordPracticeReference; hadithStart: number; issues: RecitationIssue[]; context?: ReferenceContext | null;
  onStart: (range: Range, targets: number[]) => void;
}) {
  const span = useMemo(() => verifiedSpan(source.words, context), [source.words, context]);
  const allowed: Range = span ?? { start: 0, end: source.words.length };
  const [range, setRange] = useState<Range | null>(allowed.end - allowed.start <= MAX_PASSAGE ? allowed : null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [targets, setTargets] = useState<number[]>([]);
  const [first, setFirst] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const suggestions = useMemo(() => suggestTargets(issues, hadithStart, span), [issues, hadithStart, span]);
  const reason = context ? (span ? null : tr("لا يطابق نص تقريرك النص المرجعي الحالي، فلا نقترح كلمات ولا نعيد ربط المواضع. اختر من النص الحالي كاملاً.")) : tr("اختر الكلمات يدوياً من النص الحالي. لا نعرض اقتراحات تلقائية دون مرجع موثّق من محاولة تسميع سابقة.");
  const applyRange = () => {
    const numeric = (s: string) => Number(s.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)));
    const next = { start: numeric(from) - 1, end: numeric(to) };
    if (!from || !to || !validRange(next, allowed)) { setMsg(fmt("اختر مقطعاً متصلاً من ١ إلى {a} كلمة داخل النص المتاح (الكلمات {b}–{c}).", "Choose a continuous passage of 1 to {a} words within the available text (words {b}–{c}).", { a: num(MAX_PASSAGE), b: num(allowed.start + 1), c: num(allowed.end) })); return; }
    setMsg(''); setRange(next); setTargets((t) => t.filter((i) => i >= next.start && i < next.end));
  };
  const toggle = (i: number) => {
    const next = toggleTarget(targets, i, range);
    if (next === targets && !targets.includes(i)) setMsg(fmt("الحد الأقصى {a} كلمة.", "Maximum {a} words.", { a: num(MAX_TARGETS) })); else setMsg('');
    setTargets(next);
  };
  const addSuggestions = () => setTargets((t) => { let n = t; for (const i of suggestions) if (!n.includes(i)) n = toggleTarget(n, i, range); return n; });
  const inRange = (i: number) => range && i >= range.start && i < range.end;
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6" data-testid="word-practice-select" aria-label={tr("اختيار المقطع والكلمات")}>
      <h3 className="font-display text-lg font-bold">{source.title}</h3>
      {reason && <p role="note" className="rounded-xl border border-dashed p-3 font-ui text-xs leading-relaxed" data-testid="text-word-practice-no-suggestions">{reason}</p>}
      {span && <p className="font-ui text-xs text-muted-foreground" data-testid="text-word-practice-span">{tr("المقطع الذي سمّعتَه في المحاولة: الكلمات")}{' '}{num(span.start + 1)}–{num(span.end)}{' '}{tr("من الحديث.")}</p>}
      <div className="flex flex-wrap items-end gap-3 font-ui text-xs">
        <label className="grid gap-1">{tr("من الكلمة")}<input inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} placeholder={num(allowed.start + 1)} className="min-h-11 w-24 rounded-lg border bg-background px-3" data-testid="input-word-practice-start" /></label>
        <label className="grid gap-1">{tr("إلى الكلمة")}<input inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)} placeholder={num(Math.min(allowed.end, allowed.start + MAX_PASSAGE))} className="min-h-11 w-24 rounded-lg border bg-background px-3" data-testid="input-word-practice-end" /></label>
        <button type="button" onClick={applyRange} className={cn(btn, 'border')} data-testid="button-word-practice-range">{tr("اعتمد المقطع")}</button>
        <span className="text-muted-foreground">{tr("مقطع قصير، حتى")}{' '}{num(MAX_PASSAGE)}{' '}{tr("كلمة")}{!range && allowed.end - allowed.start > MAX_PASSAGE ? tr(". النص المتاح أطول، فحدّد المقطع بنفسك.") : '.'}</span>
      </div>
      <details className="rounded-xl border p-3" open={!range}>
        <summary className="min-h-11 cursor-pointer font-ui text-sm">{tr("معاينة النص المتاح وتحديد أول وآخر كلمة بالنقر")}</summary>
        <p className="mb-2 font-ui text-xs text-muted-foreground">{first === null ? tr("اضغط أول كلمة ثم آخر كلمة لتحديد مقطع قصير. بعد اعتماده اختر الكلمات الصعبة.") : tr("اضغط الآن آخر كلمة في المقطع.")}</p>
        <div className="hadith-text max-h-80 overflow-y-auto text-xl leading-loose">{source.words.slice(allowed.start, allowed.end).map((w, k) => {
          const i = allowed.start + k;
          return <button type="button" key={i} aria-label={fmt("الكلمة {a}: {b}", "Word {a}: {b}", { a: num(i + 1), b: w })} className="min-h-11 rounded px-1 hover:bg-secondary/10"
            data-testid={`range-word-${i}`} onClick={() => {
              if (first === null) { setFirst(i); setFrom(String(i + 1)); return; }
              const next = { start: Math.min(first, i), end: Math.max(first, i) + 1 };
              setFirst(null); setFrom(String(next.start + 1)); setTo(String(next.end));
              if (!validRange(next, allowed)) { setMsg('المقطع أطول من ١٢٠ كلمة؛ اختر حدوداً أقرب.'); return; }
              setRange(next); setTargets(t => t.filter(x => x >= next.start && x < next.end)); setMsg('');
            }}>{w}<span className="sr-only"> {num(i + 1)}</span>{' '}</button>;
        })}</div>
      </details>
      {suggestions.length > 0 && range && (
        <div className="rounded-xl bg-secondary/10 p-3 font-ui text-xs" data-testid="word-practice-suggestions">
          <p className="mb-2 flex items-center gap-2 font-bold"><Sparkles size={13} />{tr("اقتراحات غير مؤكدة من التعرّف الآلي؛ قد تكون من خطأ الالتقاط لا من حفظك.")}</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.filter(inRange).map((i) => <button key={i} type="button" onClick={() => toggle(i)} aria-pressed={targets.includes(i)} className="hadith-text min-h-9 rounded-full border bg-card px-3 text-lg" data-testid={`button-word-suggestion-${i}`}>{source.words[i]}</button>)}
            <button type="button" onClick={addSuggestions} className="min-h-9 rounded-full px-3 font-bold underline" data-testid="button-word-suggest-all">{tr("أضف المقترحات")}</button>
          </div>
        </div>
      )}
      {range ? (
        <>
          <p className="font-ui text-xs text-muted-foreground" aria-live="polite" data-testid="text-word-practice-count">{tr("اضغط الكلمات التي تريد التدرب عليها (يمكن اختيار موضعين لكلمة مكررة):")}{' '}{num(targets.length)}{' '}{tr("من")}{' '}{num(MAX_TARGETS)}.</p>
          <p className="hadith-text rounded-2xl bg-background/60 p-4 leading-[2.4]" style={{ fontSize: 'clamp(20px, 2.4vw, 28px)' }} data-testid="word-practice-words">
            {source.words.slice(range.start, range.end).map((w, k) => { const i = range.start + k; const on = targets.includes(i);
              return <button key={i} type="button" disabled={!normalizeRecitationWord(w)} onClick={() => toggle(i)} aria-pressed={on} data-testid={`button-word-${i}`}
                className={cn('mx-0.5 rounded-lg px-1.5 transition-colors', on ? 'bg-secondary text-secondary-foreground' : 'hover:bg-secondary/20')}>{w}</button>; })}
          </p>
        </>
      ) : <p className="rounded-xl border border-dashed p-4 text-center font-ui text-xs text-muted-foreground" data-testid="text-word-practice-need-range">{tr("حدّد مقطعاً أولاً لتظهر كلماته.")}</p>}
      {msg && <p role="alert" className="font-ui text-xs text-destructive" data-testid="text-word-practice-message">{msg}</p>}
      <button type="button" disabled={!range || targets.length === 0} onClick={() => range && onStart(range, targets)} className={cn(btn, 'bg-primary text-primary-foreground')} data-testid="button-word-practice-start"><BookOpen size={15} />{tr("ابدأ بقراءة السياق")}</button>
    </section>
  );
}

function Rehearse({ userId, source, range, targets, attempts, persisted, saved, round, onAttempt, onRepeat, onSaved, onReselect }: {
  userId: string; source: Source; range: Range; targets: number[]; attempts: Attempt[]; persisted: Set<string>; saved: SavedPractice | null; round: number;
  onAttempt: (a: Attempt) => void; onRepeat: () => void; onSaved: (p: SavedPractice, ids: string[]) => void; onReselect: () => void;
}) {
  const passage = useMemo(() => source.words.slice(range.start, range.end), [source.words, range]);
  const text = useMemo(() => passage.join(' '), [passage]);
  const r = useLiveRecitation(text, { continuousFeedback: true });
  const [stage, setStage] = useState<'read' | 'recite' | 'summary'>('read');
  const [revealed, setRevealed] = useState(false);
  const [consented, setConsented] = useState(false);
  const [agree, setAgree] = useState(false);
  const [attemptId, setAttemptId] = useState(() => crypto.randomUUID());
  const [last, setLast] = useState<Attempt | null>(null);
  const [lastMatched, setLastMatched] = useState<Set<number>>(new Set());
  const [finishErr, setFinishErr] = useState(false);
  const [micAttempted, setMicAttempted] = useState(false);
  const stopRef = useRef(r.stop); stopRef.current = r.stop;
  useEffect(() => () => stopRef.current(), []);
  const mismatch = r.words.length !== passage.length;
  const local = useMemo(() => new Set(targets.map((t) => t - range.start)), [targets, range.start]);
  const reciting = stage === 'recite' && consented && !revealed;
  const activity = useReaderActivity({ userId, kind: 'recitation', page: 1, attemptId, enabled: reciting, spokenWords: r.spokenWords });

  const begin = () => { setStage('recite'); setRevealed(false); setAttemptId(crypto.randomUUID()); setMicAttempted(consented); r.reset(); if (consented) r.start(); };
  const confirm = () => { if (!agree) return; setConsented(true); setMicAttempted(true); r.start(); };
  const reveal = () => { r.stop(); setRevealed(true); };
  const cancel = () => { r.stop(); r.reset(); setRevealed(false); setStage('read'); };
  const finish = async () => {
    setFinishErr(false);
    const s = await r.finish();
    if (!s) { setFinishErr(true); return; }
    const out = r.error ? { status: 'unavailable' as const, covered: 0, matched: 0 }
      : summarizeWordPractice({ matchedIndices: s.matchedIndices, issues: s.issues, spokenWords: s.spokenWords }, passage);
    const a: Attempt = { requestId: attemptId, status: out.status, covered: out.covered, matched: out.matched };
    setLast(a); setLastMatched(new Set(s.matchedIndices)); onAttempt(a); setStage('summary');
  };
  const repeat = () => { setLast(null); setRevealed(false); setStage('read'); onRepeat(); r.reset(); };

  if (mismatch) return <p role="alert" className="rounded-xl border p-4 font-ui text-sm" data-testid="error-word-practice-tokens">{tr("تعذّر مطابقة كلمات المقطع مع المرجع، فلم يبدأ التدريب. اختر مقطعاً آخر.")}</p>;

  const word = (w: string, i: number, hide: boolean) => hide
    ? <span key={i} aria-label={tr("كلمة مخفية")} data-testid={`word-hidden-${i}`} className="mx-1 inline-block h-[1.1em] translate-y-1 rounded-md bg-secondary/25 align-baseline" style={{ width: `${Math.max(2, w.length * 0.5)}em` }} />
    : <span key={i} data-testid={`word-${i}`} className={cn('mx-1 inline-block', local.has(i) && 'rounded-md bg-secondary/20 px-1')}>{w}</span>;

  return (
    <div className="space-y-4" data-testid="word-practice-rehearse">
      <ol className="flex flex-wrap gap-2 font-ui text-xs font-bold" aria-label={tr("المراحل")}>
        {([['read', tr("قراءة السياق")], ['recite', tr("إخفاء وتسميع")], ['summary', tr("ملخص")]] as const).map(([k, l], n) => <li key={k} aria-current={stage === k ? 'step' : undefined} className={cn('rounded-full border px-3 py-1', stage === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')} data-testid={`step-word-practice-${k}`}>{num(n + 1)}. {l}</li>)}
      </ol>
      <section className="rounded-2xl border bg-card px-4 py-6 sm:px-10" aria-label={source.title}>
        <h3 className="mb-3 font-display text-lg font-bold">{source.title}</h3>
        <p className="hadith-text leading-[2.4]" style={{ fontSize: 'clamp(21px, 2.6vw, 30px)' }} data-testid="word-practice-passage">
          {passage.map((w, i) => word(w, i, stage === 'recite' && !revealed && local.has(i) && !r.revealed[i]))}
        </p>
        {stage === 'read' && <p className="mt-3 font-ui text-xs text-muted-foreground" data-testid="text-word-practice-read">{tr("اقرأ المقطع بتأنٍّ. الكلمات المظللة هي ما اخترتَه؛ ستُخفى في المرحلة التالية دون تغيير النص المرجعي.")}</p>}
      </section>

      {stage === 'read' && <div className="flex flex-wrap gap-2">
        <button type="button" onClick={begin} className={cn(btn, 'bg-primary text-primary-foreground')} data-testid="button-word-practice-hide"><Eye size={15} />{tr("أخفِ الكلمات وسمّع")}</button>
        <button type="button" onClick={onReselect} className={cn(btn, 'border')} data-testid="button-word-practice-reselect">{tr("اختيار جديد من النص الحالي")}</button>
      </div>}

      {stage === 'recite' && (
        <div className="space-y-3">
          {!consented ? (
            <div className="space-y-3 rounded-2xl border bg-card p-4 font-ui text-xs leading-relaxed" data-testid="word-practice-consent">
              <label className="flex gap-2"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} data-testid="checkbox-word-practice-mic" />
                <span>{tr("أوافق على استخدام الميكروفون. قد ترسل خدمة التعرّف في المتصفح صوتي إلى مزوّد خارجي. لا تحفظ المنصة صوتاً ولا نصاً مسموعاً كاملاً. لا يُحفظ التمرين أو محاولاته إلا بموافقتي المنفصلة. يُسجَّل يوم النشاط عند تحقق شروط التسميع الفعلي دون محتوى صوتي؛ الاختيار والحفظ والكشف لا تزيد الاستمرارية.")}</span></label>
              <button type="button" disabled={!agree} onClick={confirm} className={cn(btn, 'bg-primary text-primary-foreground')} data-testid="button-word-practice-mic-confirm"><Mic size={15} />{tr("ابدأ التسميع")}</button>
            </div>
          ) : !revealed && (
            <div className="flex flex-wrap items-center gap-2">
              {r.listening
                ? <button type="button" onClick={r.stop} className={cn(btn, 'bg-secondary text-secondary-foreground')} data-testid="button-word-practice-pause"><Pause size={15} />{tr("إيقاف مؤقت")}</button>
                 : <button type="button" onClick={r.start} disabled={r.supported === false || r.cursor >= r.words.length} className={cn(btn, 'bg-primary text-primary-foreground')} data-testid="button-word-practice-resume"><Mic size={15} />{tr("متابعة")}</button>}
              {r.listening && <span role="status" className="font-ui text-xs font-bold text-secondary" data-testid="status-word-practice-listening">{tr("يستمع الآن")}</span>}
               {r.cursor >= r.words.length && <p role="status" className="font-ui text-xs" data-testid="status-word-practice-end">{tr("بلغ الالتقاط نهاية المقطع؛ أنهِ المحاولة لعرض المقارنة التقديرية.")}</p>}
               <button type="button" onClick={finish} disabled={r.finishing || !micAttempted} className={cn(btn, 'border-2 border-primary/70 text-primary')} data-testid="button-word-practice-finish"><Flag size={15} />{tr("أنهِ المحاولة")}</button>
            </div>
          )}
          {r.supported === false && <p role="alert" className="font-ui text-xs" data-testid="text-word-practice-unsupported">{tr("التسميع المباشر غير متاح في هذا المتصفح. اكشف الكلمات وراجعها قراءةً.")}</p>}
          {r.error && <p role="alert" className="font-ui text-xs text-destructive" data-testid="text-word-practice-mic-error">{r.error}</p>}
          {finishErr && <p role="alert" className="font-ui text-xs text-destructive">{tr("لم تُلتقط محاولة قابلة للتلخيص.")}</p>}
          {revealed && <p role="status" className="rounded-xl border bg-muted/50 p-3 font-ui text-xs" data-testid="text-word-practice-revealed">{tr("كُشفت الكلمات، والكشف لا يُسجَّل محاولة. يمكنك الإعادة.")}</p>}
          <div className="flex flex-wrap gap-2 font-ui text-xs font-bold">
            <button type="button" onClick={reveal} disabled={revealed} className={cn(btn, 'border')} data-testid="button-word-practice-reveal"><Eye size={15} />{tr("اكشف الكلمات")}</button>
            <button type="button" onClick={cancel} className={cn(btn, 'border')} data-testid="button-word-practice-cancel"><RotateCcw size={15} />{tr("إلغاء والعودة للقراءة")}</button>
          </div>
        </div>
      )}

      {stage === 'summary' && last && (
        <section className="space-y-3 rounded-2xl border bg-card p-4 font-ui text-sm" data-testid="word-practice-summary" aria-live="polite">
          <p data-testid="text-word-practice-status">{STATUS[last.status]}{tr(": غُطّيت")}{' '}{num(last.covered)}{' '}{tr("كلمة والتُقطت مطابقة")}{' '}{num(last.matched)}{tr(". وصف تقريبي من التعرّف الآلي، وليس درجة.")}</p>
          <ul className="flex flex-wrap gap-2">{targets.map((t) => <li key={t} className="hadith-text rounded-full border px-3 py-1 text-lg" data-testid={`summary-target-${t}`}>{source.words[t]}<span className="ms-2 font-ui text-[10px] text-muted-foreground">{lastMatched.has(t - range.start) ? 'التُقطت' : 'لم تُلتقط بوضوح'}</span></li>)}</ul>
          <button type="button" onClick={repeat} className={cn(btn, 'bg-primary text-primary-foreground')} data-testid="button-word-practice-repeat"><RotateCcw size={15} />{tr("كرّر التمرين")}</button>
        </section>
      )}

      {attempts.length > 0 && <section className="space-y-3 rounded-2xl border bg-card p-4 font-ui text-xs" data-testid="word-practice-progress">
        <h3 className="font-display text-lg font-bold">{tr("متابعة المقطع نفسه ·")}{' '}{num(attempts.length)}{' '}{tr("محاولة معروضة")}</h3>
        <p>{tr("تُعرض آخر ٢٠ محاولة هنا فقط. المقارنة تقريبية وليست درجة أو ادعاء إتقان؛ المحاولات الناقصة أو تعذّر التقييم لا تُعرض بنسبة صفر.")}</p>
        <ol className="space-y-2">{attempts.map((a, i) => <li key={a.requestId} className="flex flex-wrap justify-between gap-2 rounded-xl border p-3">
          <span>{tr("محاولة")}{' '}{num(i + 1)} · {STATUS[a.status]}{persisted.has(a.requestId) ? tr(" · محفوظة") : tr(" · غير محفوظة")}</span>
          <span>{a.status === 'comparable' ? fmt("تطابق تقريبي {a}٪ · {b} من {c}", "Approximate match {a}% · {b} of {c}", { a: num(Math.round(a.matched / passage.filter(normalizeRecitationWord).length * 100)), b: num(a.matched), c: num(passage.filter(normalizeRecitationWord).length) }) : tr("— لا نسبة للمقارنة")}</span>
        </li>)}</ol>
      </section>}
      {activity.error && <p role="alert" className="rounded-xl border p-3 font-ui text-xs">{tr("تعذّر تسجيل نشاط التسميع؛ لا ندّعي احتسابه قبل تأكيد الخادم.")}{' '}<button type="button" onClick={activity.retry} className="min-h-10 underline">{tr("إعادة المحاولة")}</button></p>}
      <SavePanel userId={userId} source={source} range={range} targets={targets} attempts={attempts} persisted={persisted} saved={saved} onSaved={onSaved} />
    </div>
  );
}

function SavePanel({ source, range, targets, attempts, persisted, saved, onSaved }: {
  userId: string; source: Source; range: Range; targets: number[]; attempts: Attempt[]; persisted: Set<string>; saved: SavedPractice | null; onSaved: (p: SavedPractice, ids: string[]) => void;
}) {
  const [consent, setConsent] = useState(false);
  const [withAttempts, setWithAttempts] = useState(false);
  const [attemptConsent, setAttemptConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const pendingId = useRef<{ sig: string; id: string } | null>(null);
  const bounded = attempts.slice(-20);
  const unsaved = attempts.filter((a) => !persisted.has(a.requestId));
  const sig = JSON.stringify([source.fingerprint, range, targets, withAttempts ? bounded : []]);
  const saveExercise = async () => {
    if (!consent || busy) return;
    if (pendingId.current?.sig !== sig) pendingId.current = { sig, id: crypto.randomUUID() };
    setBusy(true); setStatus(null);
    try {
      const included = withAttempts ? bounded : [];
      const p = await saveWordPractice({ requestId: pendingId.current.id, consent: true, hadithId: source.hadithId, fingerprint: source.fingerprint,
        tokenizerVersion: source.tokenizerVersion as 'arabic-whitespace-v1', start: range.start, end: range.end, targets, attempts: included });
      pendingId.current = null; onSaved(p, included.map((a) => a.requestId));
      setStatus({ ok: true, text: tr("حُفظ التمرين في حسابك. المحاولات التي لم تُدرجها لم تُحفظ.") });
    } catch (e) { setStatus({ ok: false, text: saveError(e) }); } finally { setBusy(false); }
  };
  const saveAttempt = async (a: Attempt) => {
    if (!saved || !attemptConsent || busy) return;
    setBusy(true); setStatus(null);
    try {
      const p = await saveWordPracticeAttempt(saved.id, { consent: true, fingerprint: source.fingerprint, attempt: a });
      onSaved(p, [a.requestId]); setStatus({ ok: true, text: tr("حُفظت المحاولة في التمرين المحفوظ.") });
    } catch (e) { setStatus({ ok: false, text: saveError(e, true) }); } finally { setBusy(false); }
  };
  const full = (saved?.attempts.length ?? 0) >= 20;
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 font-ui text-xs leading-relaxed" data-testid="word-practice-save">
      <h3 className="font-display text-base font-bold">{tr("الحفظ اختياري")}</h3>
      <p>{tr("لا يُحفظ شيء تلقائياً. يحفظ التمرين المقطع والكلمات المختارة وملخص كل محاولة (التغطية والمطابقة) فقط، دون صوت أو نص مسموع. يمكنك حذفه مع محاولاته من صفحة المراجعات؛ وهو مستقل عن تقارير التسميع.")}</p>
      {!saved ? (
        <>
          <label className="flex gap-2"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="checkbox-word-practice-save" /><span>{tr("أوافق على حفظ هذا التمرين في حسابي.")}</span></label>
          <label className="flex gap-2"><input type="checkbox" checked={withAttempts} disabled={!bounded.length} onChange={(e) => setWithAttempts(e.target.checked)} data-testid="checkbox-word-practice-attempts" /><span>{tr("أدرج ملخصات محاولاتي الأخيرة (")}{num(bounded.length)}{tr("، بحد أقصى ٢٠).")}</span></label>
          <button type="button" disabled={!consent || busy} onClick={saveExercise} className={cn(btn, 'bg-primary text-primary-foreground')} data-testid="button-word-practice-save"><Save size={15} />{busy ? tr("جارٍ الحفظ…") : tr("احفظ التمرين")}</button>
        </>
      ) : (
        <>
          <p className="flex items-center gap-2 font-bold" data-testid="text-word-practice-saved"><Check size={14} />{tr("التمرين محفوظ. المحاولات الجديدة لا تُحفظ إلا بموافقتك.")}</p>
          {full && <p role="status" data-testid="text-word-practice-attempts-full">{tr("بلغ التمرين المحفوظ ٢٠ محاولة؛ لن تُحفظ محاولات أخرى.")}</p>}
          {unsaved.length > 0 && !full && <label className="flex gap-2"><input type="checkbox" checked={attemptConsent} onChange={(e) => setAttemptConsent(e.target.checked)} data-testid="checkbox-word-practice-attempt-consent" /><span>{tr("أوافق على حفظ ملخص محاولة في هذا التمرين.")}</span></label>}
          <ul className="space-y-2">{unsaved.map((a, n) => <li key={a.requestId} className="flex items-center justify-between gap-2 rounded-lg border p-2" data-testid={`row-word-attempt-${a.requestId}`}>
            <span>{tr("محاولة")}{' '}{num(n + 1)}: {STATUS[a.status]}{' '}{tr("· غُطّيت")}{' '}{num(a.covered)}{' '}{tr("· مطابقة")}{' '}{num(a.matched)}</span>
            <button type="button" disabled={!attemptConsent || busy || full} onClick={() => saveAttempt(a)} className={cn(btn, 'min-h-9 border')} data-testid={`button-save-attempt-${a.requestId}`}>{tr("احفظ")}</button></li>)}</ul>
        </>
      )}
      {status && <p role={status.ok ? 'status' : 'alert'} className={status.ok ? '' : 'text-destructive'} data-testid="text-word-practice-save-status">{status.text}</p>}
    </section>
  );
}
