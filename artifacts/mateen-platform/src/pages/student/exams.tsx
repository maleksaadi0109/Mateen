import { fmt } from '@/lib/i18n';
import { tr } from '@/lib/i18n';
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
  usePageMeta(tr("الاختبارات | مَتِين"), tr("اختبار المستوى التمهيدي في الأربعين النووية."));
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const policy = useGetAssessmentPolicy({ query: { queryKey: getGetAssessmentPolicyQueryKey() } });
  const summary = useGetAssessmentSummary({ query: { queryKey: getGetAssessmentSummaryQueryKey() } });
  const start = useStartAssessment();
  const coverage = useGetAssessmentCoverage({ query: { queryKey: getGetAssessmentCoverageQueryKey(), refetchInterval: 30_000, staleTime: 0 } });
  const [err, setErr] = useState<string | null>(null);

  if (policy.isLoading || summary.isLoading) return <div><PageHeader eyebrow={tr("الاختبارات")} title={tr("اختبار المستوى")} /><LoadingList rows={3} /></div>;
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
    } catch (e) { setErr(errorMessage(e, tr("تعذّر بدء الاختبار. أعد المحاولة."))); }
  };

  return (
    <div>
      <PageHeader eyebrow={tr("الاختبارات")} title={tr("اختبار المستوى التمهيدي")}>{p.level}{' '}{tr("· الأربعون النووية. يمكنك البدء مباشرة دون اشتراط إكمال الدراسة.")}</PageHeader>
      <div className="space-y-5">
        <section className="paper-card p-6">
          <h2 className="font-display text-xl font-bold">{tr("قواعد الاختبار")}</h2>
          <ul className="mt-3 list-disc space-y-1 ps-5 font-arabic text-lg leading-9">
            <li>{num(p.questions)}{' '}{tr("سؤالاً:")}{' '}{num(p.writtenQuestions)}{' '}{tr("تحريرية و")}{num(p.oralQuestions)}{' '}{tr("شفوية، بدرجة لكل سؤال.")}</li>
            <li>{tr("مدة")}{' '}{num(p.activeMinutes)}{' '}{tr("دقيقة نشطة يحسبها الخادم؛ يتوقف العدّ عند انقطاع الاتصال.")}</li>
            <li>{tr("النجاح بمجموع")}{' '}{num(p.passScore)}{' '}{tr("من")}{' '}{num(p.questions)}{tr("، دون حد أدنى لكل قسم.")}</li>
            <li>{tr("عند عدم الاجتياز تُعاد المحاولة بعد")}{' '}{num(p.retryHours)}{' '}{tr("ساعة. الفشل التقني لا يفرض انتظاراً.")}</li>
            <li>{tr("التسجيل الصوتي اختياري وخاص ويُحتفظ به")}{' '}{num(p.audioRetentionDays)}{' '}{tr("يوماً، ويمكنك حذفه. يستمع إليه مراجع بشري، والتعرّف الآلي للتدريب فقط.")}</li>
            <li>{tr("تُعرض الدرجة والأخطاء المؤكدة بعد اكتمال المراجعة فقط.")}</li>
            <li>{tr("المهلة المستهدفة للمراجعة البشرية")}{' '}{num(coverage.data?.responseHours ?? 48)}{' '}{tr("ساعة من التسليم؛ التأخر لا يُحوّل الانتظار إلى درجة صفر.")}</li>
          </ul>
          {p.sourceStatus === 'retrieved_pending_review' && <p className="mt-3 font-ui text-xs text-muted-foreground">{tr("نص الأسئلة مأخوذ من مصدر ما زال قيد مراجعة الاعتماد.")}</p>}
        </section>

        {s.completedAvailableContent && <Notice title={tr("أتممت المحتوى المتاح")}>{tr("اجتزت المستوى التمهيدي على المحتوى المنشور فقط. لا مستوى تالياً منشوراً بعد.")}</Notice>}
        {s.latestResult && (
          <Notice title={tr("آخر نتيجة")}>
            {s.latestResult.technicalReview ? tr("قيد مراجعة تقنية؛ لا درجة بعد.") : fmt("{a} من {b} · {c}", "{a} of {b} · {c}", { a: num(s.latestResult.score), b: num(p.questions), c: s.latestResult.passed ? tr("اجتياز") : tr("لم تجتز") })} · {fmtDate(s.latestResult.completedAt)}
          </Notice>
        )}
        {err && <p role="alert" className="font-ui text-sm font-semibold text-secondary">{err}</p>}
        {!p.sourceStatus || !s.available ? (
          <EmptyState icon={<ClipboardCheck size={28} />} title={tr("الاختبار غير متاح الآن")}>{tr("لم يُفعَّل الاختبار من الخادم بعد.")}</EmptyState>
        ) : s.activeAttempt ? (
          <Link href={`/student/exams/${s.activeAttempt}`} className="inline-block rounded-full bg-secondary px-7 py-3 font-ui font-bold text-secondary-foreground" data-testid="button-resume-exam">{tr("متابعة المحاولة الجارية")}</Link>
        ) : waiting ? (
          <Notice title={tr("إعادة المحاولة")}>{tr("تُتاح المحاولة التالية في")}{' '}{retryAt!.toLocaleString('ar')}{' '}{tr("بحسب ساعة الخادم.")}</Notice>
        ) : coverage.isLoading ? (
          <LoadingList rows={1} />
        ) : coverage.isError ? (
          <ErrorState onRetry={() => coverage.refetch()} />
        ) : !coverage.data?.available ? (
          <Notice title={tr("المراجعة البشرية غير متاحة الآن")}>{tr("لا يوجد مراجع آخر مخوّل؛ بدء الاختبارات الجديدة موقوف مؤقتاً، دون تسجيل درجة أو فرض انتظار لإعادة المحاولة. يمكنك مواصلة")}{' '}<Link href="/student/study/nawawi" className="font-bold underline">{tr("التدريب التجريبي")}</Link>.
          </Notice>
        ) : (
          <button onClick={begin} disabled={start.isPending} className="rounded-full bg-secondary px-7 py-3 font-ui font-bold text-secondary-foreground disabled:opacity-50" data-testid="button-start-exam">{start.isPending ? tr("جارٍ البدء...") : tr("ابدأ الاختبار")}</button>
        )}
      </div>
    </div>
  );
}
