import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'wouter';
import { useUser } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, ChevronDown, Flag, Lock, Mic, Pause, RotateCcw, ShieldAlert, X } from 'lucide-react';
import {
  finishStageAttempt, getGetLearningMapQueryKey, getGetStudyTextQueryKey, startStageAttempt, useGetStudyText,
  type StageFinishInput, type StageOutcome,
} from '@workspace/api-client-react';
import { EmptyState, ErrorState, SkeletonBlock } from '@/components/mateen/bits';
import BookMascot from '@/components/mateen/book-mascot';
import { ExamReview, LiveExamBook, type ExamSnapshot } from '@/components/mateen/exam-book';
import { useLiveRecitation } from '@/hooks/use-live-recitation';
import { boundedChatRequest } from '@/lib/chat-request';
import { num, usePageMeta } from '@/lib/mateen';
import { cn } from '@/lib/utils';
import { useNawawiMap } from './learning-map';

export const CHECKPOINT_SIZE = 7;
const QUESTIONS = 5;
type Hadith = { id: number; number: number; title: string; text: string };
type Result = { number: number; title: string; outcome: StageOutcome; snapshot: ExamSnapshot | null };

const primary = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-secondary px-6 py-3 font-ui text-sm font-bold text-secondary-foreground shadow-[0_4px_0_hsl(24_90%_20%)] transition active:translate-y-1 active:shadow-none disabled:opacity-40 disabled:shadow-none';
const secondary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border bg-card px-5 py-2 font-ui text-sm font-bold hover:bg-muted disabled:opacity-40';

