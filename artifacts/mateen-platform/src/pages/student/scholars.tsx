import { getGetScholarsQueryKey, useGetScholars } from '@workspace/api-client-react';
import { ScrollText } from 'lucide-react';
import { EmptyState, ErrorState, LoadingList, Notice, PageHeader } from '@/components/mateen/bits';
import { usePageMeta } from '@/lib/mateen';

export default function ScholarsPage() {
  usePageMeta('المشايخ | مَتِين', 'دليل تعريفي بالمعلمين المعتمدين.');
  const q = useGetScholars({ query: { enabled: true, queryKey: getGetScholarsQueryKey() } });
  return (
    <div>
      <PageHeader eyebrow="المشايخ" title="دليل المشايخ">
        للتعريف فقط. لا تُرسل منه أسئلة مباشرة؛ يصل المعلم إلى سؤالك عبر إحالة من المساعد العلمي عند تفعيله.
      </PageHeader>
      {q.isLoading ? <LoadingList /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <EmptyState icon={<ScrollText size={28} />} title="لا مشايخ معتمدون بعد">يظهر هنا من اعتمدتهم المنصة فقط، بعد مراجعة مؤهلاتهم.</EmptyState>
      ) : (
        <div className="space-y-5">
          <Notice tone="brown" title="معلومات تعريفية">لا يمكنك مراسلة أي شيخ من هذه الصفحة.</Notice>
          <div className="grid gap-5 md:grid-cols-2">
            {q.data.map((s) => (
              <article key={s.id} className="paper-card p-7" data-testid={`card-scholar-${s.id}`}>
                <div className="flex items-center justify-between gap-3"><h3 className="font-display text-xl font-bold">{s.name}</h3>
                  <span className="rounded-full border px-3 py-1 font-ui text-xs font-bold">{s.available ? 'متاح' : 'غير متاح حالياً'}</span></div>
                <p className="mt-2 font-ui text-sm font-semibold text-secondary">{s.specialties}</p>
                <p className="mt-3 font-arabic leading-loose text-muted-foreground">{s.biography}</p>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
