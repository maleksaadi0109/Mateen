import { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowRight, Flag, Mic, Pause } from 'lucide-react';
import { finishStageAttempt, startStageAttempt, getGetLearningMapQueryKey, type StageFinishInput, type StageOutcome } from '@workspace/api-client-react';
import { useLiveRecitation } from '@/hooks/use-live-recitation';
import { boundedChatRequest } from '@/lib/chat-request';
import { num } from '@/lib/mateen';
import { ExamReview, LiveExamBook, type ExamSnapshot } from './exam-book';

type Props = {
  hadith: { id: number; number: number; title: string; text: string };
  onClose: () => void;
  textId?: 'nawawi' | 'tuhfa';
  nextHref?: string;
};
const primary = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 font-ui text-sm font-bold text-primary-foreground disabled:opacity-40';
const secondary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 py-2 font-ui text-sm font-bold disabled:opacity-40';

export default function StageExam(props: Props) {
  const { user } = useUser();
  return <StageExamContent key={`${user?.id}:${props.textId ?? 'nawawi'}:${props.hadith.id}`} {...props} />;
}

function StageExamContent({ hadith, onClose, textId = 'nawawi', nextHref }: Props) {
  const poem = textId === 'tuhfa';
  const r = useLiveRecitation(hadith.text, { continuousFeedback: true });
  const qc = useQueryClient();
  const [consent, setConsent] = useState(false);
  const [attempt, setAttempt] = useState<{ id: string; expiresAt: string } | null>(null);
  const [payload, setPayload] = useState<StageFinishInput | null>(null);
  const [outcome, setOutcome] = useState<StageOutcome | null>(null);
  const [snapshot, setSnapshot] = useState<ExamSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(crypto.randomUUID());
  const mounted = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const begin = async () => {
    if (!consent || inFlight.current || !r.supported) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const next = await boundedChatRequest(signal =>
        startStageAttempt(textId, hadith.number, { requestId: requestId.current, consent: true }, { signal }), 20_000);
      if (!mounted.current) return;
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hadith.text));
      const localHash = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
      if (!mounted.current) return;
      if (next.sourceHash !== localHash) {
        setError('تغيّرت نسخة النص. أعد تحميل الصفحة قبل بدء محاولة جديدة حتى يتطابق النص مع التدريب.');
        return;
      }
      setAttempt(next); r.reset(); r.start();
    } catch {
      if (mounted.current) setError('تعذّر بدء التدريب. تحقق من الاتصال وأن المرحلة السابقة مجتازة، ثم أعد المحاولة.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const finish = async () => {
    if (!attempt || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      let data = payload;
      if (!data) {
        const summary = await r.finish(); // Flush final native result before scoring.
        if (!summary || !mounted.current) return;
        data = { matchedIndices: summary.matchedIndices, issues: summary.issues.map(({ index, kind }) => ({ index, kind })) };
        setSnapshot({ words: [...r.words], matched: [...summary.matchedIndices], issues: summary.issues.map((i) => ({ ...i })) });
        setPayload(data);
      }
      const result = await boundedChatRequest(signal => finishStageAttempt(attempt.id, data!, { signal }), 20_000);
      if (!mounted.current) return;
      setOutcome(result);
      void qc.invalidateQueries({ queryKey: getGetLearningMapQueryKey(textId) });
    } catch {
      if (mounted.current) setError('تعذّر تثبيت النتيجة. لا تُفتح المرحلة التالية قبل تأكيد الخادم. يمكنك إعادة إرسال المحاولة نفسها دون تكرار التسميع؛ وإذا انتهت مهلة الساعة فابدأ محاولة جديدة.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const reset = () => {
    if (inFlight.current) return;
    r.reset(); setAttempt(null); setPayload(null); setOutcome(null); setSnapshot(null); setError(''); requestId.current = crypto.randomUUID();
  };
  const close = () => { if (!inFlight.current) { r.stop(); onClose(); } };

  return (
    <section className="mx-auto max-w-3xl space-y-5 py-3" data-testid="stage-exam">
      <button type="button" className={secondary} onClick={close} disabled={busy} data-testid="button-stage-exam-back"><ArrowRight size={16} />العودة للدراسة</button>
      <header className="paper-card space-y-3 p-5 sm:p-8">
        <p className="font-ui text-xs font-bold text-secondary">{poem ? 'تسميع البيت' : 'تدريب المرحلة'} {num(hadith.number)}</p>
        <h1 className="font-display text-3xl font-bold">{hadith.title}</h1>
        <p className="font-ui text-sm leading-loose text-muted-foreground">{poem
          ? 'سمّع البيت كاملًا بشطريه. يُفتح البيت التالي عند إكماله وتطابق أكثر من ٩٠٪ من كلماته (٩٠٪ تمامًا لا تكفي). تظهر الكلمات أثناء التسميع، وتُعرض الاختلافات بعد الإنهاء. تُفتح المرحلة التالية بعد اجتياز كل أبيات هذا الباب.'
          : 'سمّع الحديث كاملًا كما درسته، بالسند والعزو. يُفتح الحديث التالي عند إكمال المقطع وتطابق أكثر من ٩٠٪ من كلماته (٩٠٪ تمامًا لا تكفي). تظهر كلماتك في صفحة الكتاب كلما سمّعتها، وتُعرض الاختلافات كلها بعد الإنهاء فقط. بعد كل سبع مراحل مجتازة يُفتح امتحان المجموعة في الخريطة.'}</p>
        <p className="rounded-xl border border-secondary/30 bg-secondary/5 p-3 font-ui text-xs leading-loose" data-testid="stage-exam-disclaimer">هذا اجتياز تدريبي تقريبي بالتعرّف الآلي؛ ليس اعتمادًا للحفظ ولا تقييمًا للنطق أو التشكيل.</p>
      </header>

      {outcome ? (
        <div className="paper-card space-y-5 p-4 sm:p-8" data-testid="stage-exam-result">
          {snapshot ? <ExamReview snapshot={snapshot} outcome={outcome} title={hadith.title} unit={poem ? 'البيت' : 'الحديث'} /> : <>
            <h2 className="font-display text-2xl font-bold" data-testid="stage-result-title">{outcome.passed ? 'اجتزت هذه المرحلة' : !outcome.complete ? 'لم يكتمل المقطع بعد' : 'تحتاج إلى مزيد من التدريب'}</h2>
            <p className="font-display text-5xl font-bold text-primary" data-testid="stage-result-percent">{num(outcome.percent)}٪</p>
          </>}
          <h2 className="sr-only" data-testid={snapshot ? 'stage-result-title' : undefined}>{outcome.passed ? 'اجتزت هذه المرحلة' : !outcome.complete ? 'لم يكتمل المقطع بعد' : 'تحتاج إلى مزيد من التدريب'}</h2>
          <div className="flex flex-wrap justify-center gap-2">
            {outcome.nextStage && (!poem || nextHref) && <Link className={primary} href={nextHref ?? `/student/learn/nawawi/${outcome.nextStage}`} data-testid="button-stage-next">{poem ? 'البيت التالي' : 'المرحلة التالية'}</Link>}
            {outcome.passed && !outcome.nextStage && !poem && <Link className={primary} href="/student/learn/nawawi/checkpoint/6" data-testid="button-stage-final-checkpoint">امتحان المجموعة الأخيرة</Link>}
            {outcome.passed && !outcome.nextStage && poem && <p role="status" className="font-bold text-secondary">أتممت تسميع أبيات تحفة الأطفال.</p>}
            <Link className={secondary} href={`/student/learn/${textId}`} data-testid="button-stage-result-map">خريطة التعلّم</Link>
            <button type="button" className={secondary} onClick={reset} data-testid="button-stage-retry">محاولة جديدة</button>
          </div>
        </div>
      ) : (
        <div className="paper-card space-y-5 p-5 sm:p-8">
          {!attempt ? <>
            <label className="flex items-start gap-3 rounded-xl border bg-background p-4 font-ui text-sm leading-loose">
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={busy} className="mt-2 h-4 w-4 shrink-0" data-testid="checkbox-stage-consent" />
              <span>أوافق على استخدام الميكروفون. قد تعالج خدمة المتصفح الصوت خارجيًا. عند إنهاء التدريب تُرسل مواضع الكلمات المطابقة وأنواع الاختلافات لحساب نتيجة المرحلة وحفظ تقدّمي في حسابي، دون تسجيل صوتي أو نص مسموع كامل.</span>
            </label>
            {r.supported === false && <p role="alert" className="font-ui text-sm" data-testid="stage-mic-unsupported">التعرّف الصوتي غير متاح في متصفحك. يمكنك العودة للدراسة والتجربة بمتصفح يدعمه؛ لن تُسجّل نتيجة وهمية.</p>}
            <button type="button" className={`${primary} w-full`} onClick={begin} disabled={!consent || !r.supported || busy} data-testid="button-stage-start"><Mic size={18} />{busy ? 'جارٍ بدء المحاولة…' : 'بدء تدريب المرحلة'}</button>
          </> : <>
            <p className="flex items-center justify-center gap-2 font-ui text-sm font-bold" role="status" data-testid="stage-listening-status"><Mic size={16} className={r.listening ? 'animate-pulse text-secondary motion-reduce:animate-none' : 'text-muted-foreground'} />{r.listening ? 'يستمع الآن — تابع التسميع' : 'الميكروفون متوقف'}</p>
            <LiveExamBook words={r.words} revealed={r.revealed} interimIndices={r.interimIndices} listening={r.listening} title={hadith.title} />
            <p className="text-center font-ui text-xs text-muted-foreground">المحاولة متاحة لمدة ساعة. إغلاق الصفحة قبل تثبيت النتيجة يتطلب بدء محاولة جديدة.</p>
            {!payload && <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className={secondary} disabled={busy || r.finishing} onClick={r.listening ? r.stop : r.start} data-testid="button-stage-pause">{r.listening ? <><Pause size={16} />إيقاف مؤقت</> : <><Mic size={16} />متابعة التسميع</>}</button>
              <button type="button" className={primary} disabled={busy || r.finishing || r.attemptedCount === 0} onClick={finish} data-testid="button-stage-finish"><Flag size={16} />{busy ? 'جارٍ احتساب النتيجة…' : 'إنهاء التدريب'}</button>
            </div>}
            {payload && !outcome && <button type="button" className={`${primary} w-full`} disabled={busy} onClick={finish} data-testid="button-stage-submit-retry">{busy ? 'جارٍ تثبيت النتيجة…' : 'إعادة إرسال النتيجة'}</button>}
            <button type="button" className={secondary} disabled={busy} onClick={reset} data-testid="button-stage-reset">بدء محاولة جديدة</button>
          </>}
          {(error || r.error) && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 font-ui text-sm text-destructive" data-testid="stage-exam-error">{error || r.error}</p>}
        </div>
      )}
    </section>
  );
}