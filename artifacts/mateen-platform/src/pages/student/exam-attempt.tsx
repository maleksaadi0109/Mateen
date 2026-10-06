import { tr } from '@/lib/i18n';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAssessmentQueryKey, getGetAssessmentSummaryQueryKey, useGetAssessment, useHeartbeatAssessment, useSubmitAssessment,
} from '@workspace/api-client-react';
import { WifiOff } from 'lucide-react';
import { ErrorState, LoadingList, Notice, PageHeader } from '@/components/mateen/bits';
import { AttemptAudioPrivacy } from '@/components/assessment/AttemptAudioPrivacy';
import { ExamQuestion } from '@/components/assessment/ExamQuestion';
import { STATUS_LABEL, clock, errorMessage, isFinal, isPending, clampCursor, newMutationId, questionAnchor, resolveCursor, questionsVisible, sessionRequest, tabSessionId } from '@/lib/assessment';
import { num, usePageMeta } from '@/lib/mateen';

export default function ExamAttemptPage() {
  usePageMeta(tr("اختبار المستوى | مَتِين"), tr("محاولة اختبار المستوى."));
  const { attemptId = '' } = useParams<{ attemptId: string }>();
  const qc = useQueryClient();
  const sessionId = tabSessionId();
  const key = getGetAssessmentQueryKey(attemptId);
  const q = useGetAssessment(attemptId, { request: sessionRequest(sessionId), query: { queryKey: key, enabled: !!attemptId, refetchInterval: (query) => { const st = query.state.data?.status; return st && (isFinal(st) ) ? false : 20_000; } } });
  const beat = useHeartbeatAssessment();
  const submit = useSubmitAssessment();
  const [online, setOnline] = useState(navigator.onLine);
  const [lost, setLost] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const beatRef = useRef(beat.mutateAsync);
  beatRef.current = beat.mutateAsync;
  const cursor = useRef<number | null>(null);
  const total = q.data?.questions.length ?? 0;
  const serverPos = q.data?.currentQuestionPosition;
  const [restoreTick, setRestoreTick] = useState(0);
  const restored = useRef(-1);
  const setCursor = (i: number) => { cursor.current = clampCursor(i, total); };
  const status = q.data?.status;
  const live = status === 'in_progress' || status === 'paused_connection';

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    if (!live) return;
    let stop = false;
    const tick = async () => {
      try {
        await beatRef.current({ attemptId, data: { sessionId, currentQuestionPosition: resolveCursor(cursor.current, serverPos, total) } });
        if (stop) return;
        setLost((was) => { if (was) setRestoreTick((t) => t + 1); return false; });
        qc.invalidateQueries({ queryKey: getGetAssessmentQueryKey(attemptId) });
      } catch (e) {
        if (!stop) { setLost(true); if ((e as { status?: number })?.status === 409) setMsg(errorMessage(e, '')); }
      }
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => { stop = true; clearInterval(id); };
  }, [live, attemptId, sessionId, qc]);

  useEffect(() => {
    if (!q.data) return;
    setLeft(q.data.remainingSeconds);
    if (!questionsVisible(q.data.status, lost, online) || q.data.questions.length === 0) return;
    const id = setInterval(() => setLeft((v) => (v === null ? v : Math.max(0, v - 1))), 1000);
    return () => clearInterval(id);
  }, [q.data?.remainingSeconds, q.data?.status, q.data?.questions.length, lost, online]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = !!q.data && questionsVisible(q.data.status, lost, online);
  useEffect(() => {
    // Restore once on first healthy load and after each reconnect; never on plain refetches.
    if (!visible || restored.current === restoreTick) return;
    restored.current = restoreTick;
    const i = resolveCursor(cursor.current, serverPos, total);
    cursor.current = i;
    requestAnimationFrame(() => document.getElementById(questionAnchor(i))?.scrollIntoView({ block: 'start' }));
  }, [visible, restoreTick, serverPos, total]);

  if (q.isLoading) return <LoadingList rows={4} />;
  if (q.isError || !q.data) return <ErrorState message={tr("تعذّر تحميل المحاولة.")} onRetry={() => q.refetch()} />;
  const a = q.data;
  const disconnected = a.status === 'paused_connection' || lost || !online;

  const doSubmit = async () => {
    setMsg(null);
    try {
      await submit.mutateAsync({ attemptId, data: { sessionId, mutationId: newMutationId() } });
      setConfirming(false);
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: getGetAssessmentSummaryQueryKey() });
    } catch (e) { setMsg(errorMessage(e, tr("تعذّر التسليم. أعد المحاولة؛ إجاباتك محفوظة."))); }
  };

  return (
    <div>
      <PageHeader eyebrow={tr("اختبار المستوى")} title={STATUS_LABEL[a.status]}>
        {live && left !== null && <span className="font-display text-2xl" data-testid="text-remaining">{clock(left)}</span>}
      </PageHeader>
      <div className="space-y-5">
        {msg && <p role="alert" className="font-ui text-sm font-semibold text-secondary">{msg}</p>}
        {live && disconnected && (
          <div role="alert" className="paper-card flex items-start gap-3 p-6"><WifiOff className="text-secondary" />
            <div><p className="font-display font-bold">{tr("انقطع الاتصال بالخادم")}</p>
              <p className="font-arabic text-lg">{tr("أُخفيت الأسئلة وعُطّلت الإجابات والعدّ متوقف. عند عودة الاتصال تُستأنف المحاولة نفسها.")}</p></div></div>
        )}
        {questionsVisible(a.status, lost, online) && (
          <>
            <ul className="space-y-4">
              {a.questions.map((qu, i) => <ExamQuestion key={qu.id} index={i} onFocusQuestion={setCursor} attemptId={attemptId} sessionId={sessionId} q={qu} disabled={false} onChanged={() => qc.invalidateQueries({ queryKey: key })} />)}
            </ul>
            {!confirming ? (
              <button onClick={() => setConfirming(true)} className="rounded-full bg-secondary px-7 py-3 font-ui font-bold text-secondary-foreground" data-testid="button-submit-exam">{tr("تسليم الاختبار")}</button>
            ) : (
              <Notice title={tr("تأكيد التسليم")}>{tr("لن تتمكن من تعديل أي إجابة بعد التسليم. الأسئلة غير المجابة تُحتسب بلا درجة.")}<span className="mt-3 flex gap-2">
                  <button onClick={doSubmit} disabled={submit.isPending} className="rounded-full bg-secondary px-5 py-2 font-ui text-sm font-bold text-secondary-foreground disabled:opacity-50">{submit.isPending ? tr("جارٍ التسليم...") : tr("سلّم الآن")}</button>
                  <button onClick={() => setConfirming(false)} className="rounded-full border px-5 py-2 font-ui text-sm font-bold">{tr("رجوع")}</button>
                </span></Notice>
            )}
          </>
        )}
        {!live && <AttemptAudioPrivacy attemptId={attemptId} sessionId={sessionId} questions={a.questions} />}
        {isPending(a.status) && (
          <Notice title={a.status === 'technical_review' ? tr("مراجعة تقنية") : tr("بانتظار المراجعة البشرية")}>
            {a.status === 'technical_review' ? tr("ظهرت مشكلة تقنية في بعض التسجيلات. لا درجة معروضة، ولا انتظار تعليمي بسبب العطل التقني.") : tr("سلّمت اختبارك. يستمع مراجع بشري إلى التسجيلات الشفوية، ولا تُعرض درجة قبل اكتمال ذلك.")}
          </Notice>
        )}
        {isFinal(a.status) && a.result && (
          <section className="paper-card p-6" data-testid="panel-exam-result">
            <p className="font-display text-4xl font-bold">{num(a.result.score)} <span className="text-xl text-muted-foreground">{tr("من ٣٠")}</span></p>
            <p className="mt-2 font-arabic text-xl">{a.result.passed ? tr("اجتزت المستوى التمهيدي.") : tr("لم تبلغ درجة النجاح.")}</p>
            <p className="font-ui text-sm text-muted-foreground">{tr("تحريري")}{' '}{num(a.result.writtenScore)}{' '}{tr("· شفوي")}{' '}{num(a.result.oralScore)}</p>
            {a.result.retryAvailableAt && <p className="mt-2 font-ui text-sm">{tr("تُتاح المحاولة التالية:")}{' '}{new Date(a.result.retryAvailableAt).toLocaleString('ar')}</p>}
            <p className="mt-3 font-ui text-xs leading-6 text-muted-foreground">{a.result.retentionNotice}</p>
            {a.result.answers.some((x) => x.differences.length > 0) && <h3 className="mt-5 font-display font-bold">{tr("فروق مؤكدة بعد المراجعة")}</h3>}
            <ul className="mt-2 space-y-3">
              {a.result.answers.filter((x) => x.differences.length > 0).map((x) => (
                <li key={x.questionId} className="rounded-xl border p-3 font-arabic text-lg leading-9">
                  <p><span className="font-ui text-xs text-muted-foreground">{tr("المرجع:")}{' '}</span>{x.expectedText}</p>
                  <p><span className="font-ui text-xs text-muted-foreground">{x.provenance === 'human_verified_oral' ? tr("ما سمعه المراجع: ") : tr("إجابتك: ")}</span>{x.submittedText ?? tr("لا إجابة")}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
        <Link href="/student/exams" className="inline-block font-ui font-bold text-secondary underline underline-offset-4">{tr("إلى صفحة الاختبارات")}</Link>
      </div>
    </div>
  );
}
