import { tr } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import { Link, Redirect } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getAssessmentReviewAudio, getGetAssessmentReviewQueryKey, getGetAssessmentReviewerAccessQueryKey, getListAssessmentReviewQueueQueryKey,
  useAdjudicateAssessmentOral, useGetAssessmentReview, useGetAssessmentReviewerAccess, useListAssessmentReviewQueue,
} from '@workspace/api-client-react';
import type { AssessmentReviewAnswer } from '@workspace/api-client-react';
import { EmptyState, ErrorState, LoadingList, PageHeader } from '@/components/mateen/bits';
import { errorMessage } from '@/lib/assessment';
import { fmtDate, num, useAuthReady, usePageMeta } from '@/lib/mateen';

function useAudioBlob(attemptId: string, questionId: string, enabled: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let made: string | null = null, dead = false;
    const ac = new AbortController();
    getAssessmentReviewAudio(attemptId, questionId, { signal: ac.signal, responseType: 'blob' })
      .then((b) => { if (dead) return; made = URL.createObjectURL(b); setUrl(made); })
      .catch(() => { if (!dead) setErr(true); });
    return () => { dead = true; ac.abort(); if (made) URL.revokeObjectURL(made); setUrl(null); setErr(false); };
  }, [attemptId, questionId, enabled]);
  return { url, err };
}

function Answer({ attemptId, a }: { attemptId: string; a: AssessmentReviewAnswer }) {
  const qc = useQueryClient();
  const adj = useAdjudicateAssessmentOral();
  const audio = useAudioBlob(attemptId, a.questionId, a.audioAvailable && a.status === 'pending');
  const [transcriptText, setTr] = useState('');
  const [issue, setIssue] = useState('');
  const [heard, setHeard] = useState(false);
  const [ref, setRef] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const send = async (technical: boolean) => {
    setMsg(null);
    try {
      await adj.mutateAsync({ attemptId, data: { questionId: a.questionId, transcript: technical ? null : transcriptText, technicalIssue: technical ? issue : null, attestCompleteRecording: true, attestAudioReviewed: true, attestReferenceAccurate: true } });
      qc.invalidateQueries({ queryKey: getGetAssessmentReviewQueryKey(attemptId) });
      qc.invalidateQueries({ queryKey: getListAssessmentReviewQueueQueryKey() });
    } catch (e) { setMsg(errorMessage(e, tr("تعذّر الحفظ."))); }
  };
  const open = a.status === 'pending';
  return (
    <li className="paper-card p-5">
      <p className="font-arabic text-lg">{a.prompt}</p>
      <p dir="rtl" className="mt-2 rounded-xl bg-muted p-3 font-arabic text-lg leading-9"><span className="font-ui text-xs text-muted-foreground">{tr("المرجع:")}{' '}</span>{a.referenceText}</p>
      {!open && <p className="mt-2 font-ui text-sm">{a.status === 'scored' ? tr("سُجّل التقييم.") : tr("عُلّم بمشكلة تقنية.")}</p>}
      {open && (
        <div className="mt-3 space-y-3">
          {audio.url ? <audio controls src={audio.url} className="w-full" /> : <p className="font-ui text-sm">{audio.err ? tr("تعذّر تحميل الصوت.") : a.audioAvailable ? tr("جارٍ تحميل الصوت...") : tr("لا صوت متاح.")}</p>}
          <textarea dir="rtl" rows={3} value={transcriptText} onChange={(e) => setTr(e.target.value)} placeholder={tr("اكتب ما سمعته فعلاً كما نُطق")} className="w-full rounded-xl border bg-background p-3 font-arabic text-lg leading-9" />
          <label className="flex gap-2 font-ui text-xs"><input type="checkbox" checked={heard} onChange={(e) => setHeard(e.target.checked)} />{tr("استمعت إلى التسجيل كاملاً من أوله إلى آخره")}</label>
          <label className="flex gap-2 font-ui text-xs"><input type="checkbox" checked={ref} onChange={(e) => setRef(e.target.checked)} />{tr("راجعت النص المرجعي وهو صحيح")}</label>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => send(false)} disabled={!heard || !ref || !transcriptText.trim() || adj.isPending} className="rounded-full bg-secondary px-5 py-2 font-ui text-sm font-bold text-secondary-foreground disabled:opacity-50">{tr("سجّل ما سمعت")}</button>
            <input value={issue} onChange={(e) => setIssue(e.target.value)} placeholder={tr("وصف المشكلة التقنية")} className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 font-ui text-sm" />
            <button onClick={() => send(true)} disabled={!heard || !ref || !issue.trim() || adj.isPending} className="rounded-full border px-5 py-2 font-ui text-sm font-bold disabled:opacity-50">{tr("غير قابل للتقييم تقنياً")}</button>
          </div>
        </div>
      )}
      {msg && <p role="alert" className="mt-2 font-ui text-sm text-secondary">{msg}</p>}
    </li>
  );
}

