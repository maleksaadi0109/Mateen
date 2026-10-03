import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAssessmentSummaryQueryKey, getGetAssessmentPolicyQueryKey,
  useGetAssessmentPolicy, useGetAssessmentSummary, useStartAssessment,
  useGetAssessmentCoverage,
  getGetAssessmentCoverageQueryKey,
} from '@workspace/api-client-react';
import { ClipboardCheck } from 'lucide-react';
import { EmptyState, ErrorState, LoadingList, Notice, PageHeader } from '@/components/mateen/bits';
import { errorMessage, tabSessionId } from '@/lib/assessment';
import { fmtDate, num, usePageMeta } from '@/lib/mateen';

export default function ExamsPage() {
  usePageMeta('الاختبارات | مَتِين', 'اختبار المستوى التمهيدي في الأربعين النووية.');
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const policy = useGetAssessmentPolicy({ query: { queryKey: getGetAssessmentPolicyQueryKey() } });
  const summary = useGetAssessmentSummary({ query: { queryKey: getGetAssessmentSummaryQueryKey() } });
  const start = useStartAssessment();
  const coverage = useGetAssessmentCoverage({ query: { queryKey: getGetAssessmentCoverageQueryKey(), refetchInterval: 30_000, staleTime: 0 } });
  const [err, setErr] = useState<string | null>(null);

  if (policy.isLoading || summary.isLoading) return <div><PageHeader eyebrow="الاختبارات" title="اختبار المستوى" /><LoadingList rows={3} /></div>;
  if (policy.isError || summary.isError || !policy.data || !summary.data) return <ErrorState onRetry={() => { policy.refetch(); summary.refetch(); }} />;
  const p = policy.data, s = summary.data;
  const retryAt = s.retryAvailableAt ? new Date(s.retryAvailableAt) : null;
  const waiting = !!retryAt && retryAt.getTime() > Date.now();

  const begin = async () => {
    setErr(null);
    try {
      const a = await start.mutateAsync({ data: { sessionId: tabSessionId() } });
      qc.invalidateQueries({ queryKey: getGetAssessmentSummaryQueryKey() });
      nav(`/student/exams/${a.id}`);
    } catch (e) { setErr(errorMessage(e, 'تعذّر بدء الاختبار. أعد المحاولة.')); }
  };

  return (
    <div>
      <PageHeader eyebrow="الاختبارات" title="اختبار المستوى التمهيدي">{p.level} · الأربعون النووية. يمكنك البدء مباشرة دون اشتراط إكمال الدراسة.</PageHeader>
      <div className="space-y-5">
        <section className="paper-card p-6">
          <h2 className="font-display text-xl font-bold">قواعد الاختبار</h2>
          <ul className="mt-3 list-disc space-y-1 pr-5 font-arabic text-lg leading-9">
            <li>{num(p.questions)} سؤالاً: {num(p.writtenQuestions)} تحريرية و{num(p.oralQuestions)} شفوية، بدرجة لكل سؤال.</li>
            <li>مدة {num(p.activeMinutes)} دقيقة نشطة يحسبها الخادم؛ يتوقف العدّ عند انقطاع الاتصال.</li>
            <li>النجاح بمجموع {num(p.passScore)} من {num(p.questions)}، دون حد أدنى لكل قسم.</li>
            <li>عند عدم الاجتياز تُعاد المحاولة بعد {num(p.retryHours)} ساعة. الفشل التقني لا يفرض انتظاراً.</li>
            <li>التسجيل الصوتي اختياري وخاص ويُحتفظ به {num(p.audioRetentionDays)} يوماً، ويمكنك حذفه. يستمع إليه مراجع بشري، والتعرّف الآلي للتدريب فقط.</li>
            <li>تُعرض الدرجة والأخطاء المؤكدة بعد اكتمال المراجعة فقط.</li>
            <li>المهلة المستهدفة للمراجعة البشرية {num(coverage.data?.responseHours ?? 48)} ساعة من التسليم؛ التأخر لا يُحوّل الانتظار إلى درجة صفر.</li>
          </ul>
          {p.sourceStatus === 'retrieved_pending_review' && <p className="mt-3 font-ui text-xs text-muted-foreground">نص الأسئلة مأخوذ من مصدر ما زال قيد مراجعة الاعتماد.</p>}
        </section>

        {s.completedAvailableContent && <Notice title="أتممت المحتوى المتاح">اجتزت المستوى التمهيدي على المحتوى المنشور فقط. لا مستوى تالياً منشوراً بعد.</Notice>}
        {s.latestResult && (
          <Notice title="آخر نتيجة">
            {s.latestResult.technicalReview ? 'قيد مراجعة تقنية؛ لا درجة بعد.' : `${num(s.latestResult.score)} من ${num(p.questions)} · ${s.latestResult.passed ? 'اجتياز' : 'لم تجتز'}`} · {fmtDate(s.latestResult.completedAt)}
          </Notice>
        )}
        {err && <p role="alert" className="font-ui text-sm font-semibold text-secondary">{err}</p>}
        {!p.sourceStatus || !s.available ? (
          <EmptyState icon={<ClipboardCheck size={28} />} title="الاختبار غير متاح الآن">لم يُفعَّل الاختبار من الخادم بعد.</EmptyState>
        ) : s.activeAttempt ? (
          <Link href={`/student/exams/${s.activeAttempt}`} className="inline-block rounded-full bg-secondary px-7 py-3 font-ui font-bold text-secondary-foreground" data-testid="button-resume-exam">متابعة المحاولة الجارية</Link>
        ) : waiting ? (
          <Notice title="إعادة المحاولة">تُتاح المحاولة التالية في {retryAt!.toLocaleString('ar')} بحسب ساعة الخادم.</Notice>
        ) : coverage.isLoading ? (
          <LoadingList rows={1} />
        ) : coverage.isError ? (
          <ErrorState onRetry={() => coverage.refetch()} />
        ) : !coverage.data?.available ? (
          <Notice title="المراجعة البشرية غير متاحة الآن">
            لا يوجد مراجع آخر مخوّل؛ بدء الاختبارات الجديدة موقوف مؤقتاً، دون تسجيل درجة أو فرض انتظار لإعادة المحاولة. يمكنك مواصلة <Link href="/student/study/nawawi" className="font-bold underline">التدريب التجريبي</Link>.
          </Notice>
        ) : (
          <button onClick={begin} disabled={start.isPending} className="rounded-full bg-secondary px-7 py-3 font-ui font-bold text-secondary-foreground disabled:opacity-50" data-testid="button-start-exam">{start.isPending ? 'جارٍ البدء...' : 'ابدأ الاختبار'}</button>
        )}
      </div>
    </div>
  );
}