/** Unbiased integer in [0, max) via rejection sampling on crypto randomness. */
function randomBelow(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) { crypto.getRandomValues(buf); if (buf[0] < limit) return buf[0] % max; }
}
function pickFive(numbers: number[]): number[] {
  const a = [...numbers];
  for (let i = a.length - 1; i > 0; i--) { const j = randomBelow(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, QUESTIONS);
}

export default function LearningCheckpointPage() {
  const { textId, group } = useParams<{ textId: string; group: string }>();
  const g = Number(group);
  usePageMeta(`امتحان المجموعة ${num(g || 0)} | مَتِين`, 'امتحان تدريبي بخمسة أحاديث عشوائية من سبع مراحل مجتازة.');
  const { user } = useUser();
  const map = useNawawiMap();
  const text = useGetStudyText('nawawi', { query: { queryKey: getGetStudyTextQueryKey('nawawi') } });
  const back = <Link href="/student/learn/nawawi" className="font-bold text-secondary" data-testid="link-back-map">العودة للخريطة</Link>;

  if (textId !== 'nawawi' || !Number.isInteger(g) || g < 1) return <EmptyState title="امتحان غير موجود">{back}</EmptyState>;
  if (map.isLoading || text.isLoading) return <div className="mx-auto grid max-w-2xl gap-4"><SkeletonBlock className="h-40" /><SkeletonBlock className="h-72" /></div>;
  if (map.isError) return <ErrorState message="تعذّر تحميل حالة المراحل." onRetry={() => map.refetch()} />;
  if (text.isError) return <ErrorState message="تعذّر تحميل نصوص الأحاديث." onRetry={() => text.refetch()} />;

  const from = (g - 1) * CHECKPOINT_SIZE + 1, to = g * CHECKPOINT_SIZE;
  const stages = (map.data?.stages ?? []).filter((s) => s.number >= from && s.number <= to);
  const hadiths = (text.data?.hadiths ?? []).filter((h) => h.number >= from && h.number <= to);
  if (stages.length !== CHECKPOINT_SIZE || hadiths.length !== CHECKPOINT_SIZE) return <EmptyState title="امتحان غير موجود">{back}</EmptyState>;
  const passed = stages.filter((s) => s.status === 'passed').length;
  if (passed < CHECKPOINT_SIZE) return (
    <EmptyState icon={<Lock size={30} className="text-muted-foreground" />} title={`امتحان المجموعة ${num(g)} مغلق`}>
      <span data-testid="text-checkpoint-locked">يُفتح بعد اجتياز المراحل {num(from)}–{num(to)} كلها بتدريب المرحلة. اجتزت {num(passed)} من {num(CHECKPOINT_SIZE)}.</span>{' '}{back}
    </EmptyState>
  );
  return <CheckpointRun key={`${user?.id ?? 'guest'}:${g}`} group={g} from={from} to={to} hadiths={hadiths} sourceStatus={text.data?.sourceStatus} />;
}

function CheckpointRun({ group, from, to, hadiths }: { group: number; from: number; to: number; hadiths: Hadith[]; sourceStatus?: unknown }) {
  const [round, setRound] = useState(0);
  const [picks, setPicks] = useState(() => pickFive(hadiths.map((h) => h.number)));
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [consent, setConsent] = useState(false);
  const [locked, setLocked] = useState(false);
  const qc = useQueryClient();
  const done = results.length === QUESTIONS;
  const current = hadiths.find((h) => h.number === picks[index])!;

  const restart = () => { setPicks(pickFive(hadiths.map((h) => h.number))); setIndex(0); setResults([]); setRound((r) => r + 1); setLocked(false); };
  const record = (outcome: StageOutcome, snapshot: ExamSnapshot | null) => {
    setResults((rs) => [...rs, { number: current.number, title: current.title, outcome, snapshot }]);
  };

  return (
    <section className="mx-auto max-w-3xl space-y-5 py-2" data-testid="checkpoint-exam">
      <Link href="/student/learn/nawawi" className={cn(secondary, locked && 'pointer-events-none opacity-40')} aria-disabled={locked} data-testid="button-checkpoint-back"><ArrowRight size={16} />الخريطة</Link>
      <header className="paper-card relative overflow-hidden p-5 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="font-ui text-xs font-bold text-secondary" data-testid="text-checkpoint-range">امتحان المجموعة {num(group)} · الأحاديث {num(from)}–{num(to)}</p>
            <h1 className="font-display text-3xl font-bold sm:text-4xl">خمسة أحاديث من سبعة</h1>
            <p className="font-ui text-sm leading-loose text-muted-foreground">اختيرت خمسة أحاديث مختلفة عشوائياً من هذه المجموعة. سمّع كل حديث كاملاً بالسند والعزو؛ تظهر كلماتك في صفحة الكتاب كلما سمّعتها، والاختلافات بعد إنهاء كل سؤال. يُعدّ السؤال مجتازًا عند تجاوز ٩٠٪ تمامًا.</p>
          </div>
          <BookMascot size={64} mood={done ? 'calm' : 'cheer'} className="shrink-0" />
        </div>
        <ol className="mt-5 flex gap-2" aria-label="تقدم الأسئلة">
          {picks.map((p, i) => {
            const r = results[i];
            return <li key={`${round}-${p}`} className={cn('h-2.5 flex-1 rounded-full transition-colors duration-500', r ? (r.outcome.passed ? 'bg-secondary' : 'bg-destructive/60') : i === index && !done ? 'bg-secondary/40' : 'bg-muted')} />;
          })}
        </ol>
        <p className="mt-4 rounded-xl border border-secondary/30 bg-secondary/5 p-3 font-ui text-xs leading-loose" data-testid="checkpoint-disclaimer"><ShieldAlert size={14} className="me-1 inline" />امتحان تدريبي تقريبي بالتعرّف الآلي، وليس اعتماداً رسمياً للحفظ ولا شهادة.</p>
        <p className="mt-2 font-ui text-xs leading-loose text-muted-foreground">ملخص هذه الجولة يبقى في الصفحة فقط؛ مغادرتها أو تحديثها يبدأ اختيارًا عشوائيًا جديدًا.</p>
      </header>

      {done ? <Summary results={results} onRestart={restart} /> : !consent ? (
        <div className="paper-card space-y-4 p-5 sm:p-8">
          <label className="flex items-start gap-3 rounded-xl border bg-background p-4 font-ui text-sm leading-loose">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-2 h-4 w-4 shrink-0" data-testid="checkbox-checkpoint-consent" />
            <span>أوافق على استخدام الميكروفون لخمسة أسئلة متتالية. قد تعالج خدمة المتصفح الصوت خارجياً. تُرسل مواضع الكلمات المطابقة وأنواع الاختلافات فقط، دون تسجيل صوتي أو نص كامل.</span>
          </label>
        </div>
      ) : (
        <Question key={`${round}:${index}`} hadith={current} position={index + 1} onLock={setLocked} onOutcome={record} onNext={() => setIndex((i) => Math.min(i + 1, QUESTIONS - 1))} isLast={index === QUESTIONS - 1} />
      )}
    </section>
  );
}

function Question({ hadith, position, onLock, onOutcome, onNext, isLast }: { hadith: Hadith; position: number; onLock: (v: boolean) => void; onOutcome: (o: StageOutcome, s: ExamSnapshot | null) => void; onNext: () => void; isLast: boolean }) {
  const r = useLiveRecitation(hadith.text, { continuousFeedback: true });
  const [attempt, setAttempt] = useState<{ id: string } | null>(null);
  const [payload, setPayload] = useState<StageFinishInput | null>(null);
  const [outcome, setOutcome] = useState<StageOutcome | null>(null);
  const [snapshot, setSnapshot] = useState<ExamSnapshot | null>(null);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(crypto.randomUUID());
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const stopRef = useRef(r.stop);
  stopRef.current = r.stop;
  const lockRef = useRef(onLock);
  lockRef.current = onLock;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stopRef.current(); lockRef.current(false); }; }, []);
  useEffect(() => { lockRef.current(busy); }, [busy]);

  const begin = async () => {
    if (inFlight.current || !r.supported) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const next = await boundedChatRequest((signal) => startStageAttempt('nawawi', hadith.number, { requestId: requestId.current, consent: true }, { signal }), 20_000);
      if (!mounted.current) return;
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hadith.text));
      const localHash = Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
      if (!mounted.current) return;
      if (next.sourceHash !== localHash) { setError('تغيّرت نسخة الحديث. أعد تحميل الصفحة قبل المتابعة حتى يتطابق النص مع الامتحان.'); return; }
      setAttempt(next); r.reset(); r.start();
    } catch {
      if (mounted.current) setError('تعذّر بدء السؤال. تحقق من الاتصال ثم أعد المحاولة.');
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };

  const finish = async () => {
    if (!attempt || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      let data = payload;
      if (!data) {
        const summary = await r.finish();
        if (!summary || !mounted.current) return;
        data = { matchedIndices: summary.matchedIndices, issues: summary.issues.map(({ index, kind }) => ({ index, kind })) };
        setSnapshot({ words: [...r.words], matched: [...summary.matchedIndices], issues: summary.issues.map((i) => ({ ...i })) });
        setPayload(data);
      }
      const result = await boundedChatRequest((signal) => finishStageAttempt(attempt.id, data!, { signal }), 20_000);
      if (!mounted.current) return;
      setOutcome(result);
      void qc.invalidateQueries({ queryKey: getGetLearningMapQueryKey('nawawi') });
    } catch {
      if (mounted.current) setError('تعذّر تثبيت نتيجة السؤال. يمكنك إعادة الإرسال دون تكرار التسميع.');
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };

  return (
    <div className="paper-card space-y-5 p-5 sm:p-8" data-testid="checkpoint-question">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-ui text-sm font-bold text-secondary" data-testid="text-question-position">السؤال {num(position)} من {num(QUESTIONS)}</p>
        <p className="font-ui text-xs text-muted-foreground">الحديث {num(hadith.number)}</p>
      </div>
      <h2 className="font-display text-2xl font-bold sm:text-3xl" data-testid="text-question-title">{hadith.title}</h2>
      {outcome ? (
        <div className="space-y-4">
          {snapshot ? <ExamReview snapshot={snapshot} outcome={outcome} title={hadith.title} /> : <p className="font-display text-4xl font-bold text-primary">{num(outcome.percent)}٪</p>}
          <button type="button" className={`${primary} w-full`} onClick={() => { onOutcome(outcome, snapshot); if (!isLast) onNext(); }} data-testid="button-question-next">{isLast ? 'عرض الملخص' : 'السؤال التالي'}</button>
        </div>
      ) : !attempt ? (
        <>
          {r.supported === false && <p role="alert" className="font-ui text-sm">التعرّف الصوتي غير متاح في متصفحك؛ لن تُسجّل نتيجة وهمية.</p>}
          <button type="button" className={`${primary} w-full`} onClick={begin} disabled={!r.supported || busy} data-testid="button-question-start"><Mic size={18} />{busy ? 'جارٍ البدء…' : 'ابدأ تسميع هذا الحديث'}</button>
        </>
      ) : (
        <>
          <p className="flex items-center justify-center gap-2 font-ui text-sm font-bold" role="status" data-testid="text-question-listening"><Mic size={16} className={cn(r.listening ? 'animate-pulse text-secondary motion-reduce:animate-none' : 'text-muted-foreground')} />{r.listening ? 'يستمع الآن، تابع التسميع' : 'الميكروفون متوقف'}</p>
          <LiveExamBook words={r.words} revealed={r.revealed} interimIndices={r.interimIndices} listening={r.listening} title={hadith.title} />
          {!payload ? (
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className={secondary} disabled={busy || r.finishing} onClick={r.listening ? r.stop : r.start} data-testid="button-question-pause">{r.listening ? <><Pause size={16} />إيقاف مؤقت</> : <><Mic size={16} />متابعة</>}</button>
              <button type="button" className={primary} disabled={busy || r.finishing || r.attemptedCount === 0} onClick={finish} data-testid="button-question-finish"><Flag size={16} />{busy ? 'جارٍ الاحتساب…' : 'إنهاء السؤال'}</button>
            </div>
          ) : <button type="button" className={`${primary} w-full`} disabled={busy} onClick={finish} data-testid="button-question-resubmit">{busy ? 'جارٍ التثبيت…' : 'إعادة إرسال النتيجة'}</button>}
        </>
      )}
      {(error || r.error) && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 font-ui text-sm text-destructive" data-testid="checkpoint-error">{error || r.error}</p>}
    </div>
  );
}

function Summary({ results, onRestart }: { results: Result[]; onRestart: () => void }) {
  const ok = results.filter((r) => r.outcome.passed).length;
  return (
    <div className="paper-card space-y-5 p-5 sm:p-8" data-testid="checkpoint-summary">
      <div className="text-center">
        <p className="font-ui text-xs font-bold text-secondary">الملخص التقريبي</p>
        <p className="mt-1 font-display text-5xl font-bold text-primary" data-testid="text-summary-score">{num(ok)} / {num(QUESTIONS)}</p>
        <p className="mt-2 font-ui text-sm text-muted-foreground">{ok === QUESTIONS ? 'تجاوزت ٩٠٪ في الأحاديث الخمسة لهذه المحاولة.' : 'افتح كل حديث لترى اختلافاته، ثم أعد الامتحان.'}</p>
      </div>
      <ul className="space-y-2">
        {results.map((r, i) => (
          <li key={r.number} className="rounded-2xl border bg-card" data-testid={`summary-row-${r.number}`}>
            <details className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 p-3 font-ui text-sm [&::-webkit-details-marker]:hidden">
                <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full', r.outcome.passed ? 'bg-secondary/15 text-secondary' : 'bg-destructive/10 text-destructive')}>{r.outcome.passed ? <Check size={16} /> : <X size={16} />}</span>
                <span className="min-w-0 flex-1"><span className="text-xs text-muted-foreground">{num(i + 1)}. الحديث {num(r.number)}</span><span className="block truncate font-bold">{r.title}</span></span>
                <span className="shrink-0 text-end"><span className="block font-bold">{num(r.outcome.percent)}٪</span><span className="text-xs text-muted-foreground">{num(r.outcome.matched)}/{num(r.outcome.total)}{!r.outcome.complete && ' · غير مكتمل'}</span></span>
                <ChevronDown size={18} aria-hidden className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                <span className="sr-only">عرض التفاصيل</span>
              </summary>
              <div className="space-y-3 border-t p-3 sm:p-5">
                {r.snapshot ? <ExamReview snapshot={r.snapshot} outcome={r.outcome} title={r.title} compact /> : <p className="font-ui text-xs text-muted-foreground">تفاصيل الكلمات غير متاحة لهذا السؤال.</p>}
                <Link href={`/student/learn/nawawi/${r.number}`} className="inline-flex min-h-11 items-center font-ui text-xs font-bold text-secondary underline underline-offset-4">مراجعة الحديث</Link>
              </div>
            </details>
          </li>
        ))}
      </ul>
      <p className="font-ui text-xs leading-loose text-muted-foreground">نتيجة تدريبية تقريبية فقط؛ ليست شهادة ولا اعتماداً رسمياً، ولا تغيّر فتح المراحل الحالي.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className={primary} onClick={onRestart} data-testid="button-checkpoint-restart"><RotateCcw size={16} />إعادة الامتحان كاملاً</button>
        <Link href="/student/learn/nawawi" className={secondary}>خريطة التعلّم</Link>
      </div>
    </div>
  );
}
