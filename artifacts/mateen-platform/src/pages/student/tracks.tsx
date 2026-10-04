import { Link } from 'wouter';
import { getGetCatalogQueryKey, useGetCatalog } from '@workspace/api-client-react';
import { Lock, ArrowLeft } from 'lucide-react';
import { EmptyState, ErrorState, LoadingList, PageHeader, Reveal } from '@/components/mateen/bits';
import BookCover from '@/components/mateen/book-cover';
import { num, usePageMeta } from '@/lib/mateen';
import { cn } from '@/lib/utils';

export default function TracksPage() {
  usePageMeta('المسارات | مَتِين', 'المتون المتاحة والمقبلة في مَتِين.');
  const q = useGetCatalog({ query: { enabled: true, queryKey: getGetCatalogQueryKey() } });
  return (
    <div>
      <PageHeader eyebrow="المسارات" title="المتون والمستويات">متن واحد مفتوح اليوم. أما المتون الأخرى فمغلقة بوسم «قريباً» ولا يمكن دراستها قبل نشرها.</PageHeader>
      {q.isLoading ? <LoadingList rows={4} /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="لا متون في الفهرس">سيظهر الفهرس هنا عند توفره.</EmptyState> : (
        <div className="grid gap-5 lg:grid-cols-2">
          {q.data.map((t, i) => {
            const open = t.status === 'available' && t.id === 'nawawi';
            const body = (
              <div className="flex gap-5">
                <div className="mateen-track-cover w-24 shrink-0 drop-shadow-md sm:w-28">
                  <BookCover index={i} locked={!open} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="font-ui text-xs font-semibold text-secondary">{t.track} · {t.level}</p><h3 className="mt-2 font-display text-2xl font-bold">{t.title}</h3></div>
                    {!open && <Lock size={20} className="shrink-0 text-muted-foreground" aria-hidden />}
                  </div>
                  <p className="mt-3 font-arabic text-base leading-loose text-muted-foreground">{t.description}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="font-ui text-sm text-muted-foreground">{open ? `${num(t.hadithCount)} موضعاً` : ''}</span>
                    {open ? <span className="inline-flex items-center gap-1.5 font-ui text-sm font-bold text-secondary">خريطة المراحل <ArrowLeft size={15} /></span>
                      : <span className="rounded-full border border-dashed border-muted-foreground/50 px-3 py-1 font-ui text-xs font-bold text-muted-foreground">قريباً</span>}
                  </div>
                </div>
              </div>
            );
            return (
              <Reveal key={t.id} delay={i * 0.08}>
                {open ? (
                  <Link href="/student/learn/nawawi" className="mateen-track-card paper-card group block p-6" data-testid={`card-track-${t.id}`}>{body}</Link>
                ) : (
                  <div aria-disabled="true" className="paper-card p-6 opacity-70" data-testid={`card-track-${t.id}`}>{body}</div>
                )}
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}
