import { Link } from 'wouter';
import { getGetAssessmentSummaryQueryKey, getGetCatalogQueryKey, useGetAssessmentSummary, useGetCatalog } from '@workspace/api-client-react';
import { Lock, ArrowLeft } from 'lucide-react';
import { EmptyState, ErrorState, LoadingList, PageHeader, StarMark } from '@/components/mateen/bits';
import { num, usePageMeta } from '@/lib/mateen';
import { cn } from '@/lib/utils';

export default function TracksPage() {
  usePageMeta('المسارات | مَتِين', 'المتون المتاحة والمقبلة في مَتِين.');
  const q = useGetCatalog({ query: { enabled: true, queryKey: getGetCatalogQueryKey() } });
  const asm = useGetAssessmentSummary({ query: { queryKey: getGetAssessmentSummaryQueryKey() } });
  return (
    <div>
      <PageHeader eyebrow="المسارات" title="المتون والمستويات">متن واحد مفتوح اليوم. أما المتون الأخرى فمغلقة بوسم «قريباً» ولا يمكن دراستها قبل نشرها.</PageHeader>
      {q.isLoading ? <LoadingList rows={4} /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="لا متون في الفهرس">سيظهر الفهرس هنا عند توفره.</EmptyState> : (
        <div className="grid gap-5 md:grid-cols-2">
          {q.data.map((t) => {
            const open = t.status === 'available';
            const body = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-ui text-xs font-semibold text-secondary">{t.track} · {t.level}</p><h3 className="mt-2 font-display text-2xl font-bold">{t.title}</h3></div>
                  {open ? <StarMark size={30} className="text-secondary" /> : <Lock size={22} className="text-muted-foreground" />}
                </div>
                {t.id === 'nawawi' && asm.data?.completedAvailableContent && <span className="mt-2 inline-block rounded-full border border-secondary/50 px-3 py-1 font-ui text-xs font-bold text-secondary" data-testid="badge-level-passed">اجتاز المستوى التمهيدي (موثّق من الخادم)</span>}
                <p className="mt-3 font-arabic text-base leading-loose text-muted-foreground">{t.description}</p>
                <div className="mt-5 flex items-center justify-between">
                  <span className="font-ui text-sm text-muted-foreground">{open ? `${num(t.hadithCount)} موضعاً` : ''}</span>
                  {open ? <span className="inline-flex items-center gap-1.5 font-ui text-sm font-bold text-secondary">ادخل <ArrowLeft size={15} /></span>
                    : <span className="rounded-full border border-dashed border-muted-foreground/50 px-3 py-1 font-ui text-xs font-bold text-muted-foreground">قريباً</span>}
                </div>
              </>
            );
            return open ? (
              <Link key={t.id} href={`/student/study/${t.id}`} className="paper-card block p-7 transition hover:-translate-y-1" data-testid={`card-track-${t.id}`}>{body}</Link>
            ) : (
              <div key={t.id} aria-disabled="true" className={cn('paper-card p-7 opacity-70')} data-testid={`card-track-${t.id}`}>{body}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
