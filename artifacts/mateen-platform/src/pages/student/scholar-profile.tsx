import { fmt } from '@/lib/i18n';
import { tr } from '@/lib/i18n';
import { getGetScholarsQueryKey, useGetScholars } from '@workspace/api-client-react';
import { Link, useParams } from 'wouter';
import { ArrowRight, ScrollText } from 'lucide-react';
import { EmptyState, ErrorState, LoadingList, Notice } from '@/components/mateen/bits';
import { usePageMeta } from '@/lib/mateen';

const back = 'inline-flex items-center gap-2 rounded-full border px-4 py-2 font-ui text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

export default function ScholarProfilePage() {
  const { teacherId } = useParams<{ teacherId: string }>();
  const q = useGetScholars({ query: { enabled: true, queryKey: getGetScholarsQueryKey(), staleTime: 30_000, refetchOnMount: 'always' } });
  const s = q.data?.find((x) => x.id === teacherId);
  usePageMeta(fmt("{a} | مَتِين", "{a} | Mateen", { a: s?.name ?? tr("ملف الشيخ") }), tr("ملف تعريفي بمعلم معتمد."));
  return (
    <div className="space-y-6">
      <Link href="/student/scholars" className={back} data-testid="link-back-scholars"><ArrowRight size={16} />{' '}{tr("العودة إلى دليل المشايخ")}</Link>
      {q.isLoading ? <LoadingList rows={2} /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !s ? (
        <EmptyState icon={<ScrollText size={28} />} title={tr("لم نجد هذا الشيخ")}>{tr("قد لا يكون معتمداً الآن، أو أن الرابط غير صحيح.")}</EmptyState>
      ) : (
        <>
          <article className="paper-card p-6 md:p-10" data-testid={`profile-scholar-${s.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="font-display text-3xl font-bold md:text-4xl" data-testid="text-page-title">{s.name}</h1>
              <span className="rounded-full border px-3 py-1 font-ui text-xs font-bold">{s.available ? tr("متاح") : tr("غير متاح حالياً")}</span>
            </div>
            <h2 className="mt-6 font-ui text-sm font-semibold text-secondary">{tr("التخصصات")}</h2>
            <p className="mt-1 font-ui font-semibold">{s.specialties}</p>
            <h2 className="mt-6 font-ui text-sm font-semibold text-secondary">{tr("نبذة")}</h2>
            <p className="mt-1 whitespace-pre-line font-arabic text-lg leading-loose text-muted-foreground">{s.biography}</p>
          </article>
          <Notice tone="brown" title={tr("معلومات تعريفية فقط")}>{tr("لا تمكن مراسلة الشيخ مباشرة. يصل سؤالك إليه عبر إحالة من المساعد العلمي عند تفعيله وبموافقتك.")}</Notice>
        </>
      )}
    </div>
  );
}