function Detail({ id, onBack }: { id: string; onBack: () => void }) {
  const q = useGetAssessmentReview(id, { query: { queryKey: getGetAssessmentReviewQueryKey(id) } });
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="font-ui font-bold text-secondary underline">{tr("رجوع إلى القائمة")}</button>
      {q.isLoading ? <LoadingList rows={3} /> : q.isError || !q.data ? <ErrorState onRetry={() => q.refetch()} /> : <ul className="space-y-4">{q.data.answers.map((a) => <Answer key={a.questionId} attemptId={id} a={a} />)}</ul>}
    </div>
  );
}

export default function AdminAssessments() {
  usePageMeta(tr("مراجعة الاختبارات | مَتِين"), tr("قائمة المراجعة البشرية."));
  const { isLoaded, isSignedIn, ready } = useAuthReady();
  const access = useGetAssessmentReviewerAccess({ query: { enabled: ready, queryKey: getGetAssessmentReviewerAccessQueryKey(), refetchInterval: 30_000, staleTime: 0 } });
  const authorized = ready && !access.isError && access.data?.authorized === true;
  const queue = useListAssessmentReviewQueue({ query: { enabled: authorized, queryKey: getListAssessmentReviewQueueQueryKey(), refetchInterval: 30_000, staleTime: 0 } });
  const [sel, setSel] = useState<string | null>(null);
  if (isLoaded && !isSignedIn) return <Redirect to="/sign-in" />;
  return (
    <div className="mx-auto min-h-[100dvh] max-w-3xl bg-background px-5 py-10">
      <PageHeader eyebrow={tr("المراجعة البشرية")} title={tr("اختبارات بانتظار الاستماع")} />
      {authorized && <p className="mb-5 font-ui text-sm text-muted-foreground">{tr("المراجعون المخوّلون مسؤولون عن هذه القائمة. المهلة المستهدفة ٤٨ ساعة من التسليم؛ عالج الأقدم أولاً، وأبلغ مسؤول التشغيل عند تعذّر التغطية. التأخر ليس درجة صفر.")}</p>}
      {access.isLoading || !isLoaded ? <LoadingList /> : access.isError ? <ErrorState onRetry={() => access.refetch()} /> : !authorized ? (
        <EmptyState title={tr("غير مخوّل")}>{tr("هذه الصفحة للمراجعين المخوّلين من الخادم فقط.")}{' '}<Link href="/" className="font-bold text-secondary underline">{tr("الرئيسية")}</Link></EmptyState>
      ) : sel ? <Detail id={sel} onBack={() => setSel(null)} /> : queue.isLoading ? <LoadingList /> : queue.isError ? <ErrorState onRetry={() => queue.refetch()} /> : !queue.data?.length ? (
        <EmptyState title={tr("لا اختبارات معلّقة")}>{tr("لا توجد إجابات تنتظر المراجعة.")}</EmptyState>
      ) : (
        <ul className="space-y-3">{queue.data.map((i) => (
          <li key={i.attemptId}><button onClick={() => setSel(i.attemptId)} className="paper-card w-full p-5 text-start">
            <p className="font-ui font-bold">{num(i.pendingAnswers)}{' '}{tr("إجابات معلّقة")}</p><p className="font-ui text-xs text-muted-foreground">{tr("سُلّم")}{' '}{fmtDate(i.submittedAt)}{' '}{tr("· موعد المراجعة المستهدف")}{' '}{fmtDate(i.reviewDueAt)}</p>
            {i.overdue && <p className="mt-2 font-ui text-sm font-bold text-secondary">{tr("متأخر عن مهلة المراجعة — يحتاج متابعة مسؤول التشغيل")}</p>}</button></li>
        ))}</ul>
      )}
    </div>
  );
}
