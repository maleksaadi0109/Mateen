import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListScheduledReviewsQueryKey, getGetAssessmentSummaryQueryKey, useCompleteScheduledReview, useListScheduledReviews } from '@workspace/api-client-react';
import type { ScheduledReview } from '@workspace/api-client-react';
import { CalendarCheck } from 'lucide-react';
import { EmptyState, ErrorState, LoadingList } from '@/components/mateen/bits';
import { errorMessage } from '@/lib/assessment';
import { num } from '@/lib/mateen';

function Row({ r, outcome, onCompleted }: {
  r: ScheduledReview;
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
    } catch (e) { setMsg(errorMessage(e, 'تعذّر الإرسال. أعد المحاولة.')); }
  };
  const due = r.status === 'due';
  return (
    <li className="paper-card p-5" data-testid={`review-${r.id}`}>
      <p className="font-ui text-sm font-bold text-secondary">الحديث {num(r.hadithNumber)} · بعد {num(r.intervalDays)} يوماً · {new Date(r.dueAt).toLocaleDateString('ar')}</p>
      <p dir="rtl" className="mt-2 font-arabic text-lg leading-9">{r.prompt}</p>
      {r.sourceMistake && <p className="mt-1 font-ui text-xs text-muted-foreground">سبب الجدولة: {r.sourceMistake}</p>}
      {r.status === 'technical_review' && <p className="mt-2 font-ui text-sm">قيد مراجعة تقنية.</p>}
      {r.status === 'completed' && <p className="mt-2 font-ui text-sm">اكتملت هذه المراجعة.</p>}
      {due && !outcome && (
        <div className="mt-3 space-y-2">
          <textarea dir="rtl" rows={3} value={text} onChange={(e) => setText(e.target.value)} className="w-full rounded-xl border bg-background p-3 font-arabic text-lg leading-9" aria-label="اكتب الحديث من حفظك" />
          <button onClick={submit} disabled={!text.trim() || done.isPending} className="rounded-full bg-secondary px-5 py-2 font-ui text-sm font-bold text-secondary-foreground disabled:opacity-50">{done.isPending ? 'جارٍ الإرسال...' : 'أرسل الإجابة'}</button>
        </div>
      )}
      {outcome && (
        <div role="status" aria-live="polite" className="mt-3 rounded-xl border p-3 font-arabic text-lg leading-9" data-testid="review-outcome">
          <p className="font-ui text-sm font-bold">{outcome.correctness === null ? 'قيد المراجعة التقنية؛ لا حكم بعد.' : outcome.correctness ? 'إجابتك مطابقة للمرجع.' : 'إجابتك لا تطابق المرجع.'}</p>
          {outcome.referenceText && <p dir="rtl">{outcome.referenceText}</p>}
          {outcome.feedback && <p className="font-ui text-sm">{outcome.feedback}</p>}
          {outcome.nextDueAt && <p className="font-ui text-sm">الموعد التالي: {new Date(outcome.nextDueAt).toLocaleString('ar')}</p>}
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
  if (q.isLoading && rows.length === 0) return <LoadingList rows={2} />;
  if (q.isError && rows.length === 0) return <ErrorState onRetry={() => q.refetch()} />;
  if (rows.length === 0) return <EmptyState icon={<CalendarCheck size={28} />} title="لا مراجعات مستحقة حالياً">تظهر هنا المراجعات المبنية على أخطاء مؤكدة بعد التصحيح، وليس علامات الدراسة الذاتية.</EmptyState>;
  return <ul className="space-y-4">{rows.map((r) => <Row key={r.id} r={r} outcome={outcomes[r.id] ?? null} onCompleted={(result) => setOutcomes((previous) => ({ ...previous, [result.id]: result }))} />)}</ul>;
}
