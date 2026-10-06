import { tr } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getGetDailyPlanQueryKey, getListScheduledReviewsQueryKey, getGetAssessmentSummaryQueryKey, useCompleteScheduledReview, useListScheduledReviews } from '@workspace/api-client-react';
import type { ScheduledReview } from '@workspace/api-client-react';
import { CalendarCheck } from 'lucide-react';
import { EmptyState, ErrorState, LoadingList } from '@/components/mateen/bits';
import { errorMessage } from '@/lib/assessment';
import { num } from '@/lib/mateen';

function Row({ r, outcome, onCompleted, selected }: {
  r: ScheduledReview;
  selected?: boolean;
  outcome: ScheduledReview | null;
  onCompleted: (result: ScheduledReview) => void;
}) {
  const qc = useQueryClient();
  const done = useCompleteScheduledReview();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const submit = async () => {
    setMsg(null);
    try {
      const res = await done.mutateAsync({ reviewId: r.id, data: { writtenAnswer: text, mutationId: crypto.randomUUID() } });
      setText(''); onCompleted(res);
      qc.invalidateQueries({ queryKey: getListScheduledReviewsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetAssessmentSummaryQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDailyPlanQueryKey() });
    } catch (e) { setMsg(errorMessage(e, tr("تعذّر الإرسال. أعد المحاولة."))); }
  };
  const due = r.status === 'due';
  return (
    <li id={`review-${r.id}`} tabIndex={-1} className={`paper-card p-5 ${selected ? 'ring-2 ring-secondary' : ''}`} data-selected={selected ? 'true' : undefined} data-testid={`review-${r.id}`}>
      <p className="font-ui text-sm font-bold text-secondary">{tr("الحديث")}{' '}{num(r.hadithNumber)}{' '}{tr("· بعد")}{' '}{num(r.intervalDays)}{' '}{tr("يوماً ·")}{' '}{new Date(r.dueAt).toLocaleDateString('ar')}</p>
      <p dir="rtl" className="mt-2 font-arabic text-lg leading-9">{r.prompt}</p>
      {r.sourceMistake && <p className="mt-1 font-ui text-xs text-muted-foreground">{tr("سبب الجدولة:")}{' '}{r.sourceMistake}</p>}
      {r.status === 'technical_review' && <p className="mt-2 font-ui text-sm">{tr("قيد مراجعة تقنية.")}</p>}
      {r.status === 'completed' && <p className="mt-2 font-ui text-sm">{tr("اكتملت هذه المراجعة.")}</p>}
      {due && !outcome && (
        <div className="mt-3 space-y-2">
          <textarea dir="rtl" rows={3} value={text} onChange={(e) => setText(e.target.value)} className="w-full rounded-xl border bg-background p-3 font-arabic text-lg leading-9" aria-label={tr("اكتب الحديث من حفظك")} />
          <button onClick={submit} disabled={!text.trim() || done.isPending} className="rounded-full bg-secondary px-5 py-2 font-ui text-sm font-bold text-secondary-foreground disabled:opacity-50">{done.isPending ? tr("جارٍ الإرسال...") : tr("أرسل الإجابة")}</button>
        </div>
      )}
      {outcome && (
        <div role="status" aria-live="polite" className="mt-3 rounded-xl border p-3 font-arabic text-lg leading-9" data-testid="review-outcome">
          <p className="font-ui text-sm font-bold">{outcome.correctness === null ? tr("قيد المراجعة التقنية؛ لا حكم بعد.") : outcome.correctness ? tr("إجابتك مطابقة للمرجع.") : tr("إجابتك لا تطابق المرجع.")}</p>
          {outcome.referenceText && <p dir="rtl">{outcome.referenceText}</p>}
          {outcome.feedback && <p className="font-ui text-sm">{outcome.feedback}</p>}
          {outcome.nextDueAt && <p className="font-ui text-sm">{tr("الموعد التالي:")}{' '}{new Date(outcome.nextDueAt).toLocaleString('ar')}</p>}
        </div>
      )}
      {msg && <p role="status" className="mt-2 font-ui text-sm">{msg}</p>}
    </li>
  );
}

export function ScheduledReviews() {
  const q = useListScheduledReviews({ query: { queryKey: getListScheduledReviewsQueryKey() } });
  // The endpoint returns due items only. Keep acknowledged outcomes independently
  // so invalidating that list cannot unmount the student's completion feedback.
  const [outcomes, setOutcomes] = useState<Record<string, ScheduledReview>>({});
  const rows = [
    ...Object.values(outcomes),
    ...(q.data ?? []).filter((r) => !outcomes[r.id]),
  ];
  const [sp] = useSearchParams();
  const wanted = sp.get('review');
  const found = !!wanted && rows.some((r) => r.id === wanted);
  useEffect(() => {
    if (!found || !wanted) return;
    const el = document.getElementById(`review-${wanted}`);
    el?.scrollIntoView({ block: 'center' });
    el?.focus({ preventScroll: true });
  }, [found, wanted]);
  if (q.isLoading && rows.length === 0) return <LoadingList rows={2} />;
  if (q.isError && rows.length === 0) return <ErrorState onRetry={() => q.refetch()} />;
  if (rows.length === 0 && wanted) return <p role="status" className="rounded-xl border p-3 font-ui text-sm" data-testid="notice-review-not-due">{tr("المراجعة المطلوبة غير مستحقة الآن أو اكتملت.")}</p>;
  if (rows.length === 0) return <EmptyState icon={<CalendarCheck size={28} />} title={tr("لا مراجعات مستحقة حالياً")}>{tr("تظهر هنا المراجعات المبنية على أخطاء مؤكدة بعد التصحيح، وليس علامات الدراسة الذاتية.")}</EmptyState>;
  return <>{wanted && !found && !q.isLoading && <p role="status" className="mb-3 rounded-xl border p-3 font-ui text-sm" data-testid="notice-review-not-due">{tr("المراجعة المطلوبة غير مستحقة الآن أو اكتملت.")}</p>}<ul className="space-y-4">{rows.map((r) => <Row key={r.id} r={r} selected={r.id === wanted} outcome={outcomes[r.id] ?? null} onCompleted={(result) => setOutcomes((previous) => ({ ...previous, [result.id]: result }))} />)}</ul></>;
}
